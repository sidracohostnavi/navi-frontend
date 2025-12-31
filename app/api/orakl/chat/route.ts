// app/api/orakl/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface UsageRecord {
  id: string;
  user_id: string;
  window_start: string;
  window_end: string;
  replies_used: number;
  replies_cap: number;
}

interface UserProfile {
  profile_json: {
    patterns?: string[];
    themes?: string[];
    context?: string;
    last_updated?: string;
  };
}

// ============================================
// CONSTANTS
// ============================================
const PLAN_CONFIG = {
  free: {
    model: 'gpt-4o-mini',
    maxTokens: 450,
    maxContextMessages: 6,
    repliesCap: 3,
  },
  plus: {
    model: 'gpt-4o-mini',
    maxTokens: 900,
    maxContextMessages: 10,
    repliesCap: 300,
  },
  pro: {
    model: 'gpt-4o',
    maxTokens: 1600,
    maxContextMessages: 16,
    repliesCap: 1200,
  },
} as const;

const SYSTEM_PROMPT = `You are Orakl, a clarity companion helping users untangle confusing relationships, family dynamics, work situations, and thought loops.

RESPONSE STYLE:
1. First, mirror back their specifics in 1-3 lines to show you understood.
2. If context is thin, ask 2-4 targeted questions BEFORE any analysis. Never analyze without enough information.
3. Name patterns as hypotheses, not diagnoses. Use phrases like "This might be..." or "One pattern I notice..."
4. Clearly separate: FACTS (what actually happened) vs INTERPRETATIONS (meaning assigned) vs UNKNOWNS (what we don't know yet).
5. Distinguish responsibility (what someone can control/address) from guilt (unproductive self-blame).
6. Offer 2-4 grounded options, always including "do nothing" or "disengage" as valid choices.
7. End with ONE strong clarifying question.
8. Optionally add: "If you want: reality check / next 3 steps / boundary script / draft a message — tell me which."

TONE:
- Calm, precise, neutral
- Validating without inflaming or dramatizing
- Reality-based, grounded in what's observable
- NO spiritual, destiny, or "meant to be" language
- No toxic positivity or empty reassurance

SAFETY:
If someone mentions self-harm, suicide, violence toward others, or illegal intent:
- Acknowledge their pain briefly
- Do NOT engage with planning or methods
- Encourage professional help: "This sounds really heavy. A counselor or crisis line can give you real-time support that I can't. Would you consider reaching out?"
- Provide: National Suicide Prevention Lifeline: 988 (US), Crisis Text Line: Text HOME to 741741

Always end responses with:
---
*Not therapy, medical, or legal advice. For personal reflection only.*`;

// ============================================
// HELPER: Verify Turnstile CAPTCHA
// ============================================
async function verifyCaptcha(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set, skipping captcha verification');
    return true;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
      }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Captcha verification error:', error);
    return false;
  }
}

// ============================================
// HELPER: Distill memory from conversation
// ============================================
function distillMemory(
  existingProfile: UserProfile['profile_json'],
  userMessage: string,
  assistantResponse: string
): UserProfile['profile_json'] {
  const themes = new Set(existingProfile.themes || []);
  const patterns = new Set(existingProfile.patterns || []);
  
  const themeKeywords = ['family', 'work', 'relationship', 'anxiety', 'decision', 'boundary', 'conflict', 'parent', 'partner', 'boss', 'friend'];
  themeKeywords.forEach(keyword => {
    if (userMessage.toLowerCase().includes(keyword)) {
      themes.add(keyword);
    }
  });
  
  const patternMatch = assistantResponse.match(/pattern[s]?[^.]+\./gi);
  if (patternMatch) {
    patterns.add(patternMatch[0].slice(0, 100));
  }
  
  const limitedThemes = Array.from(themes).slice(-10);
  const limitedPatterns = Array.from(patterns).slice(-5);
  
  return {
    themes: limitedThemes,
    patterns: limitedPatterns,
    context: existingProfile.context,
    last_updated: new Date().toISOString(),
  };
}

// ============================================
// MAIN HANDLER
// ============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // ---- 1. VALIDATE ENVIRONMENT ----
    const supabaseUrl = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL;
    const supabaseServiceKey = process.env.ORAKL_SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Supabase not configured' },
        { status: 500 }
      );
    }

    if (!openaiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: OpenAI not configured' },
        { status: 500 }
      );
    }

    // ---- 2. PARSE REQUEST ----
    const body = await request.json();
    const { 
      messages, 
      sessionId, 
      captchaToken, 
      isFirstMessage,
      authToken 
    } = body as {
      messages: ChatMessage[];
      sessionId?: string;
      captchaToken?: string;
      isFirstMessage?: boolean;
      authToken: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ---- 3. VERIFY AUTH ----
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // ---- 4. VERIFY CAPTCHA (first message only) ----
    if (isFirstMessage && captchaToken) {
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      
      const captchaValid = await verifyCaptcha(captchaToken, ip);
      if (!captchaValid) {
        return NextResponse.json(
          { error: 'CAPTCHA verification failed. Please try again.' },
          { status: 400 }
        );
      }
    }

    // ---- 5. GET USER PLAN ----
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single();

    let plan: 'free' | 'plus' | 'pro' = 'free';
    if (subscription && 
        ['plus', 'pro'].includes(subscription.plan) && 
        subscription.status !== 'cancelled' &&
        (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())) {
      plan = subscription.plan as 'plus' | 'pro';
    }

    const config = PLAN_CONFIG[plan];

    // ---- 6. CHECK QUOTA (before OpenAI call) ----
    const { data: usageData, error: usageError } = await supabase
      .rpc('get_or_create_orakl_usage', { 
        p_user_id: userId, 
        p_cap: config.repliesCap 
      });

    if (usageError) {
      console.error('Usage check error:', usageError);
      return NextResponse.json(
        { error: 'Failed to check usage quota' },
        { status: 500 }
      );
    }

    const usage = usageData as UsageRecord;
    
    if (usage.replies_used >= usage.replies_cap) {
      const windowEnd = new Date(usage.window_end);
      const now = new Date();
      const daysUntilReset = Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return NextResponse.json({
        error: 'quota_exceeded',
        message: 'You have reached your message limit',
        usage: {
          used: usage.replies_used,
          cap: usage.replies_cap,
          daysUntilReset: Math.max(0, daysUntilReset),
          windowEnd: usage.window_end,
        },
        plan,
      }, { status: 429 });
    }

    // ---- 7. LOAD USER MEMORY ----
    const { data: profileData } = await supabase
      .from('orakl_user_profile')
      .select('profile_json')
      .eq('user_id', userId)
      .single();

    const userProfile: UserProfile['profile_json'] = profileData?.profile_json || {};

    const { data: insightsData } = await supabase
      .from('orakl_insights')
      .select('content, tags')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    let memoryContext = '';
    if (userProfile.themes?.length || userProfile.patterns?.length || insightsData?.length) {
      memoryContext = '\n\n[USER CONTEXT FROM PREVIOUS SESSIONS]\n';
      if (userProfile.themes?.length) {
        memoryContext += `Recurring themes: ${userProfile.themes.join(', ')}\n`;
      }
      if (userProfile.patterns?.length) {
        memoryContext += `Observed patterns: ${userProfile.patterns.join('; ')}\n`;
      }
      if (insightsData?.length) {
        memoryContext += `Recent insights: ${insightsData.map(i => i.content).join('; ')}\n`;
      }
      memoryContext += '[END USER CONTEXT]\n';
    }

    // ---- 8. PREPARE MESSAGES FOR OPENAI ----
    const limitedMessages = messages.slice(-config.maxContextMessages);
    
    const openaiMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + memoryContext },
      ...limitedMessages,
    ];

    // ---- 9. CALL OPENAI (dynamic import) ----
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: openaiKey });
    
    const completion = await openai.chat.completions.create({
      model: config.model,
      messages: openaiMessages,
      max_tokens: config.maxTokens,
      temperature: 0.7,
    });

    const assistantMessage = completion.choices[0]?.message?.content;
    
    if (!assistantMessage) {
      return NextResponse.json(
        { error: 'No response generated' },
        { status: 500 }
      );
    }

    // ---- 10. INCREMENT USAGE ----
    await supabase.rpc('increment_orakl_usage', { p_user_id: userId });

    // ---- 11. UPDATE SESSION METADATA ----
    const userMessageContent = messages[messages.length - 1]?.content || '';
    
    if (sessionId) {
      await supabase
        .from('orakl_sessions')
        .update({
          message_count: messages.length + 1,
          last_message_at: new Date().toISOString(),
          title: userMessageContent.slice(0, 50) + (userMessageContent.length > 50 ? '...' : ''),
        })
        .eq('id', sessionId)
        .eq('user_id', userId);
    }

    // ---- 12. DISTILL MEMORY ----
    const updatedProfile = distillMemory(userProfile, userMessageContent, assistantMessage);
    
    await supabase
      .from('orakl_user_profile')
      .upsert({
        user_id: userId,
        profile_json: updatedProfile,
      }, {
        onConflict: 'user_id',
      });

    // ---- 13. RETURN RESPONSE ----
    const newUsage = {
      used: usage.replies_used + 1,
      cap: usage.replies_cap,
      remaining: usage.replies_cap - usage.replies_used - 1,
      windowEnd: usage.window_end,
    };

    return NextResponse.json({
      message: assistantMessage,
      usage: newUsage,
      plan,
      processingTime: Date.now() - startTime,
    });

  } catch (error: unknown) {
    console.error('Orakl chat error:', error);
    
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}