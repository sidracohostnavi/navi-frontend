import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export default async function CoHostPublicPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        <div className="max-w-3xl">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            AI-Powered Property Management
          </h1>
          <p className="text-xl text-gray-500 mb-8 leading-relaxed">
            CoHost automates your vacation rental operations. From guest messaging to calendar sync and daily tasks, we handle the busy work so you can scale.
          </p>

          <div className="flex gap-4">
            {user ? (
              <Link
                href="/cohost/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/auth/login?next=/cohost/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
              >
                Sign in to CoHost <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded-full font-medium hover:bg-gray-50 transition-colors"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>

      {/* Features Preview */}
      <div id="features" className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6 text-blue-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Smart Calendar</h3>
              <p className="text-gray-500">Unified view of all your bookings across Airbnb, VRBO, and direct channels.</p>
            </div>
            <div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6 text-purple-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-3">AI Messaging</h3>
              <p className="text-gray-500">Draft responses to guest inquiries instantly using context from your property details.</p>
            </div>
            <div>
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-6 text-orange-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Daily Operations</h3>
              <p className="text-gray-500">Automated task lists for cleaning crews and maintenance tracking.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
