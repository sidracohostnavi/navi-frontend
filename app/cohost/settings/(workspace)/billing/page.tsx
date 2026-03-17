'use client';

import React from 'react';
import StripeConnectCard from '../../StripeConnectCard';

export default function BillingSettingsPage() {
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Plans & Billing</h1>
            <p className="text-gray-500 mb-8">Manage your subscription and payment methods.</p>
            
            <div className="max-w-2xl mb-8">
                <StripeConnectCard />
            </div>

            <div className="p-12 border-2 border-dashed border-gray-200 rounded-lg text-center text-gray-400">
                Subscription dashboard coming soon
            </div>
        </div>
    );
}
