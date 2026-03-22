'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateSlug } from '@/lib/utils/slug';
import { createClient } from '@/lib/supabase/client';

export default function DirectBookingEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [workspaceInfo, setWorkspaceInfo] = useState({ name: '', count: 1 });
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [slugError, setSlugError] = useState('');
  
  const [form, setForm] = useState({
    direct_booking_enabled: false,
    slug: '',
    headline: '',
    description: '',
    listing_photos: [] as string[],
    rental_agreement_text: '',
    nightly_rate: '',
    cleaning_fee: '',
    min_nights: '1',
  });
  
  const [propertyName, setPropertyName] = useState('');
  
  useEffect(() => {
    fetchListing();
    checkEmail();
  }, [propertyId]);
  
  const checkEmail = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !user.email_confirmed_at) {
      setEmailConfirmed(false);
    }
  };
  
  const fetchListing = async () => {
    try {
      const res = await fetch(`/api/cohost/properties/${propertyId}/listing`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        return;
      }
      
      setStripeConnected(data.stripeConnected);
      setPropertyName(data.property.name);
      setWorkspaceInfo({
        name: data.workspaceName,
        count: data.workspacePropertyCount
      });
      
      // Set form values
      setForm({
        direct_booking_enabled: data.property.direct_booking_enabled || false,
        slug: data.property.slug || generateSlug(data.property.name),
        headline: data.property.headline || '',
        description: data.property.description || '',
        listing_photos: data.property.listing_photos || [],
        rental_agreement_text: data.property.rental_agreement_text || '',
        nightly_rate: data.property.nightly_rate ? String(data.property.nightly_rate / 100) : '',
        cleaning_fee: data.property.cleaning_fee ? String(data.property.cleaning_fee / 100) : '',
        min_nights: String(data.property.min_nights || 1),
      });
      
    } catch (err) {
      setError('Failed to load listing data');
    } finally {
      setLoading(false);
    }
  };
  
  // Real-time slug check
  useEffect(() => {
    if (!form.slug || loading) return;
    
    const checkSlug = async () => {
      setSlugStatus('checking');
      setSlugSuggestions([]);
      setSlugError('');
      
      try {
        // We can just use the exact same PUT saving endpoint to validate 
        // by catching the "This URL is already taken" 400 error cleanly.
        const res = await fetch(`/api/cohost/properties/${propertyId}/listing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: form.slug }),
        });
        
        const data = await res.json();
        
        if (!res.ok && data.error === 'This URL is already taken. Please choose a different one.') {
            setSlugStatus('taken');
            setSlugError('That URL is already taken.');
            
            // Generate suggestions based on workspace count
            const baseSlug = form.slug;
            const suggestions = [];
            
            if (workspaceInfo.count === 1) {
              // 1 Property: simple suffix
              suggestions.push(`${baseSlug}-1`, `${baseSlug}-2`, `${baseSlug}-${Math.floor(Math.random() * 1000)}`);
            } else {
              // Multi-property: prefix with workspace name
              const prefix = generateSlug(workspaceInfo.name);
              if (prefix) {
                suggestions.push(`${prefix}-${baseSlug}`);
              } else {
                suggestions.push(`${baseSlug}-1`, `${baseSlug}-2`);
              }
            }
            setSlugSuggestions(suggestions);
        } else if (res.ok) {
            setSlugStatus('available');
        } else {
           setSlugStatus('idle'); // Other types of errors (like format) are handled on main save
        }
      } catch (err) {
        setSlugStatus('idle');
      }
    };
    
    const timer = setTimeout(checkSlug, 600);
    return () => clearTimeout(timer);
  }, [form.slug, propertyId, loading, workspaceInfo]);
  
  const handleSave = async (enableAfterSave = false) => {
    setError('');
    setSuccess('');
    setSaving(true);
    
    try {
      const payload = {
        ...form,
        direct_booking_enabled: enableAfterSave ? true : form.direct_booking_enabled,
        nightly_rate: form.nightly_rate ? Math.round(parseFloat(form.nightly_rate) * 100) : null,
        cleaning_fee: form.cleaning_fee ? Math.round(parseFloat(form.cleaning_fee) * 100) : 0,
        min_nights: parseInt(form.min_nights) || 1,
      };
      
      const res = await fetch(`/api/cohost/properties/${propertyId}/listing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      
      setSuccess('Saved successfully!');
      if (enableAfterSave) {
        setForm(f => ({ ...f, direct_booking_enabled: true }));
      }
      
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };
  
  const handleDisable = async () => {
    if (!confirm('Disable direct booking for this property?')) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/cohost/properties/${propertyId}/listing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direct_booking_enabled: false }),
      });
      
      if (res.ok) {
        setForm(f => ({ ...f, direct_booking_enabled: false }));
        setSuccess('Direct booking disabled');
      }
    } catch (err) {
      setError('Failed to disable');
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }
  
  const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${form.slug}`;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/cohost/properties/${propertyId}`} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="font-semibold text-gray-900">Direct Booking</h1>
              <p className="text-sm text-gray-500">{propertyName}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {form.direct_booking_enabled && (
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                Live
              </span>
            )}
          </div>
        </div>
      </header>
      
      <div className="max-w-4xl mx-auto px-4 py-8 pb-32">
        {/* Stripe Warning */}
        {!stripeConnected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-yellow-800">Stripe not connected</p>
              <p className="text-sm text-yellow-700 mt-1">
                You need to connect Stripe before enabling direct booking.{' '}
                <Link href="/cohost/settings/billing" className="underline">Go to Settings</Link>
              </p>
            </div>
          </div>
        )}
        
        {/* Email Warning */}
        {!emailConfirmed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-yellow-800">Email not verified</p>
              <p className="text-sm text-yellow-700 mt-1">
                You must verify your email address before you can publish a direct booking page.
              </p>
            </div>
          </div>
        )}
        
        {/* Status Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
            {success}
          </div>
        )}
        
        {/* Live URL */}
        {form.direct_booking_enabled && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-blue-900 mb-1">Your booking page is live:</p>
            <div className="flex items-center gap-2">
              <a 
                href={bookingUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {bookingUrl}
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(bookingUrl)}
                className="p-1 hover:bg-blue-100 rounded"
                title="Copy URL"
              >
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {/* Form Sections */}
        <div className="space-y-8">
          
          {/* Booking Page URL */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Page URL</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Slug
              </label>
              <div className="flex items-center gap-2 relative">
                <span className="text-gray-500 text-sm">cohostnavi.com/book/</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => {
                    setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
                    setSlugStatus('idle');
                  }}
                  className={`flex-1 rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none ${slugStatus === 'taken' ? 'border-red-300 bg-red-50' : slugStatus === 'available' ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}
                  placeholder="my-property"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                   {slugStatus === 'checking' && <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>}
                   {slugStatus === 'available' && <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              
              {slugStatus === 'taken' && (
                  <div className="mt-3">
                      <p className="text-sm font-medium text-red-600 mb-2">{slugError}</p>
                      <p className="text-xs text-gray-500 mb-2">Available suggestions:</p>
                      <div className="flex flex-wrap gap-2">
                          {slugSuggestions.map(suggestion => (
                              <button
                                key={suggestion}
                                onClick={() => {
                                    setForm(f => ({ ...f, slug: suggestion }));
                                    setSlugStatus('idle');
                                }}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                              >
                                {suggestion}
                              </button>
                          ))}
                      </div>
                  </div>
              )}
              
              <p className="text-xs text-gray-500 mt-2">
                Only lowercase letters, numbers, and hyphens. This cannot be changed once bookings exist.
              </p>
            </div>
          </section>
          
          {/* Listing Content */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Listing Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Headline *
                </label>
                <input
                  type="text"
                  value={form.headline}
                  onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Beautiful beachfront cottage with stunning views"
                  maxLength={100}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-40"
                  placeholder="Describe your property..."
                />
              </div>
            </div>
          </section>
          
          {/* Pricing */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nightly Rate *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.nightly_rate}
                    onChange={e => setForm(f => ({ ...f, nightly_rate: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 border pl-7 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="150.00"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cleaning Fee
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cleaning_fee}
                    onChange={e => setForm(f => ({ ...f, cleaning_fee: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 border pl-7 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="75.00"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Nights
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.min_nights}
                  onChange={e => setForm(f => ({ ...f, min_nights: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </section>
          
          {/* Rental Agreement */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Rental Agreement</h2>
            <p className="text-sm text-gray-600 mb-4">
              Guests must accept this agreement before completing their booking.
            </p>
            <textarea
              value={form.rental_agreement_text}
              onChange={e => setForm(f => ({ ...f, rental_agreement_text: e.target.value }))}
              className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-64 font-mono text-sm"
              placeholder="Enter your rental agreement terms..."
            />
          </section>
          
        </div>
      </div>
      
      {/* Footer Actions */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            {form.direct_booking_enabled && (
              <button
                onClick={handleDisable}
                disabled={saving}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Disable Direct Booking
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            
            {!form.direct_booking_enabled && stripeConnected && (
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !emailConfirmed}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Save & Enable
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
