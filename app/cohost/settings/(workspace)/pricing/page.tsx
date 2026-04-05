'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  CheckIcon, 
  XMarkIcon,
  CurrencyDollarIcon,
  PercentBadgeIcon
} from '@heroicons/react/24/outline';

type Property = {
  id: string;
  name: string;
  base_nightly_rate: number | null;
  currency: string;
  min_nights: number;
  max_guests: number;
  base_guests_included: number | null;
  extra_guest_fee: number | null;
};

type Fee = {
  id: string;
  name: string;
  amount: number | null;
  percentage: number | null;
  fee_type: 'fixed' | 'percentage';
  is_tax: boolean;
  is_required: boolean;
  applies_to_property_ids: string[] | null;
  display_order: number;
};

export default function PricingSettingsPage() {
  const supabase = createClient();
  const [properties, setProperties] = useState<Property[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Property>>({});
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editingFee, setEditingFee] = useState<Fee | null>(null);
  const [feeFormData, setFeeFormData] = useState<Partial<Fee>>({
    name: '',
    fee_type: 'fixed',
    amount: 0,
    percentage: 0,
    is_tax: false,
    is_required: true,
    applies_to_property_ids: null
  });

  const [activeTab, setActiveTab] = useState<'rates' | 'fees'>('rates');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [propsRes, feesRes] = await Promise.all([
      supabase.from('cohost_properties').select('id, name, base_nightly_rate, currency, min_nights, max_guests, base_guests_included, extra_guest_fee').order('name'),
      fetch('/api/cohost/fees').then(res => res.json())
    ]);

    if (propsRes.data) setProperties(propsRes.data);
    if (Array.isArray(feesRes)) setFees(feesRes);
    setLoading(false);
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property.id);
    setEditFormData({ ...property });
  };

  const handleSaveProperty = async (id: string) => {
    try {
      const res = await fetch(`/api/cohost/properties/${id}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });

      if (res.ok) {
        setProperties(properties.map(p => p.id === id ? { ...p, ...editFormData } as Property : p));
        setEditingProperty(null);
      } else {
        const errorData = await res.json();
        alert(`Failed to save: ${errorData.error || res.statusText}`);
      }
    } catch (err) {
      console.error('Error saving property:', err);
      alert('An unexpected error occurred while saving.');
    }
  };

  const handleSaveFee = async () => {
    const method = editingFee ? 'PUT' : 'POST';
    const url = editingFee ? `/api/cohost/fees/${editingFee.id}` : '/api/cohost/fees';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feeFormData)
    });

    if (res.ok) {
      fetchData();
      setShowFeeModal(false);
      setEditingFee(null);
    }
  };

  const handleDeleteFee = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fee?')) return;
    const res = await fetch(`/api/cohost/fees/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setFees(fees.filter(f => f.id !== id));
    }
  };

  if (loading) {
    return <div className="p-8 animate-pulse text-gray-500">Loading pricing data...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Pricing & Fees</h1>
        <p className="text-gray-600 mt-2">Set nightly rates for your properties and manage workspace-wide fees or taxes.</p>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8 mt-2">
        <nav className="-mb-px flex space-x-10">
          <button
            onClick={() => setActiveTab('rates')}
            className={`${activeTab === 'rates' ? 'border-coral text-coral font-bold' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 font-semibold'} whitespace-nowrap pb-4 px-2 border-b-[3px] text-base transition-colors`}
          >
            Nightly Rates
          </button>
          <button
            onClick={() => setActiveTab('fees')}
            className={`${activeTab === 'fees' ? 'border-coral text-coral font-bold' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 font-semibold'} whitespace-nowrap pb-4 px-2 border-b-[3px] text-base transition-colors`}
          >
            Fees & Taxes
          </button>
        </nav>
      </div>

      {/* Section 1: Property Rates */}
      {activeTab === 'rates' && (
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <div className="relative w-full max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <input 
              type="text" 
              placeholder="Search properties..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-coral focus:border-coral sm:text-sm"
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nightly Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Guests</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extra Guest Fee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Nights</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Guests</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {properties.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map((property) => (
                <tr key={property.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{property.name}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingProperty === property.id ? (
                      <div className="flex items-center">
                        <span className="mr-1 text-gray-400">$</span>
                        <input
                          type="number"
                          className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-2 py-2"
                          value={editFormData.base_nightly_rate ?? ''}
                          onChange={(e) => setEditFormData({ ...editFormData, base_nightly_rate: e.target.value === '' ? null : parseInt(e.target.value) })}
                        />
                      </div>
                    ) : (
                      <span>${property.base_nightly_rate || 0}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingProperty === property.id ? (
                      <input
                        type="number"
                        className="w-14 border-gray-300 rounded-md shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-2 py-2"
                        value={editFormData.base_guests_included ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, base_guests_included: e.target.value === '' ? null : parseInt(e.target.value) })}
                      />
                    ) : (
                      property.base_guests_included || '-'
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingProperty === property.id ? (
                      <div className="flex items-center">
                        <span className="mr-1 text-gray-400">$</span>
                        <input
                          type="number"
                          className="w-16 border-gray-300 rounded-md shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-2 py-2"
                          value={editFormData.extra_guest_fee ?? ''}
                          onChange={(e) => setEditFormData({ ...editFormData, extra_guest_fee: e.target.value === '' ? null : parseInt(e.target.value) })}
                        />
                      </div>
                    ) : (
                      property.extra_guest_fee ? `$${property.extra_guest_fee}` : '-'
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingProperty === property.id ? (
                      <input
                        type="number"
                        className="w-14 border-gray-300 rounded-md shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-2 py-2"
                        value={editFormData.min_nights ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, min_nights: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                      />
                    ) : (
                      property.min_nights
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {editingProperty === property.id ? (
                      <input
                        type="number"
                        className="w-14 border-gray-300 rounded-md shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-2 py-2"
                        value={editFormData.max_guests ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, max_guests: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                      />
                    ) : (
                      property.max_guests
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingProperty === property.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSaveProperty(property.id)} className="text-green-600 hover:text-green-900">
                          <CheckIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => setEditingProperty(null)} className="text-gray-400 hover:text-gray-600">
                          <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleEditProperty(property)} className="text-coral hover:text-red-700">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {properties.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
            <div className="p-8 text-center text-gray-500">No properties found matching "{searchQuery}"</div>
          )}
        </div>
      </section>
      )}

      {/* Section 2: Fees & Taxes */}
      {activeTab === 'fees' && (
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Workspace Fees & Taxes</h2>
          <button 
            onClick={() => {
              setEditingFee(null);
              setFeeFormData({
                name: '',
                fee_type: 'fixed',
                amount: 0,
                percentage: 0,
                is_tax: false,
                is_required: true,
                applies_to_property_ids: null
              });
              setShowFeeModal(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-coral hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Add Fee
          </button>
        </div>

        {fees.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500">No fees or taxes defined yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fees.map((fee) => (
              <div key={fee.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-coral transition-colors group">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      {fee.name}
                      {fee.is_tax && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-tight">Tax</span>}
                    </h3>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {fee.fee_type === 'fixed' ? `$${fee.amount}` : `${fee.percentage}%`}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {fee.is_required ? 'Always Required' : 'Optional'}
                      </span>
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {fee.applies_to_property_ids ? `${fee.applies_to_property_ids.length} Properties` : 'All Properties'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingFee(fee);
                        setFeeFormData({ ...fee });
                        setShowFeeModal(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-coral transition-colors"
                      title="Edit Fee"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteFee(fee.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Fee Modal (Simplified version) */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">{editingFee ? 'Edit Fee' : 'Add New Fee'}</h3>
              <button onClick={() => setShowFeeModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee Name</label>
                <input 
                  type="text" 
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-3 py-2"
                  placeholder="e.g. Cleaning Fee, Sales Tax"
                  value={feeFormData.name}
                  onChange={(e) => setFeeFormData({ ...feeFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setFeeFormData({ ...feeFormData, fee_type: 'fixed' })}
                    className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-xl text-sm font-medium transition-all ${feeFormData.fee_type === 'fixed' ? 'bg-coral/5 border-coral text-coral ring-1 ring-coral/20' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    <CurrencyDollarIcon className="w-5 h-5 flex-shrink-0" />
                    Fixed Amount
                  </button>
                  <button 
                    onClick={() => setFeeFormData({ ...feeFormData, fee_type: 'percentage' })}
                    className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-xl text-sm font-medium transition-all ${feeFormData.fee_type === 'percentage' ? 'bg-coral/5 border-coral text-coral ring-1 ring-coral/20' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    <PercentBadgeIcon className="w-5 h-5 flex-shrink-0" />
                    Percentage
                  </button>
                </div>
              </div>

              {feeFormData.fee_type === 'fixed' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                  <input 
                    type="number" 
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-3 py-2"
                    value={feeFormData.amount ?? ''}
                    onChange={(e) => setFeeFormData({ ...feeFormData, amount: e.target.value === '' ? null : parseInt(e.target.value) })}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Percentage (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-coral focus:border-coral sm:text-sm px-3 py-2"
                    value={feeFormData.percentage ?? ''}
                    onChange={(e) => setFeeFormData({ ...feeFormData, percentage: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  />
                </div>
              )}

              <div className="flex items-center gap-6 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral"
                    checked={feeFormData.is_tax}
                    onChange={(e) => setFeeFormData({ ...feeFormData, is_tax: e.target.checked })}
                  />
                  <span className="text-sm text-gray-700">Is this a tax?</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral"
                    checked={feeFormData.is_required}
                    onChange={(e) => setFeeFormData({ ...feeFormData, is_required: e.target.checked })}
                  />
                  <span className="text-sm text-gray-700">Required?</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Applies to:</label>
                <div className="space-y-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral"
                      checked={feeFormData.applies_to_property_ids === null}
                      onChange={(e) => {
                        if (e.target.checked) setFeeFormData({ ...feeFormData, applies_to_property_ids: null });
                      }}
                    />
                    <span className="text-sm font-medium text-gray-900">All Properties</span>
                  </label>
                  <div className="h-px bg-gray-100 my-2"></div>
                  {properties.map(p => {
                    const isChecked = feeFormData.applies_to_property_ids?.includes(p.id) || false;
                    return (
                      <label key={p.id} className="flex items-center gap-3 cursor-pointer py-1">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral"
                          checked={isChecked}
                          onChange={(e) => {
                            let newIds = feeFormData.applies_to_property_ids ? [...feeFormData.applies_to_property_ids] : [];
                            if (e.target.checked) {
                              newIds.push(p.id);
                            } else {
                              newIds = newIds.filter(id => id !== p.id);
                            }
                            
                            // If they check all manually, or uncheck everything, default back to "All Properties"
                            if (newIds.length === 0 || newIds.length === properties.length) {
                               setFeeFormData({ ...feeFormData, applies_to_property_ids: null });
                            } else {
                               setFeeFormData({ ...feeFormData, applies_to_property_ids: newIds });
                            }
                          }}
                        />
                        <span className="text-sm text-gray-700">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setShowFeeModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button 
                onClick={handleSaveFee}
                className="px-4 py-2 text-sm font-medium text-white bg-coral hover:bg-red-600 rounded-lg shadow-sm"
              >
                {editingFee ? 'Update Fee' : 'Create Fee'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .bg-coral { background-color: #FA5A5A; }
        .text-coral { color: #FA5A5A; }
        .border-coral { border-color: #FA5A5A; }
        .focus\\:ring-coral:focus { --tw-ring-color: #FA5A5A; }
        .focus\\:border-coral:focus { border-color: #FA5A5A; }
      `}</style>
    </div>
  );
}
