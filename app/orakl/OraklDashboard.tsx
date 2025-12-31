// app/orakl/OraklDashboard.tsx
'use client';

import { useRouter } from 'next/navigation';
import { getOraklBrowserClient } from '@/lib/supabaseOraklClient';
import type { User } from '@supabase/supabase-js';

interface OraklDashboardProps {
  user: User;
}

export default function OraklDashboard({ user }: OraklDashboardProps) {
  const router = useRouter();
  const supabase = getOraklBrowserClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/orakl/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Orakl Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Logged in as: {user.email}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Welcome to Orakl</h2>
          <p className="text-gray-600">
            Your protected Orakl content goes here.
          </p>
        </div>
      </div>
    </div>
  );
}