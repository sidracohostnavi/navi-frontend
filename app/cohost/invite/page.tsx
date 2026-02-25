"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const INVITE_TOKEN_KEY = 'navi_pending_invite_token';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [status, setStatus] = useState('Checking invite...');
  const [errorState, setErrorState] = useState(false);

  useEffect(() => {
    const run = async () => {
      // Get token from URL or from localStorage/cookies (persisted before OAuth redirect)
      let token = searchParams.get('token');

      // Debug current state
      console.log('[Invite Page] Current URL:', window.location.href);
      console.log('[Invite Page] Token from params:', token);

      if (token) {
        // Save token to localStorage AND cookie BEFORE any auth redirect can lose it
        localStorage.setItem(INVITE_TOKEN_KEY, token);
        document.cookie = `${INVITE_TOKEN_KEY}=${token}; path=/; max-age=600`; // 10 mins
        console.log('[Invite Page] Saved token to storage & cookie');
      } else {
        // No token in URL — try to recover from localStorage
        token = localStorage.getItem(INVITE_TOKEN_KEY);
        console.log('[Invite Page] Token from localStorage:', token);

        // Fallback: try to recover from cookie
        if (!token) {
          const match = document.cookie.match(new RegExp('(^| )' + INVITE_TOKEN_KEY + '=([^;]+)'));
          if (match) {
            token = match[2];
            console.log('[Invite Page] Token from cookie:', token);
          }
        }
      }

      if (!token) {
        setStatus('Missing invite token.');
        setErrorState(true);
        return;
      }

      // Check if user is signed in
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Not signed in — redirect to login. Ensure token is passed in the URL.
        const nextPath = token ? `/cohost/invite?token=${token}` : '/cohost/invite';
        const next = encodeURIComponent(nextPath);
        router.replace(`/auth/login?next=${next}`);
        return;
      }

      // User is signed in — attempt to accept the invite
      setStatus('Accepting invite...');
      try {
        const res = await fetch('/api/cohost/users/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (res.ok) {
          // Success — clean up stored token and redirect to calendar
          localStorage.removeItem(INVITE_TOKEN_KEY);
          document.cookie = `${INVITE_TOKEN_KEY}=; path=/; max-age=0`;
          router.replace('/cohost/calendar');
        } else {
          // Sign out to prevent unauthorized access
          await supabase.auth.signOut();

          if (data.error === 'Invite email mismatch') {
            // Permanent failure — wrong account. Keep token so they can retry with correct account.
            setStatus(`This invite is for a different email address. You signed in as ${user.email}. Please sign in with the correct account.`);
          } else if (data.error === 'Invite not found') {
            localStorage.removeItem(INVITE_TOKEN_KEY);
            document.cookie = `${INVITE_TOKEN_KEY}=; path=/; max-age=0`;
            setStatus('This invite has already been used or does not exist.');
          } else if (data.error === 'Invite expired') {
            localStorage.removeItem(INVITE_TOKEN_KEY);
            document.cookie = `${INVITE_TOKEN_KEY}=; path=/; max-age=0`;
            setStatus('This invite has expired. Please ask the workspace owner for a new invite.');
          } else {
            // Retryable error (server error, constraint violation, etc.) — KEEP the token
            setStatus(data.details || data.error || 'Something went wrong. Please try again.');
          }
          setErrorState(true);
        }
      } catch (err) {
        setStatus('Network error. Please try again.');
        setErrorState(true);
      }
    };

    run();
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {errorState ? 'Invite Error' : 'Accepting Invite'}
        </h2>
        <p className="text-gray-600 mb-6">{status}</p>
        {errorState && (
          <div className="space-y-3">
            {status.includes('different email') && (
              <button
                onClick={() => {
                  // Re-store the token and redirect to login
                  const token = searchParams.get('token') || localStorage.getItem(INVITE_TOKEN_KEY);
                  if (token) localStorage.setItem(INVITE_TOKEN_KEY, token);
                  window.location.href = `/auth/login?next=${encodeURIComponent('/cohost/invite')}`;
                }}
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try a Different Account
              </button>
            )}
            <div>
              <a href="/" className="text-sm text-gray-500 hover:text-gray-700">
                Back to Home
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p>Loading...</p></div>}>
      <InviteContent />
    </Suspense>
  );
}
