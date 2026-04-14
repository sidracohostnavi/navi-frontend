'use client';

import React, { useState } from 'react';
import StripeConnectCard from '../../StripeConnectCard';

type Tab = 'payments' | 'payouts';

export default function PaymentsPayoutsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('payouts');

    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Payments & Payouts</h1>
            <p className="text-sm text-gray-500 mb-6">
                Manage how you receive payments from direct bookings and handle subscription billing.
            </p>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-8">
                {(['payouts', 'payments'] as Tab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === tab
                                ? 'border-[#008080] text-[#008080]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab === 'payouts' ? 'Payouts' : 'Payments'}
                    </button>
                ))}
            </div>

            {/* Payouts tab — Stripe Connect for receiving direct booking payments */}
            {activeTab === 'payouts' && (
                <StripeConnectCard />
            )}

            {/* Payments tab — coming soon */}
            {activeTab === 'payments' && (
                <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-700 mb-1">Coming Soon</h3>
                    <p className="text-sm text-gray-400 max-w-xs">
                        Subscription billing and payment management will be available here soon.
                    </p>
                </div>
            )}
        </div>
    );
}
