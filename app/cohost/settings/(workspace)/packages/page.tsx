'use client';

import React from 'react';
import { Check } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter',
    price: 19,
    properties: 1,
    perProperty: null,
    highlight: false,
    features: [
      'Up to 1 property',
      'Unlimited bookings',
      'Cleaning & task management',
      'Team members (cleaners)',
      'Calendar sync (iCal)',
      'Direct booking page',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    price: 49,
    properties: 5,
    perProperty: '~$9.80 / property',
    highlight: true,
    features: [
      'Up to 5 properties',
      'Unlimited bookings',
      'Cleaning & task management',
      'Team members (cleaners)',
      'Calendar sync (iCal)',
      'Direct booking page',
      'Priority email support',
    ],
  },
  {
    name: 'Pro',
    price: 89,
    properties: 10,
    perProperty: '~$8.90 / property',
    highlight: false,
    features: [
      'Up to 10 properties',
      'Unlimited bookings',
      'Cleaning & task management',
      'Team members (cleaners)',
      'Calendar sync (iCal)',
      'Direct booking page',
      'Priority support',
    ],
  },
];

export default function PackagesPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Plans & Packages</h1>
      <p className="text-sm text-gray-500 mb-8">
        Simple, transparent pricing based on how many properties you manage.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl">
        {PLANS.map(plan => (
          <div
            key={plan.name}
            className={`bg-white rounded-2xl border-2 p-6 flex flex-col ${
              plan.highlight ? 'border-[#008080] shadow-md' : 'border-gray-200'
            }`}
          >
            {plan.highlight && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#008080] mb-3">
                Most Popular
              </div>
            )}

            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-sm text-gray-500">/ month</span>
              </div>
              {plan.perProperty && (
                <div className="text-xs text-gray-400 mt-0.5">{plan.perProperty}</div>
              )}
              <div className="text-sm text-gray-600 mt-2">
                Up to{' '}
                <span className="font-semibold text-gray-900">{plan.properties}</span>{' '}
                {plan.properties === 1 ? 'property' : 'properties'}
              </div>
            </div>

            <ul className="space-y-2.5 flex-1">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                  <Check
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      plan.highlight ? 'text-[#008080]' : 'text-gray-400'
                    }`}
                  />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <div
                className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center select-none ${
                  plan.highlight
                    ? 'bg-[#008080]/10 text-[#008080] border-2 border-[#008080]/40'
                    : 'bg-gray-100 text-gray-400 border-2 border-gray-100'
                }`}
              >
                Coming Soon
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 max-w-4xl p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">Need more than 10 properties?</span>{' '}
          Contact us at{' '}
          <a
            href="mailto:hello@navicohost.com"
            className="text-[#008080] hover:underline"
          >
            hello@navicohost.com
          </a>{' '}
          for enterprise pricing.
        </p>
      </div>
    </div>
  );
}
