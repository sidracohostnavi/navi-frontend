'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function ConfirmationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl p-10 max-w-md w-full text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-green-100">
          <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Booking Confirmed!</h1>
        <p className="text-gray-600 mb-8 leading-relaxed font-medium">
          Fantastic! Your stay is now officially secured. We've sent a detailed confirmation email and receipt to your inbox.
        </p>

        <div className="bg-[#FA5A5A]/5 rounded-2xl p-6 mb-10 border border-[#FA5A5A]/10">
            <h3 className="text-xs font-bold text-[#FA5A5A] uppercase tracking-widest mb-2">What's next?</h3>
            <p className="text-sm text-[#FA5A5A] font-medium leading-normal">
                Prepare for your trip! Feel free to reach out to Navie Support if you have any questions before arrival{dots}
            </p>
        </div>
        
        <Link
          href={`/book/${slug}`}
          className="inline-flex items-center justify-center w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all active:scale-[0.98] shadow-lg"
        >
          Return to Property
        </Link>
        
        {sessionId && (
            <p className="text-[10px] text-gray-300 mt-6 uppercase tracking-wider">
                Ref: {sessionId.split('-')[0]}
            </p>
        )}
      </div>
    </div>
  );
}
