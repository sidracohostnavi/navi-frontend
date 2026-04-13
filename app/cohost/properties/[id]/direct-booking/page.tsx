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
    max_nights: '30',
    base_guests_included: '2',
    max_guests: '4',
    extra_guest_fee: '',
    extra_guest_fee_frequency: 'night',
    policy_id: '',
    additional_fees: [] as { name: string; amount: string; type: 'fixed' | 'percentage'; frequency: 'night' | 'stay' }[],
    taxes: [] as { name: string; amount: string; type: 'fixed' | 'percentage' }[],
  });

  const [initialData, setInitialData] = useState<any>(null);
  const isDirty = initialData && JSON.stringify(form) !== JSON.stringify(initialData);

  const [policies, setPolicies] = useState<any[]>([]);
  const [globalTaxes, setGlobalTaxes] = useState<any[]>([]);
  
  const [propertyName, setPropertyName] = useState('');
  const [previewData, setPreviewData] = useState<{
    coverPhoto: string; city: string; state: string;
    bedrooms: number; beds: number; bathrooms: number;
    headline: string; slug: string;
  } | null>(null);
  const [stripeDashboardUrl, setStripeDashboardUrl] = useState<string | null>(null);
  const [connectingStripe, setConnectingStripe] = useState(false);

  useEffect(() => {
    fetchListing();
    fetchPolicies();
    fetchGlobalTaxes();
    checkEmail();
  }, [propertyId]);

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/cohost/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data);
      }
    } catch (e) {
      console.error('Failed to fetch policies');
    }
  };

  const fetchGlobalTaxes = async () => {
    try {
      const res = await fetch('/api/cohost/fees');
      if (res.ok) {
        const data = await res.json();
        // Filter for taxes only
        setGlobalTaxes(data.filter((f: any) => f.is_tax));
      }
    } catch (e) {
      console.error('Failed to fetch global taxes');
    }
  };
  
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
      setWorkspaceInfo({ name: data.workspaceName, count: data.workspacePropertyCount });

      // Build preview data
      const rawPhotos: any[] = data.property.listing_photos || [];
      const coverPhoto = rawPhotos.length > 0
        ? (typeof rawPhotos[0] === 'string' ? rawPhotos[0] : rawPhotos[0]?.url || '')
        : '';
      setPreviewData({
        coverPhoto,
        city: data.property.city || '',
        state: data.property.state || '',
        bedrooms: data.property.bedrooms || 0,
        beds: data.property.beds || 0,
        bathrooms: data.property.bathrooms || 0,
        headline: data.property.headline || '',
        slug: data.property.slug || '',
      });

      // Fetch Stripe dashboard URL if connected
      if (data.stripeConnected) {
        fetch('/api/cohost/stripe/status')
          .then(r => r.json())
          .then(d => { if (d.dashboardUrl) setStripeDashboardUrl(d.dashboardUrl); })
          .catch(() => {});
      }

      // Set form values
      const initialForm = {
        direct_booking_enabled: data.property.direct_booking_enabled || false,
        slug: data.property.slug || generateSlug(data.property.name),
        headline: data.property.headline || '',
        description: data.property.description || '',
        listing_photos: data.property.listing_photos || [],
        rental_agreement_text: data.property.rental_agreement_text || '',
        nightly_rate: data.property.nightly_rate ? String(data.property.nightly_rate / 100) : '',
        cleaning_fee: data.property.cleaning_fee ? String(data.property.cleaning_fee / 100) : '',
        min_nights: String(data.property.min_nights || 1),
        max_nights: String(data.property.max_nights || 30),
        base_guests_included: String(data.property.base_guests_included || 2),
        max_guests: String(data.property.max_guests || 4),
        extra_guest_fee: data.property.extra_guest_fee ? String(data.property.extra_guest_fee) : '',
        extra_guest_fee_frequency: data.property.extra_guest_fee_frequency === 'stay' ? 'stay' : 'night',
        policy_id: data.property.policy_id || '',
        // @ts-ignore
        additional_fees: data.property.additional_fees?.map(f => ({ ...f, frequency: f.frequency === 'nightly' ? 'night' : f.frequency })) || [],
        taxes: data.property.taxes || [],
      };
      setForm(initialForm);
      setInitialData(initialForm);
      
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
        max_nights: parseInt(form.max_nights) || 30,
        base_guests_included: parseInt(form.base_guests_included) || 2,
        max_guests: parseInt(form.max_guests) || 4,
        extra_guest_fee: form.extra_guest_fee ? parseFloat(form.extra_guest_fee) : 0,
        extra_guest_fee_frequency: form.extra_guest_fee_frequency === 'night' ? 'nightly' : 'stay',
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
        const updated = { ...form, direct_booking_enabled: true };
        setForm(updated);
        setInitialData(updated);
      } else {
        setInitialData(form);
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

  const connectStripe = async () => {
    setConnectingStripe(true);
    try {
      const res = await fetch('/api/cohost/stripe/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Failed to start Stripe connection');
    } catch {
      setError('Failed to connect Stripe');
    } finally {
      setConnectingStripe(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#008080]" />
      </div>
    );
  }
  
  const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${form.slug}`;
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 pb-32">

        {/* Status badge */}
        <div className="flex items-center gap-3 mb-6">
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
            form.direct_booking_enabled
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-red-100 text-red-600 border border-red-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${form.direct_booking_enabled ? 'bg-green-500' : 'bg-red-500'}`} />
            Direct Booking: {form.direct_booking_enabled ? 'Enabled' : 'Disabled'}
          </span>
          {form.direct_booking_enabled && (
            <button onClick={handleDisable} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">Disable</button>
          )}
        </div>

        {/* Stripe section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Processing</h2>
          {stripeConnected ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Stripe Connected</p>
                  <p className="text-xs text-gray-500">Guest payments go directly to your Stripe account.</p>
                </div>
              </div>
              {stripeDashboardUrl && (
                <a href={stripeDashboardUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Stripe Dashboard
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm mb-1">Connect Stripe to accept payments</p>
                <p className="text-xs text-gray-500">Navi CoHost uses Stripe Connect so guest payments go directly to your bank. Onboarding takes ~5 minutes.</p>
              </div>
              <button onClick={connectStripe} disabled={connectingStripe}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] text-white text-sm font-semibold rounded-xl hover:bg-[#5249d4] transition-colors disabled:opacity-60 whitespace-nowrap">
                {connectingStripe
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Connecting...</>
                  : <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
                      Connect with Stripe
                    </>
                }
              </button>
            </div>
          )}
        </section>

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
          <div className="bg-[#008080]/5 border border-[#008080]/20 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-[#008080] mb-1">Your booking page is live:</p>
            <div className="flex items-center gap-2">
              <a 
                href={bookingUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#008080] hover:underline break-all"
              >
                {bookingUrl}
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(bookingUrl)}
                className="p-1 hover:bg-[#008080]/10 rounded"
                title="Copy URL"
              >
                <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  className={`flex-1 rounded-lg border px-4 py-2 focus:ring-2 focus:ring-[#008080]/30 outline-none ${slugStatus === 'taken' ? 'border-red-300 bg-red-50' : slugStatus === 'available' ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}
                  placeholder="my-property"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                   {slugStatus === 'checking' && <div className="w-4 h-4 border-2 border-gray-300 border-t-[#008080] rounded-full animate-spin"></div>}
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

          {/* ── Listing Preview card ─────────────────────────────────────── */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Listing Preview</h2>
                <p className="text-sm text-gray-500">This is how guests see your listing card.</p>
              </div>
              {form.slug && (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#008080] hover:underline font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  View live page
                </a>
              )}
            </div>

            {/* Preview card — mimics the public listing card style */}
            <div className="max-w-sm rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              {/* Cover photo */}
              <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                {previewData?.coverPhoto ? (
                  <img src={previewData.coverPhoto} alt={propertyName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-xs">Add photos in the Photos tab</span>
                  </div>
                )}
                <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold ${form.direct_booking_enabled ? 'bg-green-500 text-white' : 'bg-gray-800/70 text-white backdrop-blur-sm'}`}>
                  {form.direct_booking_enabled ? 'Live' : 'Draft'}
                </div>
              </div>

              {/* Card body */}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{propertyName || 'Your Property'}</p>
                    {(previewData?.city || previewData?.state) && (
                      <p className="text-sm text-gray-500">{[previewData.city, previewData.state].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>

                {/* Headline */}
                {form.headline && (
                  <p className="text-sm text-gray-600 line-clamp-2">{form.headline}</p>
                )}

                {/* Stats row */}
                {previewData && (previewData.bedrooms > 0 || previewData.beds > 0 || previewData.bathrooms > 0) && (
                  <p className="text-xs text-gray-400">
                    {[
                      previewData.bedrooms ? `${previewData.bedrooms} bed${previewData.bedrooms !== 1 ? 'rooms' : 'room'}` : null,
                      previewData.beds ? `${previewData.beds} bed${previewData.beds !== 1 ? 's' : ''}` : null,
                      previewData.bathrooms ? `${previewData.bathrooms} bath${previewData.bathrooms !== 1 ? 's' : ''}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Price */}
                <div className="pt-1 border-t border-gray-100 flex items-baseline gap-1">
                  {form.nightly_rate ? (
                    <>
                      <span className="font-bold text-gray-900">${parseFloat(form.nightly_rate).toFixed(0)}</span>
                      <span className="text-sm text-gray-500">/ night</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Set nightly rate in Pricing tab</span>
                  )}
                </div>
              </div>
            </div>

            {/* Checklist of required fields */}
            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Requirements to go live</p>
              <div className="space-y-2">
                {[
                  { label: 'Booking URL slug', done: !!form.slug && slugStatus !== 'taken' },
                  { label: 'Headline', done: !!form.headline },
                  { label: 'Description', done: !!form.description },
                  { label: 'Nightly rate', done: !!form.nightly_rate },
                  { label: 'Stripe connected', done: stripeConnected },
                  { label: 'Email verified', done: emailConfirmed },
                  { label: 'Rental agreement or booking policy', done: !!form.rental_agreement_text || !!form.policy_id },
                  { label: 'Cover photo', done: !!(previewData?.coverPhoto) },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {done
                        ? <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        : <svg className="w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      }
                    </div>
                    <span className={`text-sm ${done ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* Save FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={() => handleSave()}
          disabled={saving || !isDirty}
          className={`px-10 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed ${
            isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-400 text-white'
          }`}
        >
          {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block vertical-middle" />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
