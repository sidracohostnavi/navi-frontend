'use client';

import { Check, Star, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function CoHostPage() {
  return (
    <div className="bg-white text-gray-900">
      {/* Hero Section (Airbnb Red) */}
      <section className="bg-[#FF385C] text-white py-24 px-6 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-1 rounded-full text-sm font-semibold mb-6">
            The #1 AI for Short-Term Rentals
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
            Turn Auto-Pilot On.
          </h1>
          <p className="text-xl md:text-2xl opacity-90 mb-12 max-w-2xl mx-auto">
            CoHost handles your guest messaging, schedules cleaners, and monitors reviews 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-[#FF385C] px-8 py-4 rounded-xl font-bold text-lg hover:shadow-lg transition-transform hover:-translate-y-1">
              Start Free Trial
            </button>
            <button className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-colors">
              View Demo
            </button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-16">How CoHost Works</h2>
        <div className="grid md:grid-cols-3 gap-12">
          {[
            { title: "1. Connect", desc: "Link your Airbnb & VRBO accounts in 30 seconds." },
            { title: "2. Train", desc: "CoHost reads your past messages to learn your voice." },
            { title: "3. Relax", desc: "CoHost replies to guests instantly. You just approve." }
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="w-16 h-16 bg-red-100 text-[#FF385C] rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                {i + 1}
              </div>
              <h3 className="text-xl font-bold mb-3">{item.title}</h3>
              <p className="text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ROI Calculator Stub */}
      <section className="bg-gray-50 py-24 px-6">
        <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-gray-100">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Calculate Your Savings</h2>
            <p className="text-gray-500">See how many hours CoHost can buy back for you.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Properties Managed</label>
                <input type="range" min="1" max="50" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#FF385C]" />
                <div className="text-right text-sm font-bold text-[#FF385C] mt-1">5 Properties</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Avg. Messages per Booking</label>
                <input type="range" min="1" max="20" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#FF385C]" />
                <div className="text-right text-sm font-bold text-[#FF385C] mt-1">8 Messages</div>
              </div>
            </div>
            <div className="bg-[#FF385C] text-white p-8 rounded-2xl text-center">
              <div className="text-lg opacity-90 mb-2">You save approximately</div>
              <div className="text-5xl font-bold mb-2">12 hrs</div>
              <div className="text-sm opacity-80">per month</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-16">Simple Pricing</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: "Starter", price: "$29", color: "bg-gray-100 text-gray-900" },
            { name: "Pro", price: "$79", color: "bg-[#FF385C] text-white shadow-xl scale-105" },
            { name: "Agency", price: "$199", color: "bg-gray-100 text-gray-900" }
          ].map((plan, i) => (
            <div key={i} className={`p-8 rounded-3xl ${plan.color} relative flex flex-col`}>
              <h3 className="text-xl font-bold mb-4">{plan.name}</h3>
              <div className="text-4xl font-bold mb-6">{plan.price}<span className="text-lg font-normal opacity-70">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-2 text-sm"><Check size={16} /> Auto-Responder</li>
                <li className="flex items-center gap-2 text-sm"><Check size={16} /> Calendar Sync</li>
                {i > 0 && <li className="flex items-center gap-2 text-sm"><Check size={16} /> Multi-Channel</li>}
                {i > 1 && <li className="flex items-center gap-2 text-sm"><Check size={16} /> Dedicated Support</li>}
              </ul>
              <button className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-opacity-90 transition-opacity">
                Select {plan.name}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
