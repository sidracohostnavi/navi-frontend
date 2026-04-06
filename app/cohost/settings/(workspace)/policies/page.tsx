'use client';

import { useState, useEffect } from 'react';

interface Policy {
  id: string;
  name: string;
  payment_policy: string | null;
  cancellation_policy: string | null;
  quote_expiry_hours: number;
  is_default: boolean;
  rental_agreement_text?: string | null;
}

export default function PoliciesSettingsPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPaymentPolicy, setFormPaymentPolicy] = useState('');
  const [formCancellationPolicy, setFormCancellationPolicy] = useState('');
  const [formExpiryHours, setFormExpiryHours] = useState(48);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formRentalAgreement, setFormRentalAgreement] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cohost/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data);
      }
    } catch (e) {
      console.error('Failed to fetch policies');
    }
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingPolicy(null);
    setFormName('');
    setFormPaymentPolicy('');
    setFormCancellationPolicy('');
    setFormExpiryHours(48);
    setFormIsDefault(false);
    setFormRentalAgreement('');
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (policy: Policy) => {
    setEditingPolicy(policy);
    setFormName(policy.name);
    setFormPaymentPolicy(policy.payment_policy || '');
    setFormCancellationPolicy(policy.cancellation_policy || '');
    setFormExpiryHours(policy.quote_expiry_hours);
    setFormIsDefault(policy.is_default);
    setFormRentalAgreement(policy.rental_agreement_text || '');
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('Policy name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        name: formName,
        payment_policy: formPaymentPolicy || null,
        cancellation_policy: formCancellationPolicy || null,
        quote_expiry_hours: formExpiryHours,
        is_default: formIsDefault,
        rental_agreement_text: formRentalAgreement || null,
      };

      let res;
      if (editingPolicy) {
        res = await fetch(`/api/cohost/policies/${editingPolicy.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/cohost/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save policy');
        setIsSaving(false);
        return;
      }

      setShowModal(false);
      fetchPolicies();
    } catch (e) {
      setError('Failed to save policy');
    }
    setIsSaving(false);
  };

  const handleDelete = async (policy: Policy) => {
    if (!confirm(`Delete policy "${policy.name}"?`)) return;

    try {
      const res = await fetch(`/api/cohost/policies/${policy.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchPolicies();
      }
    } catch (e) {
      console.error('Failed to delete policy');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Booking Policies</h1>
          <p className="text-gray-600 mt-1">
            Define payment terms, cancellation rules, and quote expiry for your bookings.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
        >
          Add Policy
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : policies.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">No policies created yet.</p>
          <button
            onClick={openCreateModal}
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            Create your first policy
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="bg-white border rounded-lg p-4 flex items-start justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                  {policy.is_default && (
                    <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                {policy.payment_policy && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Payment:</span> {policy.payment_policy}
                  </p>
                )}
                {policy.cancellation_policy && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Cancellation:</span> {policy.cancellation_policy}
                  </p>
                )}
                {policy.rental_agreement_text && (
                  <p className="text-sm text-teal-600 mt-1 font-medium flex items-center gap-1">
                    📄 Rental agreement attached ({policy.rental_agreement_text.length} characters)
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Quote expires in {policy.quote_expiry_hours} hours
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(policy)}
                  className="text-gray-600 hover:text-gray-800 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(policy)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold">
                {editingPolicy ? 'Edit Policy' : 'Create Policy'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Policy Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Standard, Flexible, Strict"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={50}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {formName.length} / 50 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Policy
                </label>
                <textarea
                  placeholder="e.g., 100% of the total amount is due at time of booking."
                  value={formPaymentPolicy}
                  onChange={(e) => setFormPaymentPolicy(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {formPaymentPolicy.length} / 500 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cancellation Policy
                </label>
                <textarea
                  placeholder="e.g., Full refund if cancelled 14+ days before check-in. 50% refund if cancelled 7-14 days before."
                  value={formCancellationPolicy}
                  onChange={(e) => setFormCancellationPolicy(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {formCancellationPolicy.length} / 500 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rental Agreement / Contract
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  This will be shown to guests before payment. They must agree to proceed.
                </p>
                <textarea
                  placeholder="Enter your full rental agreement, house rules, terms and conditions..."
                  value={formRentalAgreement}
                  onChange={(e) => setFormRentalAgreement(e.target.value)}
                  rows={8}
                  maxLength={8000}
                  className="w-full border rounded-lg px-4 py-3 font-mono text-sm"
                  style={{ minHeight: '160px' }}
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {formRentalAgreement.length} / 8000 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quote Expiry (hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={formExpiryHours}
                  onChange={(e) => setFormExpiryHours(parseInt(e.target.value) || 48)}
                  className="w-32 border rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Set as default policy</span>
                </label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 border rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Policy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
