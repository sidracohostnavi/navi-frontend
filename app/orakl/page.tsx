// app/orakl/page.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

// ============================================
// TYPES
// ============================================
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Usage {
  used: number;
  cap: number;
  remaining: number;
  windowEnd: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

type Plan = 'free' | 'plus' | 'pro';

// Speech Recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

// ============================================
// CONSTANTS
// ============================================
const WELCOME_MESSAGE = `What are we untangling today — a thought loop, a relationship dynamic, or a decision you can't land on?`;

const WELCOME_HINT = `[To be accurate: what happened, who's involved, what you tried, what you fear might be true, and what outcome you want. More context = better help.]`;

const PLAN_DETAILS: Record<Plan, { name: string; price: string; cap: number }> = {
  free: { name: 'Free', price: '$0', cap: 3 },
  plus: { name: 'Plus', price: '$9.99/mo', cap: 300 },
  pro: { name: 'Pro', price: '$24.99/mo', cap: 1200 },
};

// ============================================
// CAPTCHA MODAL
// ============================================
function CaptchaModal({
  isOpen,
  onVerified,
  onClose,
}: {
  isOpen: boolean;
  onVerified: (token: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    
    if (!siteKey) {
      console.warn('Turnstile site key not configured, skipping captcha');
      onVerified('skip-no-key');
      return;
    }

    const renderWidget = () => {
      if (window.turnstile && containerRef.current) {
        setIsLoading(false);
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            onVerified(token);
          },
          'error-callback': () => {
            console.error('Turnstile error');
          },
          theme: 'dark',
        });
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      window.onTurnstileLoad = renderWidget;
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [isOpen, onVerified]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-slate-100 mb-2 text-center">
          Quick verification
        </h3>
        <p className="text-sm text-slate-400 mb-4 text-center">
          Please complete the check below to continue
        </p>
        
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-teal-500 rounded-full animate-spin" />
          </div>
        )}
        
        <div ref={containerRef} className="flex justify-center" />
        
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-400"
        >
          Cancel
        </button>
      </div>
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
  currentPlan,
  usage,
  reason,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: 'plus' | 'pro') => void;
  isLoading: boolean;
  currentPlan: Plan;
  usage?: Usage;
  reason: 'limit' | 'upgrade';
}) {
  if (!isOpen) return null;

  const daysUntilReset = usage?.windowEnd
    ? Math.max(0, Math.ceil((new Date(usage.windowEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

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
            {reason === 'limit' ? 'Message Limit Reached' : 'Upgrade Your Plan'}
          </h2>
          
          {reason === 'limit' && usage && (
            <p className="text-slate-400 text-sm">
              You&apos;ve used all {usage.cap} messages this period.
              {daysUntilReset > 0 && (
                <span className="block mt-1">
                  Resets in {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''}.
                </span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {currentPlan === 'free' && (
            <>
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
            </>
          )}

          {currentPlan === 'plus' && (
            <button
              onClick={() => onUpgrade('pro')}
              disabled={isLoading}
              className="w-full p-4 bg-gradient-to-r from-teal-900/30 to-slate-800 hover:from-teal-900/50 border border-teal-500/30 hover:border-teal-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-slate-100">Upgrade to Pro</div>
                  <div className="text-sm text-slate-400">1,200 messages / month + GPT-4o</div>
                </div>
                <div className="text-teal-400 font-semibold">$24.99/mo</div>
              </div>
            </button>
          )}

          {currentPlan === 'pro' && (
            <p className="text-center text-slate-400 py-4">
              You&apos;re on our highest plan. Your limit will reset in {daysUntilReset} days.
            </p>
          )}
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
          {reason === 'limit' ? 'Wait for reset' : 'Not now'}
        </button>
      </div>
    </div>
  );
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
// VOICE HOOKS
// ============================================
function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionClass);
    
    if (SpeechRecognitionClass) {
      recognitionRef.current = new SpeechRecognitionClass();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
    }
  }, []);

  const startListening = useCallback((onResult: (text: string) => void, onError?: (error: string) => void) => {
    if (!recognitionRef.current) {
      onError?.('Speech recognition not supported');
      return;
    }

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setIsListening(false);
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      onError?.(event.error);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, isSupported, startListening, stopListening };
}

function useVoiceOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSupported || typeof window === 'undefined') return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, isSupported, speak, stop };
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function OraklPage() {
  const router = useRouter();
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState<string | null>(null);
  
  // Captcha state
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  
  // Usage & plan state
  const [plan, setPlan] = useState<Plan>('free');
  const [usage, setUsage] = useState<Usage | null>(null);
  
  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<'limit' | 'upgrade'>('limit');
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Voice
  const voiceInput = useVoiceInput();
  const voiceOutput = useVoiceOutput();
  
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
  const checkAuth = useCallback(async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        return;
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        setAuthToken(session.access_token);
        setIsAuthenticated(true);
        
        // Fetch user's plan and usage
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan, status')
          .single();
        
        if (sub && ['plus', 'pro'].includes(sub.plan) && sub.status !== 'cancelled') {
          setPlan(sub.plan as Plan);
        }
        
        const { data: usageData } = await supabase
          .from('orakl_usage')
          .select('*')
          .single();
        
        if (usageData) {
          setUsage({
            used: usageData.replies_used,
            cap: usageData.replies_cap,
            remaining: usageData.replies_cap - usageData.replies_used,
            windowEnd: usageData.window_end,
          });
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // ============================================
  // EFFECTS
  // ============================================
  useEffect(() => {
    checkAuth();
    
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    const checkoutPlan = params.get('plan');
    
    if (checkoutResult === 'success' && checkoutPlan) {
      addToast(`Welcome to Orakl ${checkoutPlan.charAt(0).toUpperCase() + checkoutPlan.slice(1)}!`, 'success');
      window.history.replaceState({}, '', '/orakl');
    } else if (checkoutResult === 'cancelled') {
      addToast('Checkout was cancelled', 'info');
      window.history.replaceState({}, '', '/orakl');
    }
  }, [checkAuth, addToast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================
  // CHAT HANDLERS
  // ============================================
  const sendMessageToAPI = useCallback(async (content: string, captchaToken?: string) => {
    if (!authToken) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/orakl/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          sessionId,
          captchaToken,
          isFirstMessage: messages.length === 0,
          authToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'quota_exceeded') {
          setUsage(data.usage);
          setPaywallReason('limit');
          setShowPaywall(true);
          setMessages((prev) => prev.filter(m => m.id !== userMessage.id));
        } else {
          throw new Error(data.error || 'Failed to send message');
        }
        return;
      }

      if (data.usage) {
        setUsage(data.usage);
      }

      if (data.plan) {
        setPlan(data.plan);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      addToast(error instanceof Error ? error.message : 'Failed to send message', 'error');
      setMessages((prev) => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsTyping(false);
    }
  }, [authToken, messages, sessionId, addToast]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !authToken) return;

    if (!captchaVerified && messages.length === 0) {
      setPendingMessage(content);
      setShowCaptcha(true);
      return;
    }

    await sendMessageToAPI(content);
  }, [authToken, captchaVerified, messages.length, sendMessageToAPI]);

  const handleCaptchaVerified = useCallback((token: string) => {
    setCaptchaVerified(true);
    setShowCaptcha(false);
    
    if (pendingMessage) {
      sendMessageToAPI(pendingMessage, token);
      setPendingMessage(null);
    }
  }, [pendingMessage, sendMessageToAPI]);

  // ============================================
  // STRIPE CHECKOUT
  // ============================================
  const handleUpgrade = useCallback(async (selectedPlan: 'plus' | 'pro') => {
    if (!authToken) return;
    
    setIsCheckoutLoading(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, authToken }),
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
  }, [authToken, addToast]);

  // ============================================
  // VOICE HANDLERS
  // ============================================
  const handleVoiceInput = useCallback(() => {
    if (voiceInput.isListening) {
      voiceInput.stopListening();
    } else {
      voiceInput.startListening(
        (text) => setInputValue((prev) => prev + (prev ? ' ' : '') + text),
        (error) => addToast(`Voice input error: ${error}`, 'error')
      );
    }
  }, [voiceInput, addToast]);

  const handleSpeakMessage = useCallback((content: string) => {
    if (voiceOutput.isSpeaking) {
      voiceOutput.stop();
    } else {
      const cleanText = content
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/---[\s\S]*$/, '')
        .trim();
      voiceOutput.speak(cleanText);
    }
  }, [voiceOutput]);

  // ============================================
  // MEMORY CLEAR
  // ============================================
  const handleClearMemory = useCallback(async () => {
    if (!confirm('Clear all your Orakl memory? This cannot be undone.')) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) return;
      
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from('orakl_user_profile').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('orakl_insights').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      addToast('Memory cleared', 'success');
    } catch {
      addToast('Failed to clear memory', 'error');
    }
  }, [addToast]);

  // ============================================
  // KEY HANDLERS
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
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ============================================
  // RENDER: Login required
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
  // RENDER: Main chat UI
  // ============================================
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad"
        async
        defer
      />

      <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
        {/* Header */}
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <OraklLogo className="w-7 h-7" />
            <span className="font-semibold tracking-tight">Orakl</span>
            {plan !== 'free' && (
              <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded uppercase">
                {plan}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {usage && (
              <div className="text-xs text-slate-500">
                {usage.remaining} / {usage.cap} left
              </div>
            )}
            
            <div className="relative group">
              <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                  onClick={() => { setPaywallReason('upgrade'); setShowPaywall(true); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 rounded-t-lg"
                >
                  Upgrade plan
                </button>
                <button
                  onClick={handleClearMemory}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 rounded-b-lg"
                >
                  Clear my memory
                </button>
              </div>
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
                {WELCOME_MESSAGE}
              </p>
              
              <p className="text-sm text-slate-500 max-w-lg">
                {WELCOME_HINT}
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
                    
                    {message.role === 'assistant' && voiceOutput.isSupported && (plan === 'plus' || plan === 'pro') && (
                      <button
                        onClick={() => handleSpeakMessage(message.content)}
                        className="mt-2 text-xs text-slate-500 hover:text-teal-400 flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                        {voiceOutput.isSpeaking ? 'Stop' : 'Listen'}
                      </button>
                    )}
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
              {voiceInput.isSupported && (plan === 'plus' || plan === 'pro') && (
                <button
                  onClick={handleVoiceInput}
                  className={`p-3 rounded-xl transition-colors flex-shrink-0 ${
                    voiceInput.isListening
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
              
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
      </div>

      {/* Modals */}
      <CaptchaModal
        isOpen={showCaptcha}
        onVerified={handleCaptchaVerified}
        onClose={() => { setShowCaptcha(false); setPendingMessage(null); }}
      />

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={handleUpgrade}
        isLoading={isCheckoutLoading}
        currentPlan={plan}
        usage={usage || undefined}
        reason={paywallReason}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}