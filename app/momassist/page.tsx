'use client';

import { Heart, Calendar, Mail, ArrowRight, Check } from 'lucide-react';

export default function MomAssistPage() {
    return (
        <div className="bg-white text-gray-900">
            {/* Hero Section (Coral/Pink) */}
            <section className="bg-[#FB7185] text-white py-24 px-6 relative overflow-hidden">
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-1 rounded-full text-sm font-semibold mb-6">
                        Your Family's Chief Operating Officer
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
                        Chaos, Managed.
                    </h1>
                    <p className="text-xl md:text-2xl opacity-90 mb-12 max-w-2xl mx-auto">
                        MomAssist filters school emails, updates the family calendar, and meal plans so you can actually breathe.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button className="bg-white text-[#FB7185] px-8 py-4 rounded-xl font-bold text-lg hover:shadow-lg transition-transform hover:-translate-y-1">
                            Join the Family
                        </button>
                    </div>
                </div>
            </section>

            {/* Feature Grid */}
            <section className="py-24 px-6 max-w-6xl mx-auto">
                <div className="grid md:grid-cols-3 gap-12">
                    {[
                        { icon: Mail, title: "School Email Summary", desc: "No more reading 5-page newsletters. Get the bullets." },
                        { icon: Calendar, title: "Calendar Sync", desc: "Dates from emails go straight to your iCal/Google Cal." },
                        { icon: Heart, title: "Meal Planning", desc: "Grocery lists generated from your family's preferences." }
                    ].map((item, i) => (
                        <div key={i} className="bg-rose-50 p-8 rounded-3xl hover:bg-rose-100 transition-colors">
                            <div className="w-12 h-12 bg-[#FB7185] text-white rounded-xl flex items-center justify-center mb-6">
                                <item.icon size={24} />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-gray-900">{item.title}</h3>
                            <p className="text-gray-600">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Testimonial / Logic */}
            <section className="bg-[#FFF1F2] py-24 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl font-bold text-[#9F1239] mb-8">
                        "I used to spend Sunday nights drowning in emails. Now MomAssist handles it on Friday afternoon."
                    </h2>
                    <div className="flex items-center justify-center gap-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-full" />
                        <div className="text-left">
                            <div className="font-bold text-gray-900">Sarah J.</div>
                            <div className="text-sm text-gray-500">Mom of 3, Austin TX</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="py-24 px-6 max-w-5xl mx-auto">
                <h2 className="text-4xl font-bold text-center mb-16">Family Plans</h2>
                <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
                    <div className="p-8 rounded-3xl border border-gray-100 hover:border-[#FB7185] transition-colors relative">
                        <h3 className="text-xl font-bold mb-2">Essential</h3>
                        <div className="text-3xl font-bold mb-6">$15<span className="text-sm font-normal text-gray-500">/mo</span></div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex gap-2 text-sm"><Check size={16} className="text-[#FB7185]" /> Email Support</li>
                            <li className="flex gap-2 text-sm"><Check size={16} className="text-[#FB7185]" /> Calendar Sync</li>
                        </ul>
                        <button className="w-full py-3 border border-black rounded-xl font-bold hover:bg-gray-50">Select</button>
                    </div>
                    <div className="p-8 rounded-3xl bg-[#FB7185] text-white shadow-xl relative transform md:-translate-y-4">
                        <div className="absolute top-4 right-4 bg-white/20 text-xs px-2 py-1 rounded-full">Most Popular</div>
                        <h3 className="text-xl font-bold mb-2">SuperMom</h3>
                        <div className="text-3xl font-bold mb-6">$29<span className="text-sm font-normal opacity-80">/mo</span></div>
                        <ul className="space-y-3 mb-8 text-white/90">
                            <li className="flex gap-2 text-sm"><Check size={16} /> Everything in Essential</li>
                            <li className="flex gap-2 text-sm"><Check size={16} /> Meal Planning</li>
                            <li className="flex gap-2 text-sm"><Check size={16} /> Shopping Lists</li>
                        </ul>
                        <button className="w-full py-3 bg-white text-[#FB7185] rounded-xl font-bold hover:bg-opacity-90">Select</button>
                    </div>
                </div>
            </section>
        </div>
    );
}
