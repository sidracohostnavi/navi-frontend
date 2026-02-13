"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [status, setStatus] = useState('Checking invite...');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('Missing invite token.');
      return;
    }

    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const next = encodeURIComponent(`/cohost/invite?token=${token}`);
        router.replace(`/auth/login?next=${next}`);
        return;
      }

      setStatus('Accepting invite...');
      const res = await fetch('/api/cohost/users/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        router.replace('/cohost/calendar');
      } else {
        const data = await res.json();
        setStatus(data.error || 'Invite acceptance failed.');
      }
    };

    run();
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-600">
      {status}
    </div>
  );
}
