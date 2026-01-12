'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, ArrowRight, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

// Agent Definition
type Agent = {
  id: string;
  name: string;
  role: string;
  description: string;
  color: string;
  mascot: string;
  starter: string;
  link: string;
};

const agents: Agent[] = [
  {
    id: 'cohost',
    name: 'CoHost',
    role: 'Operations & Messaging',
    description: 'The Airbnb super-agent. Automates guest communication, schedules cleaners, and maximizes occupancy.',
    color: 'bg-red-500',
    mascot: '/mascots/cohost.png',
    starter: "I'm ready to handle specific guest messages. Want to see how much time I can save you?",
    link: '/cohost'
  },
  {
    id: 'momassist',
    name: 'MomAssist',
    role: 'Family & Chaos Manager',
    description: 'The ultimate parenting partner. Manages school emails, family calendars, and meal planning.',
    color: 'bg-rose-400',
    mascot: '/mascots/momassist.png',
    starter: "School emails piling up? I can summarize them and add dates to your calendar instantly.",
    link: '/momassist'
  },
  {
    id: 'orakl',
    name: 'Orakl',
    role: 'Guidance & Clarity',
    description: 'Your personal clarity engine. De-escalates conflict, maps mental models, and offers wisdom.',
    color: 'bg-amber-400',
    mascot: '/mascots/orakl.png',
    starter: "Feeling overwhelmed? Let's map out the situation and find the path of least resistance.",
    link: '/orakl'
  }
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600 mb-6">
            <Sparkles size={14} />
            The Future of Agency
          </span>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 mb-6">
            Meet the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Navies</span>.
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12">
            A constellation of specialized AI agents living on your desktop.
            Choose your partner.
          </p>
        </motion.div>
      </section>

      {/* Living Agent Grid */}
      <section className="px-6 pb-32 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {agents.map((agent, index) => (
            <AgentCard key={agent.id} agent={agent} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'agent' | 'user', text: string }[]>([
    { role: 'agent', text: agent.starter }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: inputValue }]);
    setInputValue('');

    // Simulate Agent "thinking" and "pitching"
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'agent',
        text: `I can definitely help with that! As ${agent.name}, that's exactly what I'm built for. Click below to see my full capabilities.`
      }]);
    }, 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="relative group h-[600px] w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "absolute inset-0 rounded-3xl transition-all duration-500 border border-gray-100 bg-white",
        isHovered ? "shadow-2xl translate-y-[-8px]" : "shadow-sm"
      )}>
        {/* Card Content container */}
        <div className="h-full flex flex-col p-6 relative overflow-hidden">

          {/* Header */}
          <div className="flex justify-between items-start z-10">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{agent.name}</h3>
              <p className="text-sm font-medium text-gray-500 mt-1">{agent.role}</p>
            </div>
            <div className={cn("w-3 h-3 rounded-full", agent.color)} />
          </div>

          {/* Description (Fades out when chatting) */}
          <div className="mt-4 z-10">
            <p className="text-gray-600 leading-relaxed text-sm">
              {agent.description}
            </p>
          </div>

          {/* Mascot Image (Living Animation) */}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-700",
            isChatOpen ? "opacity-10 scale-110 translate-y-10" : "opacity-100 scale-100"
          )}>
            <motion.div
              animate={{
                y: [0, -10, 0],
                // scale: isHovered ? 1.05 : 1
              }}
              transition={{
                y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
                scale: { duration: 0.3 }
              }}
              className="relative w-64 h-64 md:w-80 md:h-80"
            >
              <Image
                src={agent.mascot}
                alt={agent.name}
                fill
                className="object-contain drop-shadow-xl"
                priority
              />
            </motion.div>
          </div>

          {/* Micro-Chat Interface (Overlays the mascot) */}
          <div className={cn(
            "absolute inset-x-6 bottom-6 top-32 bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-inner flex flex-col transition-all duration-500 transform",
            isChatOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
          )}>
            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === 'agent' ? "justify-start" : "justify-end")}>
                  <div className={cn(
                    "max-w-[85%] text-sm p-3 rounded-2xl",
                    m.role === 'agent'
                      ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                      : "bg-black text-white rounded-tr-sm"
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1 text-sm bg-transparent border-none focus:ring-0 placeholder:text-gray-400"
              />
              <button
                type="submit"
                className="p-2 bg-black text-white rounded-full hover:bg-gray-800 transition-colors"
              >
                <Send size={14} />
              </button>
            </form>
          </div>

          {/* Action Area (Bottom) - Only visible when NOT chatting */}
          <div className={cn(
            "absolute bottom-6 left-6 right-6 z-20 flex flex-col gap-3 transition-all duration-300",
            isChatOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          )}>

            {/* Chat Trigger Button */}
            <button
              onClick={() => setIsChatOpen(true)}
              className="w-full bg-white border border-gray-200 shadow-sm text-gray-900 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <MessageCircle size={18} />
              Chat with {agent.name.split(' ')[0]}
            </button>

            {/* Deep Dive Link */}
            <Link
              href={agent.link}
              className="w-full bg-transparent text-gray-500 py-2 text-center text-sm hover:text-black transition-colors flex items-center justify-center gap-1"
            >
              View full profile <ArrowRight size={14} />
            </Link>
          </div>

          {/* Close Chat Button (When chat is open) */}
          {isChatOpen && (
            <button
              onClick={() => setIsChatOpen(false)}
              className="absolute top-2 right-2 z-30 p-2 text-gray-400 hover:text-black bg-white rounded-full shadow-sm"
            >
              <span className="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}

          {/* Permanent CTA inside chat (When chat is open) */}
          <div className={cn(
            "absolute bottom-2 left-0 right-0 z-30 flex justify-center transition-all px-8",
            isChatOpen ? "opacity-100 translate-y-[calc(100%+10px)]" /* Push it below card? No, keep it handy */ : "opacity-0 hidden"
          )}>
            <Link
              href={agent.link}
              className="text-xs text-gray-400 hover:text-black underline decoration-gray-300 underline-offset-4"
            >
              Go to {agent.name} Extension Page
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
