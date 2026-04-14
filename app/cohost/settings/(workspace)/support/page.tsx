'use client';

import React from 'react';
import { Mail } from 'lucide-react';

export default function SupportPage() {
    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Support</h1>
            <p className="text-sm text-gray-500 mb-8">Get help with Navi CoHost.</p>

            <div className="border border-gray-200 rounded-xl p-6 flex items-start gap-4">
                <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-[#008080]" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Email Support</h3>
                    <p className="text-sm text-gray-500 mb-3">
                        Have a question or found an issue? Send us an email and we'll get back to you as soon as possible.
                    </p>
                    <a
                        href="mailto:sidra@navicohost.com"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-[#006666] transition-colors"
                    >
                        <Mail className="w-4 h-4" />
                        Contact Support
                    </a>
                </div>
            </div>
        </div>
    );
}
