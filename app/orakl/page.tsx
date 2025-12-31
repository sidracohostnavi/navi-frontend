// app/orakl/page.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getOraklBrowserClient } from '@/lib/supabaseOraklClient';

// ============================================
// TYPES
// ============================================
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Session {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  updatedAt: Date;
}

interface Usage {
  used: number;
  cap: number;
  remaining: number;
  resetDays: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

type Plan = 'free' | 'plus' | 'pro';

// ============================================
// CONSTANTS
// ============================================
const FREE_MESSAGE_LIMIT = 3;
const STORAGE_KEY = 'orakl_usage';
const SESSIONS_KEY = 'orakl_sessions';

// ============================================
// HELPER: Get usage from localStorage (MVP)
// ============================================
function getStoredUsage(): Usage {
  if (typeof window === 'undefined') {
    return { used: 0, cap: FREE_MESSAGE_LIMIT, remaining: FREE_MESSAGE_LIMIT, resetDays: 30 };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      const startDate = new Date(data.windowStart);
      const now = new Date();
      const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysPassed >= 30) {
        const newUsage = { used: 0, cap: data.cap || FREE_MESSAGE_LIMIT, remaining: data.cap || FREE_MESSAGE_LIMIT, resetDays: 30 };
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...newUsage, windowStart: now.toISOString() }));
        return newUsage;
      }
      
      return {
        used: data.used || 0,
        cap: data.cap || FREE_MESSAGE_LIMIT,
        remaining: (data.cap || FREE_MESSAGE_LIMIT) - (data.used || 0),
        resetDays: 30 - daysPassed,
      };
    }
  } catch (e) {
    console.error('Error reading usage:', e);
  }
  
  const newUsage = { used: 0, cap: FREE_MESSAGE_LIMIT, remaining: FREE_MESSAGE_LIMIT, resetDays: 30 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...newUsage, windowStart: new Date().toISOString() }));
  return newUsage;
}

function incrementUsage(): Usage {
  if (typeof window === 'undefined') {
    return { used: 1, cap: FREE_MESSAGE_LIMIT, remaining: FREE_MESSAGE_LIMIT - 1, resetDays: 30 };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : { used: 0, cap: FREE_MESSAGE_LIMIT, windowStart: new Date().toISOString() };
    
    data.used = (data.used || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
    const startDate = new Date(data.windowStart);
    const daysPassed = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      used: data.used,
      cap: data.cap || FREE_MESSAGE_LIMIT,
      remaining: Math.max(0, (data.cap || FREE_MESSAGE_LIMIT) - data.used),
      resetDays: Math.max(0, 30 - daysPassed),
    };
  } catch (e) {
    console.error('Error incrementing usage:', e);
    return { used: 1, cap: FREE_MESSAGE_LIMIT, remaining: FREE_MESSAGE_LIMIT - 1, resetDays: 30 };
  }
}

// ============================================
// HELPER: Session storage
// ============================================
function getStoredSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(SESSIONS_KEY);
    if (stored) {
      const sessions = JSON.parse(stored);
      return sessions.map((s: Session) => ({
        ...s,
        updatedAt: new Date(s.updatedAt),
        messages: s.messages.map((m: Message) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      }));
    }
  } catch (e) {
    console.error('Error reading sessions:', e);
  }
  return [];
}

function saveSession(session: Session, allSessions: Session[]): Session[] {
  if (typeof window === 'undefined') return allSessions;
  
  try {
    const existingIndex = allSessions.findIndex(s => s.id === session.id);
    let updatedSessions: Session[];
    
    if (existingIndex >= 0) {
      updatedSessions = [...allSessions];
      updatedSessions[existingIndex] = session;
    } else {
      updatedSessions = [session, ...allSessions];
    }
    
    // Keep only last 50 sessions
    updatedSessions = updatedSessions.slice(0, 50);
    
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions));
    return updatedSessions;
  } catch (e) {
    console.error('Error saving session:', e);
    return allSessions;
  }
}

function deleteSession(sessionId: string, allSessions: Session[]): Session[] {
  if (typeof window === 'undefined') return allSessions;
  
  try {
    const updatedSessions = allSessions.filter(s => s.id !== sessionId);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions));
    return updatedSessions;
  } catch (e) {
    console.error('Error deleting session:', e);
    return allSessions;
  }
}

// ============================================
// MOCK AI RESPONSE
// ============================================
function generateMockResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();
  
  if (lowerMessage.includes('loop') || lowerMessage.includes('stuck') || lowerMessage.includes('thinking')) {
    return `Let me make sure I understand: you're caught in a cycle of thoughts about this situation.

**Before I can help you break this loop, I need more context:**
1. What specific thought keeps returning?
2. When did this loop start — was there a trigger?
3. What have you already tried to move past it?
4. What's the worst-case scenario you're afraid of?

The more specific you can be, the better I can help you separate what's real from what's fear-based projection.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
  }
  
  if (lowerMessage.includes('family') || lowerMessage.includes('mother') || lowerMessage.includes('father') || lowerMessage.includes('parent')) {
    return `Family dynamics are often the deepest and most complex to untangle.

**To give you useful perspective, I need to understand:**
1. What specifically happened or is happening?
2. What role do you typically play in this family system?
3. What have you tried already, and how did it go?
4. What outcome would feel like a win for you — even a partial one?

One pattern I often notice: people get stuck trying to change others when the only real leverage is changing their own response.

If you want: reality check / next 3 steps / boundary script / draft a message — tell me which.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
  }
  
  if (lowerMessage.includes('work') || lowerMessage.includes('boss') || lowerMessage.includes('job') || lowerMessage.includes('colleague')) {
    return `Work dynamics can feel especially tricky because there's often a power imbalance at play.

**To help you think this through clearly:**
1. What's the specific situation or behavior that's bothering you?
2. What's at stake for you — reputation, sanity, money, principle?
3. What's your read on the other person's motivation?
4. What would "handling this well" look like to you?

Let's separate FACTS (what objectively happened) from INTERPRETATIONS (the meaning you're assigning) from UNKNOWNS (what you're assuming but don't actually know).

If you want: reality check / next 3 steps / boundary script / draft a message — tell me which.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
  }
  
  if (lowerMessage.includes('relationship') || lowerMessage.includes('partner') || lowerMessage.includes('dating')) {
    return `Relationships have layers — what's visible on the surface often isn't the real issue underneath.

**Help me understand the full picture:**
1. What happened, as factually as possible?
2. What's your interpretation of why it happened?
3. What do you need that you're not getting?
4. What are you afraid might be true?

I'll help you separate what's actually happening from what you're projecting, and figure out what's within your control to address.

If you want: reality check / next 3 steps / boundary script / draft a message — tell me which.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
  }
  
  if (lowerMessage.includes('decision') || lowerMessage.includes('choose') || lowerMessage.includes('decide')) {
    return `Decisions get hard when we're weighing things that can't really be compared — or when we're afraid of the wrong thing.

**Let's map this out:**
1. What are the actual options you're considering?
2. What's the fear behind each option?
3. What would you do if you knew you couldn't fail?
4. What would you do if no one else's opinion mattered?

Sometimes the "right" decision is obvious — we're just not ready to accept it yet.

If you want: reality check / next 3 steps / a pros-cons breakdown — tell me which.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
  }
  
  return `I want to help you untangle this, but I need more to work with.

**Tell me:**
1. What happened? (the facts, as specifically as possible)
2. Who's involved and what's their role?
3. What have you already tried?
4. What are you afraid might be true?
5. What outcome are you hoping for?

The more context you give me, the more useful I can be. I'm not here to give generic advice — I want to help you see *your specific situation* more clearly.

---
*Not therapy, medical, or legal advice. For personal reflection only.*`;
}

// ============================================
// TOAST COMPONENT
// ============================================
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm ${
            toast.type === 'error'
              ? 'bg-red-900/90 border border-red-700 text-red-100'
              : toast.type === 'success'
              ? 'bg-green-900/90 border border-green-700 text-green-100'
              : 'bg-slate-800/90 border border-slate-700 text-slate-100'
          }`}
        >
          <span className="text-sm">{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="text-current opacity-60 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================
// PAYWALL MODAL
// ============================================
function PaywallModal({
  isOpen,
  onClose,
  onUpgrade,
  isLoading,
  usage,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: 'plus' | 'pro') => void;
  isLoading: boolean;
  usage: Usage;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold text-slate-100 mb-2">
            Message Limit Reached
          </h2>
          
          <p className="text-slate-400 text-sm">
            You&apos;ve used all {usage.cap} free messages.
            <span className="block mt-1">
              Resets in {usage.resetDays} day{usage.resetDays !== 1 ? 's' : ''}.
            </span>
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => onUpgrade('plus')}
            disabled={isLoading}
            className="w-full p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-teal-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-slate-100">Plus</div>
                <div className="text-sm text-slate-400">300 messages / month</div>
              </div>
              <div className="text-teal-400 font-semibold">$9.99/mo</div>
            </div>
          </button>

          <button
            onClick={() => onUpgrade('pro')}
            disabled={isLoading}
            className="w-full p-4 bg-gradient-to-r from-teal-900/30 to-slate-800 hover:from-teal-900/50 border border-teal-500/30 hover:border-teal-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-slate-100 flex items-center gap-2">
                  Pro
                  <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded">Best value</span>
                </div>
                <div className="text-sm text-slate-400">1,200 messages / month + GPT-4o</div>
              </div>
              <div className="text-teal-400 font-semibold">$24.99/mo</div>
            </div>
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm mb-4">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-teal-500 rounded-full animate-spin" />
            Redirecting to checkout...
          </div>
        )}

        <button
          onClick={onClose}
          disabled={isLoading}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-400"
        >
          Wait for reset
        </button>
      </div>
    </div>
  );
}

// ============================================
// ORAKL LOGO
// ============================================
function OraklLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="url(#logoGrad)" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="5" fill="none" stroke="url(#logoGrad)" strokeWidth="1.5" />
      <path d="M10 22 Q16 18 22 22" fill="none" stroke="url(#logoGrad)" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="1.5" fill="#14b8a6" />
    </svg>
  );
}

// ============================================
// FORMAT DATE HELPER
// ============================================
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function OraklPage() {
  const router = useRouter();
  const supabase = getOraklBrowserClient();
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  
  // Session state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Usage state
  const [plan] = useState<Plan>('free');
  const [usage, setUsage] = useState<Usage>({ used: 0, cap: FREE_MESSAGE_LIMIT, remaining: FREE_MESSAGE_LIMIT, resetDays: 30 });
  
  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ============================================
  // TOAST HELPERS
  // ============================================
  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ============================================
  // AUTH CHECK
  // ============================================
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
          setIsAuthenticated(false);
          return;
        }
        
        setIsAuthenticated(true);
        setUserEmail(user.email || null);
        
        // Extract first name from user metadata
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const firstName = fullName.split(' ')[0] || null;
        setUserFirstName(firstName);
        
        setUsage(getStoredUsage());
        setSessions(getStoredSessions());
      } catch (err) {
        console.error('Auth error:', err);
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();
    
    // Check for checkout result
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    
    if (checkoutResult === 'success') {
      addToast('Upgrade successful! Enjoy Orakl.', 'success');
      window.history.replaceState({}, '', '/orakl');
    } else if (checkoutResult === 'cancelled') {
      addToast('Checkout cancelled', 'info');
      window.history.replaceState({}, '', '/orakl');
    }
  }, [supabase, addToast]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================
  // SESSION HANDLERS
  // ============================================
  const handleNewSession = useCallback(() => {
    setCurrentSession(null);
    setMessages([]);
    setInputValue('');
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setCurrentSession(session);
    setMessages(session.messages);
  }, []);

  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSessions = deleteSession(sessionId, sessions);
    setSessions(updatedSessions);
    
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setMessages([]);
    }
    
    addToast('Session deleted', 'info');
  }, [sessions, currentSession, addToast]);

  // ============================================
  // SEND MESSAGE
  // ============================================
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    // Check quota
    if (usage.remaining <= 0) {
      setShowPaywall(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateMockResponse(content),
        timestamp: new Date(),
      };
      
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setIsTyping(false);
      
      // Update usage
      const newUsage = incrementUsage();
      setUsage(newUsage);
      
      // Save or update session
      const sessionTitle = content.slice(0, 40) + (content.length > 40 ? '...' : '');
      const sessionPreview = content.slice(0, 60);
      
      const session: Session = currentSession 
        ? { ...currentSession, messages: finalMessages, updatedAt: new Date() }
        : {
            id: Date.now().toString(),
            title: sessionTitle,
            preview: sessionPreview,
            messages: finalMessages,
            updatedAt: new Date(),
          };
      
      const updatedSessions = saveSession(session, sessions);
      setSessions(updatedSessions);
      setCurrentSession(session);
      
      // Show paywall if limit reached
      if (newUsage.remaining <= 0) {
        setTimeout(() => setShowPaywall(true), 500);
      }
    }, 1500);
  }, [usage.remaining, messages, currentSession, sessions]);

  // ============================================
  // STRIPE CHECKOUT
  // ============================================
  const handleUpgrade = useCallback(async (selectedPlan: 'plus' | 'pro') => {
    setIsCheckoutLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plan: selectedPlan, 
          authToken: session?.access_token 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      addToast(error instanceof Error ? error.message : 'Checkout failed', 'error');
      setIsCheckoutLoading(false);
    }
  }, [supabase, addToast]);

  // ============================================
  // SIGN OUT
  // ============================================
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/orakl/login');
  }, [supabase, router]);

  // ============================================
  // KEY HANDLER
  // ============================================
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  }, [handleSendMessage, inputValue]);

  // ============================================
  // RENDER: Loading
  // ============================================
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ============================================
  // RENDER: Not authenticated
  // ============================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <OraklLogo className="w-16 h-16 mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-slate-100 mb-2">Sign in to Orakl</h1>
          <p className="text-slate-400 mb-6">
            Your private clarity companion for untangling thoughts, relationships, and decisions.
          </p>
          <button
            onClick={() => router.push('/orakl/login')}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Main UI
  // ============================================
  return (
    <>
      <div className="h-screen flex bg-slate-950 text-slate-100">
        {/* ============================================ */}
        {/* LEFT SIDEBAR - Sessions */}
        {/* ============================================ */}
        <aside
          className={`${
            sidebarOpen ? 'w-72' : 'w-0'
          } transition-all duration-300 bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-hidden flex-shrink-0`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <OraklLogo className="w-8 h-8" />
              <span className="text-lg font-semibold tracking-tight">Orakl</span>
              {plan !== 'free' && (
                <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded uppercase">
                  {plan}
                </span>
              )}
            </div>
            <button
              onClick={handleNewSession}
              className="w-full py-2.5 px-4 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 rounded-lg text-teal-400 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">
                No sessions yet
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`group w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                    currentSession?.id === session.id
                      ? 'bg-teal-600/20 border border-teal-500/30'
                      : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">
                        {session.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-1">
                        {session.preview}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {formatDate(session.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Usage indicator */}
          <div className="p-4 border-t border-slate-800">
            <div className="text-xs text-slate-500 mb-2">Messages this month</div>
            <div className="flex gap-1">
              {[...Array(usage.cap)].map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full ${
                    i < usage.used ? 'bg-teal-500' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
            <div className="text-xs text-slate-600 mt-2">
              {usage.remaining} of {usage.cap} remaining
            </div>
          </div>
        </aside>

        {/* ============================================ */}
        {/* MAIN CHAT AREA */}
        {/* ============================================ */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="text-sm text-slate-400">
                {currentSession ? currentSession.title : 'New Session'}
              </span>
            </div>
            
            {/* User menu */}
            <div className="relative group">
              <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="px-4 py-2 border-b border-slate-700">
                  <div className="text-xs text-slate-400 truncate">{userEmail}</div>
                </div>
                <button
                  onClick={() => setShowPaywall(true)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700"
                >
                  Upgrade plan
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 rounded-b-lg"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto">
                <div className="w-20 h-20 mb-6 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                  <OraklLogo className="w-10 h-10" />
                </div>
                
                <p className="text-xl text-slate-200 mb-4 leading-relaxed">
                  {userFirstName ? `Hey ${userFirstName}, what` : 'What'} are we untangling today — a thought loop, a relationship dynamic, or a decision you can&apos;t land on?
                </p>
                
                <p className="text-sm text-slate-500 max-w-lg">
                  [To be accurate: what happened, who&apos;s involved, what you tried, what you fear might be true, and what outcome you want. More context = better help.]
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto p-4 space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-teal-600/20 border border-teal-500/30'
                          : 'bg-slate-800/50 border border-slate-700'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-slate-800 p-4 bg-slate-900/30">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What's on your mind?"
                  rows={1}
                  disabled={isTyping}
                  className="flex-1 py-3 px-4 bg-slate-800/50 border border-slate-700 rounded-xl text-sm resize-none focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                
                <button
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={!inputValue.trim() || isTyping}
                  className="p-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              
              <p className="text-xs text-slate-600 text-center mt-2">
                Enter to send • Shift+Enter for new line
              </p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-center py-2 text-xs text-slate-600 border-t border-slate-800/50">
            Not therapy, medical, or legal advice. For personal reflection only.
          </div>
        </main>
      </div>

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={handleUpgrade}
        isLoading={isCheckoutLoading}
        usage={usage}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}