'use client';

import { useState, useEffect } from 'react';

export default function StripeConnectCard() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cohost/stripe/status');
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch Stripe status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/cohost/stripe/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to start Stripe connection');
      }
    } catch (error) {
      console.error('Failed to connect Stripe:', error);
      alert('Failed to connect Stripe');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse h-20 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" fill="#635BFF"/>
              <path d="M12.5 8.5C11.12 8.5 10.5 9.12 10.5 9.75C10.5 10.88 12.25 11.12 12.25 12.25C12.25 12.62 12 13 11.25 13C10.5 13 10 12.5 10 12.5L9.5 13.5C9.5 13.5 10.12 14 11.25 14C12.62 14 13.5 13.25 13.5 12.25C13.5 11 11.75 10.75 11.75 9.75C11.75 9.38 12 9 12.5 9C13 9 13.5 9.5 13.5 9.5L14 8.5C14 8.5 13.38 8.5 12.5 8.5Z" fill="white"/>
            </svg>
            Stripe Payments
          </h3>
          <p className="text-gray-600 mt-1 text-sm">
            Connect your Stripe account to receive direct booking payments.
          </p>
        </div>
        
        {status?.chargesEnabled ? (
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
            Connected
          </span>
        ) : status?.connected ? (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
            Incomplete
          </span>
        ) : null}
      </div>
      
      <div className="mt-4">
        {status?.chargesEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-green-600">
              ✓ Your Stripe account is connected and ready to accept payments.
            </p>
            {status.dashboardUrl && (
              <a
                href={status.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Open Stripe Dashboard
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-yellow-600">
              Your Stripe account setup is incomplete. Please complete onboarding to accept payments.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 bg-[#635BFF] text-white font-medium rounded-lg hover:bg-[#5046e5] transition-colors disabled:opacity-50"
            >
              {connecting ? 'Redirecting...' : 'Complete Setup'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-[#635BFF] text-white font-medium rounded-lg hover:bg-[#5046e5] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {connecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Stripe'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
