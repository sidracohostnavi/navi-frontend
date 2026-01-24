'use client';

import React from 'react';
import Link from 'next/link';

export default function PropertiesSettingsPage() {
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-3xl mx-auto">
                <Link
                    href="/cohost/settings"
                    className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Settings
                </Link>

                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
                    <p className="text-gray-600 mt-1">Manage your properties and listing details.</p>
                </header>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">Properties Management</h3>
                    <p className="text-gray-500 mt-2 max-w-sm mx-auto">This page is under construction. Soon you will be able to add and edit your properties here.</p>
                </div>
            </div>
        </div>
    );
}
