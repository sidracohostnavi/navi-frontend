// app/orakl/page.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
  updatedAt: Date;
  messages: Message[];
}

interface SavedInsight {
  id: string;
  content: string;
  sessionId: string;
  createdAt: Date;
}

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

// ============================================
// CONSTANTS
// ============================================
const FREE_MESSAGE_LIMIT = 3;
const STORAGE_KEY_PREFIX = 'orakl_messages_';

// ============================================
// MOCK DATA
// ============================================
const MOCK_SESSIONS: Session[] = [
  {
    id: '1',
    title: 'Work boundary situation',
    preview: 'My manager keeps messaging me after hours...',
    updatedAt: new Date('2024-12-30'),
    messages: [
      { id: '1a', role: 'user', content: 'My manager keeps messaging me after hours and I don\'t know how to address it without seeming difficult.', timestamp: new Date('2024-12-30T10:00:00') },
      { id: '1b', role: 'assistant', content: 'Let\'s break this down. First, the facts: your manager messages after hours. Now let\'s separate that from the story you\'re telling yourself—that setting a boundary would make you "difficult." What evidence do you have for that assumption?', timestamp: new Date('2024-12-30T10:01:00') },
    ],
  },
  {
    id: '2',
    title: 'Family pattern recognition',
    preview: 'I noticed I always feel drained after calls with my mother...',
    updatedAt: new Date('2024-12-28'),
    messages: [
      { id: '2a', role: 'user', content: 'I noticed I always feel drained after calls with my mother. It\'s like I become a different person.', timestamp: new Date('2024-12-28T14:00:00') },
      { id: '2b', role: 'assistant', content: 'That\'s an important observation. The "becoming a different person" feeling often signals we\'re falling into an old role in a family system. What version of yourself shows up on these calls? The peacekeeper? The fixer? The invisible one?', timestamp: new Date('2024-12-28T14:01:00') },
    ],
  },
];

const MOCK_INSIGHTS: SavedInsight[] = [
  { id: 'i1', content: 'When I feel the urge to over-explain, it\'s usually because I\'m anticipating criticism that hasn\'t happened yet.', sessionId: '1', createdAt: new Date('2024-12-30') },
  { id: 'i2', content: 'The pattern: Mom criticizes → I defend → she escalates → I withdraw. Breaking point: don\'t defend, just acknowledge.', sessionId: '2', createdAt: new Date('2024-12-28') },
];

// ============================================
// HELPER FUNCTIONS
// ============================================
function getTodayKey(): string {
  const today = new Date();
  return `${STORAGE_KEY_PREFIX}${today.toISOString().split('T')[0]}`;
}

function getMessagesUsedToday(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const stored = localStorage.getItem(getTodayKey());
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

function incrementMessagesUsed(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const current = getMessagesUsedToday();
    const newCount = current + 1;
    localStorage.setItem(getTodayKey(), newCount.toString());
    return newCount;
  } catch {
    return 0;
  }
}

function checkIsPro(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // MVP: Check localStorage for pro status
    // TODO: Replace with real Supabase user metadata check
    return localStorage.getItem('orakl_is_pro') === 'true';
  } catch {
    return false;
  }
}

// ============================================
// INLINE SVG COMPONENTS
// ============================================
function OraklHeroSVG() {
  return (
    <svg
      viewBox="0 0 200 120"
      className="w-full max-w-[280px] h-auto mx-auto mb-6 opacity-80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* Glow behind head */}
      <ellipse cx="100" cy="70" rx="35" ry="40" fill="url(#glowGradient)" />
      
      {/* Head silhouette */}
      <path
        d="M100 95 C75 95 60 75 60 55 C60 30 78 15 100 15 C122 15 140 30 140 55 C140 75 125 95 100 95"
        fill="#1e293b"
        stroke="#334155"
        strokeWidth="1.5"
      />
      
      {/* Constellation lines emanating from head */}
      <g stroke="#14b8a6" strokeWidth="0.75" opacity="0.6" filter="url(#glow)">
        <line x1="100" y1="15" x2="100" y2="5" />
        <line x1="100" y1="5" x2="85" y2="0" />
        <line x1="100" y1="5" x2="115" y2="0" />
        <line x1="85" y1="20" x2="60" y2="5" />
        <line x1="115" y1="20" x2="140" y2="5" />
        <line x1="60" y1="55" x2="35" y2="45" />
        <line x1="35" y1="45" x2="20" y2="55" />
        <line x1="35" y1="45" x2="25" y2="30" />
        <line x1="60" y1="70" x2="30" y2="80" />
        <line x1="30" y1="80" x2="15" y2="70" />
        <line x1="140" y1="55" x2="165" y2="45" />
        <line x1="165" y1="45" x2="180" y2="55" />
        <line x1="165" y1="45" x2="175" y2="30" />
        <line x1="140" y1="70" x2="170" y2="80" />
        <line x1="170" y1="80" x2="185" y2="70" />
        <line x1="60" y1="5" x2="40" y2="15" />
        <line x1="140" y1="5" x2="160" y2="15" />
      </g>
      
      {/* Constellation dots */}
      <g fill="#14b8a6" filter="url(#glow)">
        <circle cx="100" cy="5" r="2" />
        <circle cx="85" cy="0" r="1.5" />
        <circle cx="115" cy="0" r="1.5" />
        <circle cx="60" cy="5" r="2" />
        <circle cx="140" cy="5" r="2" />
        <circle cx="40" cy="15" r="1.5" />
        <circle cx="160" cy="15" r="1.5" />
        <circle cx="35" cy="45" r="2" />
        <circle cx="20" cy="55" r="1.5" />
        <circle cx="25" cy="30" r="1.5" />
        <circle cx="30" cy="80" r="2" />
        <circle cx="15" cy="70" r="1.5" />
        <circle cx="165" cy="45" r="2" />
        <circle cx="180" cy="55" r="1.5" />
        <circle cx="175" cy="30" r="1.5" />
        <circle cx="170" cy="80" r="2" />
        <circle cx="185" cy="70" r="1.5" />
      </g>
      
      {/* Inner mind dots */}
      <g fill="#14b8a6" opacity="0.4">
        <circle cx="85" cy="45" r="1" />
        <circle cx="115" cy="45" r="1" />
        <circle cx="100" cy="55" r="1.5" />
        <circle cx="90" cy="65" r="1" />
        <circle cx="110" cy="65" r="1" />
      </g>
    </svg>
  );
}

function OraklLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="url(#logoGradient)" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="5" fill="none" stroke="url(#logoGradient)" strokeWidth="1.5" />
      <path d="M10 22 Q16 18 22 22" fill="none" stroke="url(#logoGradient)" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="1.5" fill="#14b8a6" />
      <circle cx="10" cy="8" r="1" fill="#14b8a6" opacity="0.6" />
      <circle cx="22" cy="8" r="1" fill="#14b8a6" opacity="0.6" />
      <circle cx="8" cy="16" r="1" fill="#14b8a6" opacity="0.4" />
      <circle cx="24" cy="16" r="1" fill="#14b8a6" opacity="0.4" />
    </svg>
  );
}

// ============================================
// PAYWALL MODAL COMPONENT
// ============================================
function PaywallModal({
  isOpen,
  onClose,
  onUpgrade,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  isLoading: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-teal-500/10 to-transparent pointer-events-none" />
        
        {/* Content */}
        <div className="relative text-center">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-semibold text-slate-100 mb-3">
            Unlock Orakl
          </h2>
          
          {/* Description */}
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            You've used your 3 free messages today.<br />
            Upgrade for unlimited clarity sessions.
          </p>
          
          {/* Features list */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6 text-left">
            <ul className="space-y-2">
              {[
                'Unlimited daily messages',
                'Save & organize insights',
                'Priority response times',
                'Advanced clarity tools',
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                  <svg className="w-4 h-4 text-teal-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={onUpgrade}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  Upgrade to Pro
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
            
            <button
              onClick={onClose}
              disabled={isLoading}
              className="w-full py-3 px-4 text-slate-400 hover:text-slate-300 text-sm transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
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
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm animate-slide-up ${
            toast.type === 'error'
              ? 'bg-red-900/90 border border-red-700 text-red-100'
              : toast.type === 'success'
              ? 'bg-green-900/90 border border-green-700 text-green-100'
              : 'bg-slate-800/90 border border-slate-700 text-slate-100'
          }`}
        >
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-current opacity-60 hover:opacity-100"
          >
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
// QUICK TOOL BUTTONS
// ============================================
const QUICK_TOOLS = [
  { id: 'clarify', label: 'Clarify the Loop', icon: '🔄', prompt: 'Help me clarify the thought loop I\'m stuck in right now.' },
  { id: 'connect', label: 'Connect the Dots', icon: '🔗', prompt: 'Help me connect the dots between these events and see the pattern.' },
  { id: 'reality', label: 'Reality Check', icon: '⚖️', prompt: 'Help me separate facts from assumptions in this situation.' },
  { id: 'boundary', label: 'Boundary Builder', icon: '🛡️', prompt: 'Help me build a boundary for this situation.' },
  { id: 'draft', label: 'Message Draft', icon: '✉️', prompt: 'Help me draft a message. I\'ll need versions in calm, firm, and diplomatic tones.' },
  { id: 'steps', label: 'Next 3 Steps', icon: '📋', prompt: 'What are my next 3 actionable steps for the next 24-72 hours?' },
];

const STARTER_CHIPS = [
  { id: 'family', label: 'Family conflict', prompt: 'I\'m dealing with a family conflict and need clarity.' },
  { id: 'relationship', label: 'Relationship clarity', prompt: 'I need clarity on a relationship dynamic.' },
  { id: 'work', label: 'Work tension', prompt: 'I\'m navigating tension at work and need to think it through.' },
];

// ============================================
// MAIN COMPONENT
// ============================================
export default function OraklPage() {
  // State
  const [sessions, setSessions] = useState<Session[]>(MOCK_SESSIONS);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savedInsights, setSavedInsights] = useState<SavedInsight[]>(MOCK_INSIGHTS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [clarityPanelOpen, setClarityPanelOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Paywall state
  const [isPro, setIsPro] = useState(false);
  const [messagesUsedToday, setMessagesUsedToday] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isInputDisabled, setIsInputDisabled] = useState(false);
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize on mount
  useEffect(() => {
    setIsPro(checkIsPro());
    setMessagesUsedToday(getMessagesUsedToday());
    
    // Check URL params for checkout result
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    
    if (checkoutResult === 'success') {
      // TODO: Verify with backend, for now just show success
      addToast('Payment successful! Welcome to Orakl Pro.', 'success');
      localStorage.setItem('orakl_is_pro', 'true');
      setIsPro(true);
      setIsInputDisabled(false);
      // Clean URL
      window.history.replaceState({}, '', '/orakl');
    } else if (checkoutResult === 'cancelled') {
      addToast('Checkout was cancelled.', 'info');
      window.history.replaceState({}, '', '/orakl');
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Toast helpers
  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Filter sessions based on search
  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Remaining free messages
  const remainingFreeMessages = Math.max(0, FREE_MESSAGE_LIMIT - messagesUsedToday);
  const canSendMessage = isPro || remainingFreeMessages > 0;

  // Create new session
  const handleNewSession = () => {
    setCurrentSession(null);
    setMessages([]);
    setInputValue('');
  };

  // Select existing session
  const handleSelectSession = (session: Session) => {
    setCurrentSession(session);
    setMessages(session.messages);
  };

  // Handle Stripe checkout
  const handleUpgrade = async () => {
    setIsCheckoutLoading(true);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'orakl_pro' }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      addToast(
        error instanceof Error ? error.message : 'Failed to start checkout. Please try again.',
        'error'
      );
      setIsCheckoutLoading(false);
    }
  };

  // Send message
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    
    // Check if user can send message
    if (!isPro && messagesUsedToday >= FREE_MESSAGE_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    
    // Increment message count for free users
    if (!isPro) {
      const newCount = incrementMessagesUsed();
      setMessagesUsedToday(newCount);
      
      // Check if this was the last free message
      if (newCount >= FREE_MESSAGE_LIMIT) {
        setIsInputDisabled(true);
      }
    }

    // Simulate AI response (replace with real API call later)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateMockResponse(content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);

      // Create or update session
      if (!currentSession) {
        const newSession: Session = {
          id: Date.now().toString(),
          title: content.slice(0, 40) + (content.length > 40 ? '...' : ''),
          preview: content.slice(0, 60),
          updatedAt: new Date(),
          messages: [userMessage, assistantMessage],
        };
        setSessions((prev) => [newSession, ...prev]);
        setCurrentSession(newSession);
      }
      
      // Show paywall after response if limit reached
      if (!isPro && messagesUsedToday + 1 >= FREE_MESSAGE_LIMIT) {
        setTimeout(() => {
          setShowPaywall(true);
        }, 1000);
      }
    }, 1500);
  };

  // Handle quick tool click
  const handleQuickTool = (prompt: string) => {
    if (!canSendMessage && !isPro) {
      setShowPaywall(true);
      return;
    }
    handleSendMessage(prompt);
  };

  // Handle starter chip click
  const handleStarterChip = (prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  // Handle key press in textarea
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isInputDisabled && !isPro) {
        setShowPaywall(true);
      } else {
        handleSendMessage(inputValue);
      }
    }
  };

  // Handle send button click
  const handleSendClick = () => {
    if (isInputDisabled && !isPro) {
      setShowPaywall(true);
    } else {
      handleSendMessage(inputValue);
    }
  };

  // Format date for display
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div className="h-screen flex bg-slate-950 text-slate-100 overflow-hidden">
        {/* ============================================ */}
        {/* LEFT SIDEBAR - Sessions */}
        {/* ============================================ */}
        <aside
          className={`${
            sidebarOpen ? 'w-72' : 'w-0'
          } transition-all duration-300 bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-hidden`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <OraklLogo className="w-8 h-8" />
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tracking-tight">Orakl</span>
                {isPro && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-teal-500/20 text-teal-400 rounded">
                    PRO
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleNewSession}
              className="w-full py-2.5 px-4 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 rounded-lg text-teal-400 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-lg">+</span>
              New Session
            </button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full py-2 px-3 pl-9 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentSession?.id === session.id
                    ? 'bg-teal-600/20 border border-teal-500/30'
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="text-sm font-medium text-slate-200 truncate">
                  {session.title}
                </div>
                <div className="text-xs text-slate-500 truncate mt-1">
                  {session.preview}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {formatDate(session.updatedAt)}
                </div>
              </button>
            ))}
          </div>
          
          {/* Free tier indicator */}
          {!isPro && (
            <div className="p-4 border-t border-slate-800">
              <div className="text-xs text-slate-500 mb-2">
                Free messages today
              </div>
              <div className="flex gap-1">
                {[...Array(FREE_MESSAGE_LIMIT)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full ${
                      i < messagesUsedToday ? 'bg-teal-500' : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs text-slate-600 mt-2">
                {remainingFreeMessages} of {FREE_MESSAGE_LIMIT} remaining
              </div>
            </div>
          )}
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="text-sm text-slate-400">
                {currentSession ? currentSession.title : 'New Session'}
              </span>
            </div>
            <button
              onClick={() => setClarityPanelOpen(!clarityPanelOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          </header>

          {/* Chat Content */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              /* Empty State */
              <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <OraklHeroSVG />
                <h2 className="text-2xl font-semibold text-slate-200 mb-2">
                  What's the loop you're stuck in?
                </h2>
                <p className="text-slate-400 text-sm max-w-md mb-6">
                  Break rumination cycles, clarify conflict, connect patterns, and find your next step.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                  {STARTER_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => handleStarterChip(chip.prompt)}
                      className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-teal-500/30 rounded-full text-sm text-slate-300 hover:text-teal-400 transition-colors"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600">
                  Not medical advice. For personal clarity and reflection only.
                </p>
              </div>
            ) : (
              /* Messages */
              <div className="max-w-3xl mx-auto p-4 space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-teal-600/20 border border-teal-500/30 text-slate-200'
                          : 'bg-slate-800/50 border border-slate-700 text-slate-300'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        {message.timestamp.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
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

          {/* Input Area */}
          <div className="border-t border-slate-800 p-4 bg-slate-900/30">
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isInputDisabled && !isPro
                      ? 'Upgrade to continue...'
                      : "What's on your mind?"
                  }
                  rows={1}
                  disabled={isTyping}
                  className={`w-full py-3 px-4 pr-12 bg-slate-800/50 border rounded-xl text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none transition-colors ${
                    isInputDisabled && !isPro
                      ? 'border-slate-700/50 cursor-not-allowed opacity-60'
                      : 'border-slate-700 focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20'
                  }`}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                <button
                  onClick={handleSendClick}
                  disabled={!inputValue.trim() || isTyping}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${
                    isInputDisabled && !isPro
                      ? 'bg-teal-600/50 cursor-pointer'
                      : 'bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-600 text-center mt-2">
                {isInputDisabled && !isPro ? (
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="text-teal-400 hover:text-teal-300"
                  >
                    Upgrade to unlock unlimited messages →
                  </button>
                ) : (
                  'Press Enter to send • Shift+Enter for new line'
                )}
              </p>
            </div>
          </div>
        </main>

        {/* ============================================ */}
        {/* RIGHT PANEL - Clarity Tools */}
        {/* ============================================ */}
        <aside
          className={`${
            clarityPanelOpen ? 'w-72' : 'w-0'
          } transition-all duration-300 bg-slate-900/50 border-l border-slate-800 flex flex-col overflow-hidden`}
        >
          {/* Quick Tools */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Quick Tools
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleQuickTool(tool.prompt)}
                  className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-teal-500/30 rounded-lg text-xs text-slate-300 hover:text-teal-400 transition-colors text-left"
                >
                  <span className="block text-base mb-1">{tool.icon}</span>
                  <span className="block leading-tight">{tool.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Saved Insights */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Saved Insights
            </h3>
            <div className="space-y-3">
              {savedInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg"
                >
                  <p className="text-xs text-slate-300 leading-relaxed">
                    "{insight.content}"
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    {formatDate(insight.createdAt)}
                  </p>
                </div>
              ))}
              {savedInsights.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">
                  Insights you save will appear here
                </p>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-4 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              For personal clarity only.<br />Not medical or therapeutic advice.
            </p>
          </div>
        </aside>
      </div>
      
      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={handleUpgrade}
        isLoading={isCheckoutLoading}
      />
      
      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </>
  );
}

// ============================================
// MOCK RESPONSE GENERATOR
// ============================================
function generateMockResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();
  
  if (lowerMessage.includes('loop') || lowerMessage.includes('stuck')) {
    return `Let's break this loop down. When you notice yourself cycling through these thoughts, what's the core fear underneath? Often loops protect us from facing something—a decision, a truth, or an emotion we're not ready to feel.\n\nTry this: Complete this sentence without thinking too hard: "If I stop thinking about this, I'm afraid that..."\n\nWhat comes up?`;
  }
  
  if (lowerMessage.includes('boundary') || lowerMessage.includes('boundaries')) {
    return `Good—you're recognizing you need a boundary here. Let's build it.\n\nFirst, get clear on the behavior that's crossing your line. Not interpretations, just the observable facts.\n\nThen we'll work on:\n1. What you need (the boundary)\n2. How to communicate it\n3. What happens if it's not respected\n\nWhat's the specific behavior you need to address?`;
  }
  
  if (lowerMessage.includes('family') || lowerMessage.includes('mother') || lowerMessage.includes('father')) {
    return `Family patterns run deep. Before we dive in, I want to acknowledge: the most painful dynamics are often with the people who were supposed to make us feel safest.\n\nLet's map this out:\n- What role did you play in your family growing up?\n- What role are you being pulled into now?\n- What role do you actually want?\n\nThese are usually different. Which question feels most charged for you right now?`;
  }
  
  if (lowerMessage.includes('work') || lowerMessage.includes('manager') || lowerMessage.includes('boss') || lowerMessage.includes('colleague')) {
    return `Work dynamics can mirror family dynamics in surprising ways. Let's look at what's actually happening.\n\nFacts first (observable behavior, no interpretation):\n- What specifically happened?\n- When and where?\n- Who was involved?\n\nThen we'll separate facts from the story you're telling yourself about what it means.\n\nStart with the facts—what occurred?`;
  }
  
  if (lowerMessage.includes('message') || lowerMessage.includes('draft') || lowerMessage.includes('say')) {
    return `I'll help you draft this. To create versions that land well, I need to understand:\n\n1. Who is this going to?\n2. What's the core thing you need them to understand?\n3. What outcome are you hoping for?\n4. What's your relationship with this person like right now?\n\nOnce I know this, I'll give you three versions:\n- Calm (soft, relationship-preserving)\n- Firm (clear, direct, no ambiguity)\n- Diplomatic (professional, strategic)\n\nWhat are we working with?`;
  }
  
  if (lowerMessage.includes('steps') || lowerMessage.includes('next') || lowerMessage.includes('do')) {
    return `Let's get you unstuck with concrete next steps.\n\nBased on what you've shared, here's what I'd suggest for the next 24-72 hours:\n\n**Next 24 hours:**\n→ One small action that moves the needle (even 5 minutes counts)\n\n**Next 48 hours:**\n→ One conversation or boundary that needs setting\n\n**Next 72 hours:**\n→ One self-care anchor (something that grounds you)\n\nBut first—what's the actual situation? I want to tailor these to what you're dealing with.`;
  }
  
  // Default response
  return `I hear you. Let's slow down and look at this clearly.\n\nWhat I'm noticing in what you've shared: there's something here that needs attention. Before we problem-solve, let's make sure we understand what's actually happening.\n\nCan you tell me more about what triggered this? What happened right before you started feeling this way?`;
}