'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function SuccessContent() {
  const searchParams = useSearchParams();
  const holdId = searchParams.get('hold_id');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md text-center border border-teal-50">
        <div className="text-7xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-3xl font-black text-gray-900 mb-3">Booking Confirmed!</h1>
        <p className="text-gray-600 mb-8 text-lg">
          Thank you for your payment. Your reservation is now officially confirmed.
        </p>
        
        <div className="bg-teal-50 rounded-2xl p-6 mb-8 text-left">
          <h2 className="text-sm font-bold text-teal-800 uppercase tracking-widest mb-3">Next Steps</h2>
          <ul className="space-y-3 text-teal-900 text-sm">
            <li className="flex gap-2">
              <span>📧</span>
              Check your inbox for a confirmation email with all details.
            </li>
            <li className="flex gap-2">
              <span>🏠</span>
              The host will send check-in instructions 3 days before arrival.
            </li>
          </ul>
        </div>

        <div className="text-xs text-gray-400">
          Booking Reference: <span className="font-mono font-bold text-gray-500">{holdId?.slice(-8).toUpperCase() || 'DIRECT-BOOKING'}</span>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Confirming your reservation...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
