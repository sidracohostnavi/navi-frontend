'use client';

import Link from 'next/link';
import React from 'react';

export default function CoHostSettingsLayout() {
  const SETTINGS_CARDS = [
    {
      title: 'Connections',
      description: 'Manage platform accounts (Airbnb, VRBO) and property mappings.',
      href: '/cohost/settings/connections',
      icon: (
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      title: 'Calendar Settings',
      description: 'Manage inbound/outbound iCal feeds and sync preferences.',
      href: '/cohost/settings/calendar',
      icon: (
        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      title: 'Notification Preferences',
      description: 'Choose what events trigger email or push notifications.',
      href: '#', // Placeholder
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      )
    },
    {
      title: 'Team Members',
      description: 'Invite co-hosts and cleaners to your workspace.',
      href: '#', // Placeholder
      icon: (
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your workspace configuration and preferences</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SETTINGS_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow group flex flex-col"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                  {card.icon}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
              </div>
              <p className="text-sm text-gray-500 flex-1">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}