'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button onClick={onChange}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${value ? 'bg-[#008080]' : 'bg-gray-200'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{children}</p>
);

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008080]/20 text-gray-700 bg-white";
const selectCls = `${inputCls} appearance-none bg-gray-50`;

export default function PropertyPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [globalTaxes, setGlobalTaxes] = useState<any[]>([]);

  // iCal feeds
  const [feeds, setFeeds] = useState<any[]>([]);
  const [syncingFeed, setSyncingFeed] = useState<string | null>(null);
  const [newFeed, setNewFeed] = useState({ source_name: '', ical_url: '' });
  const [addingFeed, setAddingFeed] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);

  const [form, setForm] = useState({
    nightly_rate: '',
    cleaning_fee: '',
    min_nights: '1',
    max_nights: '30',
    base_guests_included: '2',
    max_guests: '4',
    extra_guest_fee: '0',
    extra_guest_fee_frequency: 'night' as 'night' | 'stay',
    additional_fees: [] as any[],
    taxes: [] as any[],
    advance_notice_days: 0,
    allow_last_minute_requests: false,
    same_day_advance_notice_time: '18:00',
    preparation_time_days: 0,
    availability_window_months: 12,
    allow_request_beyond_window: false,
    is_unavailable_by_default: false,
  });

  const [initialData, setInitialData] = useState<any>(null);
  const isDirty = initialData && JSON.stringify(form) !== JSON.stringify(initialData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [listingRes, feeRes, { data: feedData }] = await Promise.all([
          fetch(`/api/cohost/properties/${propertyId}/listing`),
          fetch('/api/cohost/fees'),
          supabase.from('ical_feeds').select('*').eq('property_id', propertyId).order('created_at'),
        ]);

        if (listingRes.ok) {
          const data = await listingRes.json();
          const p = data.property;
          const initialForm = {
            nightly_rate: p.nightly_rate ? (p.nightly_rate / 100).toString() : '',
            cleaning_fee: p.cleaning_fee ? (p.cleaning_fee / 100).toString() : '',
            min_nights: p.min_nights?.toString() || '1',
            max_nights: p.max_nights?.toString() || '30',
            base_guests_included: p.base_guests_included?.toString() || '2',
            max_guests: p.max_guests?.toString() || '4',
            extra_guest_fee: p.extra_guest_fee?.toString() || '0',
            extra_guest_fee_frequency: (p.extra_guest_fee_frequency === 'stay' ? 'stay' : 'night') as 'night' | 'stay',
            additional_fees: p.additional_fees || [],
            taxes: p.taxes || [],
            advance_notice_days: p.advance_notice_days ?? 0,
            allow_last_minute_requests: p.allow_last_minute_requests ?? false,
            same_day_advance_notice_time: p.same_day_advance_notice_time || '18:00',
            preparation_time_days: p.preparation_time_days ?? 0,
            availability_window_months: p.availability_window_months ?? 12,
            allow_request_beyond_window: p.allow_request_beyond_window ?? false,
            is_unavailable_by_default: p.is_unavailable_by_default ?? false,
          };
          setForm(initialForm);
          setInitialData(initialForm);
        }

        if (feeRes.ok) {
          const feeData = await feeRes.json();
          setGlobalTaxes(feeData.filter((f: any) => f.is_tax));
        }

        if (feedData) setFeeds(feedData);
      } catch (err) {
        console.error('Failed to fetch pricing data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [propertyId]);

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const payload = {
        ...form,
        nightly_rate: form.nightly_rate ? Math.round(parseFloat(form.nightly_rate) * 100) : null,
        cleaning_fee: form.cleaning_fee ? Math.round(parseFloat(form.cleaning_fee) * 100) : 0,
        min_nights: parseInt(form.min_nights) || 1,
        max_nights: parseInt(form.max_nights) || 30,
        base_guests_included: parseInt(form.base_guests_included) || 2,
        max_guests: parseInt(form.max_guests) || 4,
        extra_guest_fee: form.extra_guest_fee ? parseFloat(form.extra_guest_fee) : 0,
        extra_guest_fee_frequency: form.extra_guest_fee_frequency === 'night' ? 'nightly' : 'stay',
        advance_notice_days: form.advance_notice_days,
        allow_last_minute_requests: form.allow_last_minute_requests,
        same_day_advance_notice_time: form.same_day_advance_notice_time,
        preparation_time_days: form.preparation_time_days,
        availability_window_months: form.availability_window_months,
        allow_request_beyond_window: form.allow_request_beyond_window,
        is_unavailable_by_default: form.is_unavailable_by_default,
      };
      const res = await fetch(`/api/cohost/properties/${propertyId}/listing`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save'); return; }
      setSuccess('Saved!');
      setInitialData(form);
      setTimeout(() => setSuccess(''), 3000);
    } catch { setError('Failed to save'); }
    finally { setSaving(false); }
  };

  const syncFeed = async (feedId: string) => {
    setSyncingFeed(feedId);
    try {
      await fetch('/api/cohost/ical/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, feed_id: feedId }),
      });
      const { data } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId).order('created_at');
      if (data) setFeeds(data);
    } finally { setSyncingFeed(null); }
  };

  const toggleFeed = async (feed: any) => {
    if (feed.is_active) {
      await fetch('/api/cohost/ical/feed/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feed_id: feed.id }),
      });
    } else {
      await supabase.from('ical_feeds').update({ is_active: true }).eq('id', feed.id);
    }
    const { data } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId).order('created_at');
    if (data) setFeeds(data);
  };

  const addFeed = async () => {
    if (!newFeed.source_name.trim() || !newFeed.ical_url.trim()) return;
    setAddingFeed(true);
    try {
      const { error } = await supabase.from('ical_feeds').insert({
        property_id: propertyId, source_name: newFeed.source_name.trim(),
        ical_url: newFeed.ical_url.trim(), source_type: 'other', is_active: true,
      });
      if (!error) {
        setNewFeed({ source_name: '', ical_url: '' });
        setShowAddFeed(false);
        const { data } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId).order('created_at');
        if (data) setFeeds(data);
      }
    } finally { setAddingFeed(false); }
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <main className="max-w-4xl mx-auto p-4 pb-32 space-y-4 animate-fadeIn">
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-100 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm">{success}</div>}

      {/* ── PRICING ─────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Pricing</h2>

        {/* Row 1: money */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Nightly Rate *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" value={form.nightly_rate} onChange={e => setForm(f => ({ ...f, nightly_rate: e.target.value }))}
                className={`${inputCls} pl-6`} placeholder="150" />
            </div>
          </div>
          <div>
            <Label>Cleaning Fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" value={form.cleaning_fee} onChange={e => setForm(f => ({ ...f, cleaning_fee: e.target.value }))}
                className={`${inputCls} pl-6`} placeholder="75" />
            </div>
          </div>
          <div>
            <Label>Base Guests Included</Label>
            <input type="number" value={form.base_guests_included} onChange={e => setForm(f => ({ ...f, base_guests_included: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <Label>Max Guests</Label>
            <input type="number" value={form.max_guests} onChange={e => setForm(f => ({ ...f, max_guests: e.target.value }))} className={inputCls} />
          </div>
        </div>

        {/* Row 2: extra guest fee */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <Label>Extra Guest Fee</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" value={form.extra_guest_fee} onChange={e => setForm(f => ({ ...f, extra_guest_fee: e.target.value }))}
                  className={`${inputCls} pl-6`} placeholder="25" />
              </div>
              <div className="flex bg-gray-100 rounded-lg p-1 shrink-0">
                {(['night', 'stay'] as const).map(freq => (
                  <button key={freq} onClick={() => setForm(f => ({ ...f, extra_guest_fee_frequency: freq }))}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${form.extra_guest_fee_frequency === freq ? 'bg-[#008080] text-white shadow' : 'text-gray-500'}`}>
                    /{freq}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Additional Fees */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Additional Fees</Label>
            <button onClick={() => setForm(f => ({ ...f, additional_fees: [...f.additional_fees, { name: '', amount: '', type: 'fixed', frequency: 'stay' }] }))}
              className="text-[#008080] text-xs font-semibold flex items-center gap-1 hover:text-[#006666]">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Fee
            </button>
          </div>
          {form.additional_fees.length === 0
            ? <p className="text-xs text-gray-400 italic">None added.</p>
            : form.additional_fees.map((fee, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 flex-wrap">
                <input type="text" placeholder="Fee name" value={fee.name}
                  onChange={e => { const n = [...form.additional_fees]; n[idx].name = e.target.value; setForm(f => ({ ...f, additional_fees: n })); }}
                  className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs" />
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{fee.type === 'fixed' ? '$' : '%'}</span>
                  <input type="number" value={fee.amount}
                    onChange={e => { const n = [...form.additional_fees]; n[idx].amount = e.target.value; setForm(f => ({ ...f, additional_fees: n })); }}
                    className="w-full rounded-lg border border-gray-300 pl-5 pr-2 py-1.5 text-xs" />
                </div>
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
                  {['fixed', 'percentage'].map(t => (
                    <button key={t} onClick={() => { const n = [...form.additional_fees]; n[idx].type = t; setForm(f => ({ ...f, additional_fees: n })); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${fee.type === t ? 'bg-[#008080] text-white' : 'text-gray-500'}`}>
                      {t === 'fixed' ? '$' : '%'}
                    </button>
                  ))}
                </div>
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
                  {['night', 'stay'].map(freq => (
                    <button key={freq} onClick={() => { const n = [...form.additional_fees]; n[idx].frequency = freq; setForm(f => ({ ...f, additional_fees: n })); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${fee.frequency === freq ? 'bg-[#008080] text-white' : 'text-gray-500'}`}>
                      /{freq}
                    </button>
                  ))}
                </div>
                <button onClick={() => setForm(f => ({ ...f, additional_fees: f.additional_fees.filter((_, i) => i !== idx) }))}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))
          }
        </div>

        <div className="h-px bg-gray-100" />

        {/* Taxes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Taxes</Label>
            <div className="flex items-center gap-2">
              {globalTaxes.length > 0 && (
                <select onChange={e => {
                  if (!e.target.value) return;
                  const selected = globalTaxes.find(t => t.id === e.target.value);
                  if (selected) setForm(f => ({ ...f, taxes: [...f.taxes, { name: selected.name, amount: String(selected.fee_type === 'fixed' ? (selected.amount || 0) : (selected.percentage || 0)), type: selected.fee_type }] }));
                  e.target.value = '';
                }} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-gray-50 outline-none">
                  <option value="">Import global tax…</option>
                  {globalTaxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <button onClick={() => setForm(f => ({ ...f, taxes: [...f.taxes, { name: '', amount: '', type: 'percentage' }] }))}
                className="text-[#008080] text-xs font-semibold flex items-center gap-1 hover:text-[#006666]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Tax
              </button>
            </div>
          </div>
          {form.taxes.length === 0
            ? <p className="text-xs text-gray-400 italic">None added.</p>
            : form.taxes.map((tax, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex-wrap">
                <input type="text" placeholder="Tax name" value={tax.name}
                  onChange={e => { const n = [...form.taxes]; n[idx].name = e.target.value; setForm(f => ({ ...f, taxes: n })); }}
                  className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs" />
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{tax.type === 'fixed' ? '$' : '%'}</span>
                  <input type="number" value={tax.amount}
                    onChange={e => { const n = [...form.taxes]; n[idx].amount = e.target.value; setForm(f => ({ ...f, taxes: n })); }}
                    className="w-full rounded-lg border border-gray-300 pl-5 pr-2 py-1.5 text-xs" />
                </div>
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
                  {['fixed', 'percentage'].map(t => (
                    <button key={t} onClick={() => { const n = [...form.taxes]; n[idx].type = t; setForm(f => ({ ...f, taxes: n })); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${tax.type === t ? 'bg-[#008080] text-white' : 'text-gray-500'}`}>
                      {t === 'fixed' ? '$' : '%'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setForm(f => ({ ...f, taxes: f.taxes.filter((_, i) => i !== idx) }))}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))
          }
        </div>
      </section>

      {/* ── AVAILABILITY ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Availability</h2>

        {/* Row 1: trip length + prep + window */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label>Min Nights</Label>
            <input type="number" min="1" value={form.min_nights} onChange={e => setForm(f => ({ ...f, min_nights: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <Label>Max Nights</Label>
            <input type="number" min="1" value={form.max_nights} onChange={e => setForm(f => ({ ...f, max_nights: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <Label>Prep Time</Label>
            <select value={form.preparation_time_days} onChange={e => setForm(f => ({ ...f, preparation_time_days: parseInt(e.target.value) }))} className={selectCls}>
              <option value="0">None</option>
              <option value="1">1 night</option>
              <option value="2">2 nights</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Booking Window</Label>
            <select
              value={form.is_unavailable_by_default ? '0' : form.availability_window_months.toString()}
              onChange={e => {
                const val = parseInt(e.target.value);
                setForm(f => val === 0
                  ? { ...f, is_unavailable_by_default: true, availability_window_months: 0 }
                  : { ...f, is_unavailable_by_default: false, availability_window_months: val });
              }}
              className={selectCls}>
              <option value="24">24 months out</option>
              <option value="12">12 months out</option>
              <option value="9">9 months out</option>
              <option value="6">6 months out</option>
              <option value="3">3 months out</option>
              <option value="0">Unavailable by default</option>
            </select>
          </div>
        </div>

        {/* Row 2: toggles inline */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Toggle value={form.allow_request_beyond_window} onChange={() => setForm(f => ({ ...f, allow_request_beyond_window: !f.allow_request_beyond_window }))} />
            <span className="text-xs text-gray-600 font-medium">Allow requests beyond window</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Toggle value={form.allow_last_minute_requests} onChange={() => setForm(f => ({ ...f, allow_last_minute_requests: !f.allow_last_minute_requests }))} />
            <div>
              <span className="text-xs text-gray-600 font-medium">Allow same-day requests</span>
              <span className="text-[10px] text-gray-400 ml-1">(manual approval)</span>
            </div>
          </label>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Advance notice */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Advance Notice Required</Label>
            <select value={form.advance_notice_days} onChange={e => setForm(f => ({ ...f, advance_notice_days: parseInt(e.target.value) }))} className={selectCls}>
              <option value="0">Same day</option>
              <option value="1">1 day</option>
              <option value="2">2 days</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
            </select>
          </div>
          {form.advance_notice_days === 0 && (
            <div>
              <Label>Same-day cut-off</Label>
              <select value={form.same_day_advance_notice_time} onChange={e => setForm(f => ({ ...f, same_day_advance_notice_time: e.target.value }))} className={selectCls}>
                {[['06:00','6 AM'],['08:00','8 AM'],['10:00','10 AM'],['12:00','Noon'],
                  ['14:00','2 PM'],['16:00','4 PM'],['18:00','6 PM'],['20:00','8 PM'],
                  ['21:00','9 PM'],['22:00','10 PM'],['23:00','11 PM'],['00:00','Midnight'],
                ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-800">
              <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Block specific dates in <strong className="ml-0.5">Calendar</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALENDAR SYNC ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Calendar Sync</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">iCal feeds from Airbnb, VRBO, Lodgify etc. block dates on your direct booking calendar.</p>
          </div>
          <button onClick={() => setShowAddFeed(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#008080]/5 hover:bg-[#008080]/10 text-[#008080] text-xs font-semibold rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Feed
          </button>
        </div>

        {/* Add feed form */}
        {showAddFeed && (
          <div className="flex gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 flex-wrap">
            <select value={newFeed.source_name} onChange={e => setNewFeed(n => ({ ...n, source_name: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#008080]/20 w-36">
              <option value="">Platform…</option>
              {['Airbnb','VRBO','Lodgify','Booking.com','Hipcamp','Furnished Finder','Other'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="url" placeholder="https://www.airbnb.com/calendar/ical/…" value={newFeed.ical_url}
              onChange={e => setNewFeed(n => ({ ...n, ical_url: e.target.value }))}
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#008080]/20" />
            <button onClick={addFeed} disabled={addingFeed || !newFeed.source_name || !newFeed.ical_url}
              className="px-4 py-2 bg-[#008080] text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-[#006666] transition-colors">
              {addingFeed ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setShowAddFeed(false)} className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
          </div>
        )}

        {/* Feed list */}
        {feeds.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-xs">No calendar feeds connected yet.</p>
            <p className="text-[10px] mt-0.5">Add an iCal URL from Airbnb, VRBO, or Lodgify to sync blocked dates.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {feeds.map(feed => (
              <div key={feed.id} className={`flex items-center gap-3 p-3 rounded-lg border ${feed.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                {/* Platform badge */}
                <div className="w-20 shrink-0">
                  <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full truncate max-w-full">
                    {feed.source_name || 'Unknown'}
                  </span>
                </div>

                {/* URL */}
                <p className="flex-1 text-[10px] text-gray-400 font-mono truncate min-w-0">{feed.ical_url}</p>

                {/* Last synced */}
                <p className="text-[10px] text-gray-400 shrink-0 hidden md:block">
                  {feed.last_synced_at ? `Synced ${fmtDate(feed.last_synced_at)}` : 'Not synced'}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Toggle value={feed.is_active} onChange={() => toggleFeed(feed)} />
                  <button onClick={() => syncFeed(feed.id)} disabled={syncingFeed === feed.id || !feed.is_active}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-[#008080] bg-[#008080]/5 hover:bg-[#008080]/10 rounded-lg disabled:opacity-40 transition-colors">
                    {syncingFeed === feed.id
                      ? <><div className="w-3 h-3 border-2 border-[#008080] border-t-transparent rounded-full animate-spin" />Syncing</>
                      : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Sync</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button onClick={handleSave} disabled={saving || !isDirty}
          className={`px-8 py-3.5 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-sm ${isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-300 text-white'}`}>
          {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />Saving…</> : 'Save Changes'}
        </button>
      </div>
    </main>
  );
}
