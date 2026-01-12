'use client';

import { Sparkles, Brain, Compass, Check } from 'lucide-react';

export default function OraklPage() {
  return (
    <div className="bg-[#FAFAFA] text-gray-900">
      {/* Hero Section (Gold/Sand) */}
      <section className="bg-gradient-to-b from-[#D4AF37] to-[#C5A028] text-white py-24 px-6 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block border border-white/30 backdrop-blur-md px-4 py-1 rounded-full text-sm tracking-widest font-light mb-6 uppercase">
            Clarity Engine
          </div>
          <h1 className="text-5xl md:text-7xl font-serif tracking-tight mb-8">
            Find Your Center.
          </h1>
          <p className="text-xl md:text-2xl opacity-90 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            Orakl acts as a mirror for your mind. De-escalate conflict, map your mental models, and make decisions from a place of calm.
          </p>
          <div className="flex justify-center">
            <button className="bg-[#1A1A1A] text-[#D4AF37] px-8 py-4 rounded-full font-medium text-lg hover:shadow-2xl transition-all border border-[#D4AF37]/20">
              Begin Session
            </button>
          </div>
        </div>
      </section>

      {/* Methods */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-serif text-center mb-16 text-[#1A1A1A]">The Methodology</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Compass, title: "Cartography", desc: "We map out the situation to reveal the path of least resistance." },
            { icon: Brain, title: "Reframing", desc: "Shift your perspective from 'problem' to 'opportunity' instantly." },
            { icon: Sparkles, title: "Synthesis", desc: "Combine disparate data points into a unified, actionable insight." }
          ].map((item, i) => (
            <div key={i} className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-[#F5F5F0] text-[#D4AF37] rounded-full flex items-center justify-center mb-6">
                <item.icon size={20} />
              </div>
              <h3 className="text-lg font-bold mb-3 font-serif">{item.title}</h3>
              <p className="text-gray-500 font-light leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section className="bg-white py-24 px-6 border-y border-gray-100">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-2xl font-serif italic text-gray-500 mb-6">
            "It's like having a wise elder and a supercomputer in your pocket. I don't make big decisions without checking with Orakl first."
          </p>
          <div className="text-xs tracking-widest uppercase text-gray-400">Marcus T., Entrepreneur</div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 max-w-5xl mx-auto">
        <h2 className="text-3xl font-serif text-center mb-16">Membership</h2>
        <div className="max-w-md mx-auto bg-[#1A1A1A] text-[#E5E5E5] p-8 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37] opacity-10 blur-3xl rounded-full" />

          <h3 className="text-2xl font-serif mb-2 text-[#D4AF37]">Inner Circle</h3>
          <div className="text-4xl font-light mb-8">$49<span className="text-sm opacity-50">/mo</span></div>

          <ul className="space-y-4 mb-10 text-sm font-light opacity-80">
            <li className="flex gap-3"><Check size={16} className="text-[#D4AF37]" /> Unlimited Sessions</li>
            <li className="flex gap-3"><Check size={16} className="text-[#D4AF37]" /> Dream Mapping</li>
            <li className="flex gap-3"><Check size={16} className="text-[#D4AF37]" /> Strategic Foresight</li>
          </ul>

          <button className="w-full py-4 bg-[#D4AF37] text-[#1A1A1A] rounded-lg font-medium hover:bg-[#E5C158] transition-colors">
            Become a Member
          </button>
        </div>
      </section>
    </div>
  );
}