'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PropertyPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [globalTaxes, setGlobalTaxes] = useState<any[]>([]);
  
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
  });

  const [initialData, setInitialData] = useState<any>(null);
  const isDirty = initialData && JSON.stringify(form) !== JSON.stringify(initialData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/cohost/properties/${propertyId}/listing`);
        if (res.ok) {
          const data = await res.json();
          const initialForm = {
            nightly_rate: data.nightly_rate ? (data.nightly_rate / 100).toString() : '',
            cleaning_fee: data.cleaning_fee ? (data.cleaning_fee / 100).toString() : '',
            min_nights: data.min_nights?.toString() || '1',
            max_nights: data.max_nights?.toString() || '30',
            base_guests_included: data.base_guests_included?.toString() || '2',
            max_guests: data.max_guests?.toString() || '4',
            extra_guest_fee: data.extra_guest_fee?.toString() || '0',
            extra_guest_fee_frequency: (data.extra_guest_fee_frequency === 'stay' ? 'stay' : 'night') as 'night' | 'stay',
            additional_fees: data.additional_fees || [],
            taxes: data.taxes || [],
          };
          setForm(initialForm);
          setInitialData(initialForm);
        }
        
        const feeRes = await fetch('/api/cohost/fees');
        if (feeRes.ok) {
          const feeData = await feeRes.json();
          setGlobalTaxes(feeData.filter((f: any) => f.is_tax));
        }
      } catch (err) {
        console.error('Failed to fetch pricing data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [propertyId]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    
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
      };
      
      const res = await fetch(`/api/cohost/properties/${propertyId}/listing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }
      
      setSuccess('Pricing updated successfully!');
      setInitialData(form);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading pricing...</div>;

  return (
    <main className="max-w-4xl mx-auto p-6 pb-32 animate-fadeIn">
      {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 mb-6">{error}</div>}
      {success && <div className="p-4 bg-green-50 text-green-700 rounded-xl border border-green-100 mb-6">{success}</div>}

      <section className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm space-y-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Pricing</h2>
        
        {/* Row 1: Basic Pricing & Nights */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Nightly Rate *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={form.nightly_rate}
                onChange={e => setForm(f => ({ ...f, nightly_rate: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
                placeholder="150.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Cleaning Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={form.cleaning_fee}
                onChange={e => setForm(f => ({ ...f, cleaning_fee: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
                placeholder="75.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Min Nights</label>
            <input
              type="number"
              value={form.min_nights}
              onChange={e => setForm(f => ({ ...f, min_nights: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Max Nights</label>
            <input
              type="number"
              value={form.max_nights}
              onChange={e => setForm(f => ({ ...f, max_nights: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
            />
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Row 2: Guest Settings */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Base Guests Included</label>
            <input
              type="number"
              value={form.base_guests_included}
              onChange={e => setForm(f => ({ ...f, base_guests_included: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Max Guests</label>
            <input
              type="number"
              value={form.max_guests}
              onChange={e => setForm(f => ({ ...f, max_guests: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Extra Guest Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={form.extra_guest_fee}
                onChange={e => setForm(f => ({ ...f, extra_guest_fee: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-3 focus:ring-[#008080]/30 outline-none text-gray-700"
                placeholder="25.00"
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1.5 h-[50px]">
              <span className="text-[10px] text-gray-400 font-bold uppercase ml-2">PER</span>
              <div className="flex flex-1 gap-1">
                <button 
                  onClick={() => setForm(f => ({ ...f, extra_guest_fee_frequency: 'night' }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${form.extra_guest_fee_frequency === 'night' ? 'bg-[#008080] text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                  night
                </button>
                <button 
                  onClick={() => setForm(f => ({ ...f, extra_guest_fee_frequency: 'stay' }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${form.extra_guest_fee_frequency === 'stay' ? 'bg-[#008080] text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                  stay
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Additional Fees Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">ADDITIONAL FEES</h3>
            <button 
              onClick={() => setForm(f => ({ ...f, additional_fees: [...f.additional_fees, { name: '', amount: '', type: 'fixed', frequency: 'stay' }] }))}
              className="text-[#008080] hover:text-[#006666] text-sm font-semibold flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Fee
            </button>
          </div>
          
          {form.additional_fees.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No additional fees added.</p>
          ) : (
            <div className="space-y-4">
              {form.additional_fees.map((fee, idx) => (
                <div key={idx} className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      placeholder="Fee Name"
                      value={fee.name}
                      onChange={e => {
                        const newFees = [...form.additional_fees];
                        newFees[idx].name = e.target.value;
                        setForm(f => ({ ...f, additional_fees: newFees }));
                      }}
                      className="flex-1 rounded-xl border-gray-300 border px-4 py-2.5 text-sm"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{fee.type === 'fixed' ? '$' : '%'}</span>
                      <input 
                        type="number"
                        value={fee.amount}
                        onChange={e => {
                          const newFees = [...form.additional_fees];
                          newFees[idx].amount = e.target.value;
                          setForm(f => ({ ...f, additional_fees: newFees }));
                        }}
                        className="w-full rounded-xl border-gray-300 border pl-7 pr-3 py-2.5 text-sm"
                      />
                    </div>
                    <div className="flex bg-white border border-gray-200 rounded-xl p-1 shrink-0">
                      {['fixed', 'percentage'].map(t => (
                        <button 
                          key={t}
                          onClick={() => {
                            const newFees = [...form.additional_fees];
                            newFees[idx].type = t;
                            setForm(f => ({ ...f, additional_fees: newFees }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${fee.type === t ? 'bg-[#008080] text-white' : 'text-gray-500'}`}
                        >
                          {t === 'fixed' ? '$' : '%'}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shrink-0">
                      <span className="text-[10px] text-gray-400 font-bold uppercase mx-2">per</span>
                      <div className="flex gap-1">
                        {['night', 'stay'].map(freq => (
                          <button 
                            key={freq}
                            onClick={() => {
                              const newFees = [...form.additional_fees];
                              newFees[idx].frequency = freq;
                              setForm(f => ({ ...f, additional_fees: newFees }));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${fee.frequency === freq ? 'bg-[#008080] text-white' : 'text-gray-500'}`}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, additional_fees: f.additional_fees.filter((_, i) => i !== idx) }))} className="text-gray-400 hover:text-red-500 transition-colors p-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  {fee.type === 'percentage' && (
                    <p className="text-[10px] text-[#008080] font-medium pl-1 italic">
                      % of total reservation value (excl. fees & taxes)
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Taxes Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">TAXES</h3>
            <div className="flex items-center gap-3">
              <select 
                onChange={(e) => {
                    if (!e.target.value) return;
                    const selected = globalTaxes.find(t => t.id === e.target.value);
                    if (selected) {
                        setForm(f => ({ 
                            ...f, 
                            taxes: [...f.taxes, { 
                                name: selected.name, 
                                amount: String(selected.fee_type === 'fixed' ? (selected.amount || 0) : (selected.percentage || 0)), 
                                type: selected.fee_type 
                            }] 
                        }));
                    }
                    e.target.value = '';
                }}
                className="text-xs border-gray-300 rounded-xl focus:ring-[#008080]/30 outline-none bg-gray-50 px-4 py-2.5"
              >
                <option value="">Choose...</option>
                {globalTaxes.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.fee_type === 'fixed' ? `$${t.amount}` : `${t.percentage}%`})</option>
                ))}
              </select>
              <button 
                onClick={() => setForm(f => ({ ...f, taxes: [...f.taxes, { name: '', amount: '', type: 'percentage' }] }))}
                className="text-[#008080] hover:text-[#006666] text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add tax
              </button>
            </div>
          </div>
          
          {form.taxes.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No taxes added.</p>
          ) : (
            <div className="space-y-3">
              {form.taxes.map((tax, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <input 
                    type="text" 
                    placeholder="Tax Name"
                    value={tax.name}
                    onChange={e => {
                      const newTaxes = [...form.taxes];
                      newTaxes[idx].name = e.target.value;
                      setForm(f => ({ ...f, taxes: newTaxes }));
                    }}
                    className="flex-1 rounded-xl border-gray-300 border px-4 py-2 text-sm"
                  />
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{tax.type === 'fixed' ? '$' : '%'}</span>
                    <input 
                      type="number"
                      value={tax.amount}
                      onChange={e => {
                        const newTaxes = [...form.taxes];
                        newTaxes[idx].amount = e.target.value;
                        setForm(f => ({ ...f, taxes: newTaxes }));
                      }}
                      className="w-full rounded-xl border-gray-300 border pl-7 pr-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex bg-white border border-gray-200 rounded-xl p-1 shrink-0">
                    {['fixed', 'percentage'].map(t => (
                      <button 
                        key={t}
                        onClick={() => {
                            const newTaxes = [...form.taxes];
                            newTaxes[idx].type = t;
                            setForm(f => ({ ...f, taxes: newTaxes }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tax.type === t ? 'bg-[#008080] text-white' : 'text-gray-500'}`}
                      >
                        {t === 'fixed' ? '$' : '%'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setForm(f => ({ ...f, taxes: f.taxes.filter((_, i) => i !== idx) }))} className="text-gray-400 hover:text-red-500 transition-colors p-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Save FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={`px-10 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed ${
            isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-400 text-white'
          }`}
        >
          {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block vertical-middle" />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </main>
  );
}
