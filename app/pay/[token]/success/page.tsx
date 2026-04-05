'use client';

import Link from 'next/link';
import { use } from 'react';

export default function PaymentSuccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl p-10 max-w-md w-full text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-green-100">
          <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Payment Received!</h1>
        <p className="text-gray-600 mb-10 leading-relaxed font-medium">
          Thank you! Your payment has been processed successfully and your booking is now confirmed. You will receive a formal confirmation email shortly.
        </p>

        <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100 italic">
            <p className="text-sm text-gray-500 leading-normal">
                "We look forward to hosting you. Safe travels!"
            </p>
        </div>
        
        <div className="text-xs text-gray-400 uppercase tracking-widest mb-2 font-bold">Ref Token</div>
        <div className="text-[10px] text-gray-300 font-mono mb-8">{token}</div>
        
        <p className="text-sm text-gray-400">
            You can now close this window.
        </p>
      </div>
    </div>
  );
}
