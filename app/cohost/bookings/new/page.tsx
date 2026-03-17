'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function NewBookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPropertyId = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any>(null);
  
  const [form, setForm] = useState({
    propertyId: preselectedPropertyId || '',
    checkIn: '',
    checkOut: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    guestCount: 1,
    customPrice: '',
    notes: '',
  });
  
  useEffect(() => {
    fetchProperties();
  }, []);
  
  const fetchProperties = async () => {
    try {
      const res = await fetch('/api/cohost/properties');
      const data = await res.json();
      setProperties(data.properties || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    
    try {
      const res = await fetch('/api/cohost/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          customPrice: form.customPrice ? Math.round(parseFloat(form.customPrice) * 100) : null,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to create booking');
        return;
      }
      
      setSuccess(data);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleSendPaymentLink = async () => {
    if (!success?.booking?.id) return;
    
    try {
      const res = await fetch(`/api/cohost/bookings/${success.booking.id}/send-payment-link`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Payment link sent to guest!');
      } else {
        alert('Failed to send payment link');
      }
    } catch (err) {
      alert('Error sending payment link');
    }
  };
  
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center shadow-xl animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100 shadow-inner">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Booking Created</h2>
            <p className="text-gray-500 font-medium mb-8">Awaiting guest payment to confirm dates.</p>
            
            <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Direct Payment Link</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={success.paymentUrl}
                  className="flex-1 text-sm bg-white border border-gray-200 rounded-xl px-4 py-3 font-mono text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#FA5A5A]/20"
                />
                <button
                  onClick={() => {
                      navigator.clipboard.writeText(success.paymentUrl);
                      alert('Copied!');
                  }}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
                  title="Copy Link"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSendPaymentLink}
                className="w-full py-4 bg-[#FA5A5A] text-white font-bold rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.98]"
              >
                Send Link to Guest
              </button>
              <Link
                href="/cohost/calendar"
                className="w-full py-4 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all text-center"
              >
                Back to Calendar
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                <Link href="/cohost/calendar" className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors shadow-sm">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Link>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Create Manual Booking</h1>
            </div>
        </div>
        
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-200 p-8 space-y-8 shadow-sm">
          
          <div className="space-y-6">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Property & Dates</h2>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Property *</label>
                <select
                required
                value={form.propertyId}
                onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
                className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                >
                <option value="">Choose a property...</option>
                {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Check-in Date *</label>
                <input
                    type="date"
                    required
                    value={form.checkIn}
                    onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))}
                    className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                />
                </div>
                <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Check-out Date *</label>
                <input
                    type="date"
                    required
                    value={form.checkOut}
                    min={form.checkIn}
                    onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))}
                    className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                />
                </div>
              </div>
          </div>

          <div className="space-y-6">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Guest Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Guest Full Name *</label>
                    <input
                    type="text"
                    required
                    value={form.guestName}
                    onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))}
                    className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                    placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Guest Email *</label>
                    <input
                    type="email"
                    required
                    value={form.guestEmail}
                    onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))}
                    className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                    placeholder="guest@example.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Guest Phone</label>
                    <input
                    type="tel"
                    value={form.guestPhone}
                    onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))}
                    className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                    placeholder="(555) 000-0000"
                    />
                  </div>
              </div>
          </div>
          
          <div className="space-y-6">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Pricing & Notes</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Total Price (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.customPrice}
                        onChange={e => setForm(f => ({ ...f, customPrice: e.target.value }))}
                        className="w-full rounded-xl border-gray-200 border pl-8 pr-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                        placeholder="Leave blank for auto-calc"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 font-medium">If blank, we will use the property's base rates.</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Guest Count</label>
                    <input
                        type="number"
                        min="1"
                        value={form.guestCount}
                        onChange={e => setForm(f => ({ ...f, guestCount: parseInt(e.target.value) || 1 }))}
                        className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all"
                    />
                  </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Internal Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border-gray-200 border px-4 py-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#FA5A5A]/20 outline-none transition-all h-24 resize-none"
                  placeholder="Private notes for the team..."
                />
              </div>
          </div>
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex gap-2 items-center animate-in slide-in-from-top-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold text-xl rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
                <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating Booking...
                </>
            ) : 'Generate Payment Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
