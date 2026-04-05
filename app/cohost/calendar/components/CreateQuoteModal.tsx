'use client';

import { useState, useEffect } from 'react';
import { formatPrice } from '@/lib/services/pricing-service';

interface CreateQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  propertyName: string;
  startDate: Date;
  endDate: Date;
  properties: Array<{ id: string; name: string; max_guests?: number }>;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3;

export default function CreateQuoteModal({
  isOpen,
  onClose,
  propertyId,
  propertyName,
  startDate,
  endDate,
  properties,
  onSuccess,
}: CreateQuoteModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdHold, setCreatedHold] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Step 1: Reservation data
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId);
  const [checkIn, setCheckIn] = useState(startDate);
  const [checkOut, setCheckOut] = useState(endDate);
  const [guestCount, setGuestCount] = useState(2);
  const [source, setSource] = useState('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCountry, setGuestCountry] = useState('');
  const [guestLanguage, setGuestLanguage] = useState('English');

  // Step 2: Price data (fetched)
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // Step 3: Policy
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedPropertyId(propertyId);
      setCheckIn(startDate);
      setCheckOut(endDate);
      setGuestCount(2);
      setError(null);
      setCreatedHold(null);
      setCopied(false);
    }
  }, [isOpen, propertyId, startDate, endDate]);

  // Fetch price when moving to step 2
  useEffect(() => {
    if (step === 2) {
      fetchPrice();
    }
  }, [step]);

  // Fetch policies when moving to step 3
  useEffect(() => {
    if (step === 3) {
      fetchPolicies();
    }
  }, [step]);

  const fetchPrice = async () => {
    setPriceLoading(true);
    try {
      const res = await fetch('/api/cohost/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          checkIn: checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
          guestCount,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPriceBreakdown(data);
      } else {
        setError(data.error || 'Failed to calculate price');
      }
    } catch (e) {
      setError('Failed to calculate price');
    }
    setPriceLoading(false);
  };

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/cohost/policies');
      const data = await res.json();
      if (res.ok) {
        setPolicies(data);
        // Select default policy
        const defaultPolicy = data.find((p: any) => p.is_default);
        if (defaultPolicy) setSelectedPolicyId(defaultPolicy.id);
      }
    } catch (e) {
      console.error('Failed to fetch policies');
    }
  };

  const handleNext = () => {
    if (step === 1) {
      // Validate step 1
      if (!guestFirstName.trim()) {
        setError('Guest first name is required');
        return;
      }
      setError(null);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cohost/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          checkIn: checkIn.toISOString().split('T')[0],
          checkOut: checkOut.toISOString().split('T')[0],
          guestCount,
          guestFirstName,
          guestLastName,
          guestEmail,
          guestPhone,
          guestCountry,
          guestLanguage,
          source,
          policyId: selectedPolicyId,
          sendQuote: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create quote');
        setIsLoading(false);
        return;
      }

      // Success
      setCreatedHold(data);
      onSuccess();
    } catch (e) {
      setError('Failed to create quote');
    }

    setIsLoading(false);
  };

  if (!isOpen) return null;

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const maxGuests = selectedProperty?.max_guests || 10;

  const paymentUrl = createdHold 
    ? `${window.location.origin}/checkout/${createdHold.payment_link_token}`
    : '';

  const handleCopyLink = () => {
    if (paymentUrl) {
      navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            CREATE RESERVATION WITH QUOTE
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            ×
          </button>
        </div>

        {/* Step Tabs */}
        <div className="flex border-b">
          <button
            className={`flex-1 py-3 text-sm font-medium ${
              step === 1 ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'
            }`}
            onClick={() => step > 1 && setStep(1)}
          >
            1. Reservation
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium ${
              step === 2 ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'
            }`}
            onClick={() => step > 2 && setStep(2)}
          >
            2. Price
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium ${
              step === 3 ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'
            }`}
          >
            3. Policy
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Reservation */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Property Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">RESERVATION</label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase mb-1">Check-in</label>
                  <input
                    type="date"
                    value={checkIn.toISOString().split('T')[0]}
                    onChange={(e) => setCheckIn(new Date(e.target.value))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <span className="text-gray-400 mt-5">→</span>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase mb-1">Check-out</label>
                  <input
                    type="date"
                    value={checkOut.toISOString().split('T')[0]}
                    onChange={(e) => setCheckOut(new Date(e.target.value))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Guests */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Guests</label>
                <select
                  value={guestCount}
                  onChange={(e) => setGuestCount(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3"
                >
                  {Array.from({ length: maxGuests }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Source */}
              <div>
                <input
                  type="text"
                  placeholder="Source (e.g. phone, Airbnb, etc.)"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3"
                />
              </div>

              {/* Guest Info */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">GUEST</label>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="First name *"
                    value={guestFirstName}
                    onChange={(e) => setGuestFirstName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={guestLastName}
                    onChange={(e) => setGuestLastName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  />
                  <select
                    value={guestCountry}
                    onChange={(e) => setGuestCountry(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  >
                    <option value="">Country</option>
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                    <option value="UK">United Kingdom</option>
                    <option value="AU">Australia</option>
                    {/* Add more countries as needed */}
                  </select>
                  <select
                    value={guestLanguage}
                    onChange={(e) => setGuestLanguage(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Price */}
          {step === 2 && (
            <div className="space-y-6">
              {priceLoading ? (
                <div className="text-center py-8 text-gray-500">Calculating price...</div>
              ) : priceBreakdown ? (
                <>
                  {/* Room Rate */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-700">Room rate</span>
                      <span className="font-semibold">{formatPrice(priceBreakdown.roomTotal)}</span>
                    </div>
                    <div className="text-sm text-gray-500 ml-4">
                      {selectedProperty?.name}: {formatPrice(priceBreakdown.nightlyRate)}/night × {priceBreakdown.nights} nights
                    </div>
                    {priceBreakdown.extraGuestsCount > 0 && (
                      <div className="text-sm text-gray-500 ml-4 mt-1">
                        Extra guests ({priceBreakdown.extraGuestsCount}): {formatPrice(priceBreakdown.extraGuestTotal)}
                      </div>
                    )}
                  </div>

                  {/* Fees */}
                  {priceBreakdown.fees.filter((f: any) => !f.isTax).length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-gray-700">Fees</span>
                        <span className="font-semibold">{formatPrice(priceBreakdown.feesTotal)}</span>
                      </div>
                      {priceBreakdown.fees
                        .filter((f: any) => !f.isTax)
                        .map((fee: any) => (
                          <div key={fee.id} className="text-sm text-gray-500 ml-4">
                            {fee.name}: {formatPrice(fee.amount)}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Taxes */}
                  {priceBreakdown.fees.filter((f: any) => f.isTax).length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-gray-700">Taxes</span>
                        <span className="font-semibold">{formatPrice(priceBreakdown.taxesTotal)}</span>
                      </div>
                      {priceBreakdown.fees
                        .filter((f: any) => f.isTax)
                        .map((fee: any) => (
                          <div key={fee.id} className="text-sm text-gray-500 ml-4">
                            {fee.name}: {formatPrice(fee.amount)}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Grand Total */}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">Total</span>
                      <span className="text-lg font-bold">{formatPrice(priceBreakdown.grandTotal)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Unable to calculate price. Please ensure property pricing is configured.
                </div>
              )}
            </div>
          )}

          {/* Step 3: Policy */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">POLICY</label>
                {policies.length > 0 ? (
                  <select
                    value={selectedPolicyId || ''}
                    onChange={(e) => setSelectedPolicyId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  >
                    <option value="">Select a policy</option>
                    {policies.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">
                    No policies configured. You can still create the quote.
                  </p>
                )}
              </div>

              {/* Show selected policy details */}
              {selectedPolicyId && policies.find(p => p.id === selectedPolicyId) && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                  {(() => {
                    const policy = policies.find(p => p.id === selectedPolicyId);
                    return (
                      <>
                        {policy.payment_policy && (
                          <div>
                            <span className="font-semibold">Payment policy:</span>{' '}
                            {policy.payment_policy}
                          </div>
                        )}
                        {policy.cancellation_policy && (
                          <div>
                            <span className="font-semibold">Cancellation policy:</span>{' '}
                            {policy.cancellation_policy}
                          </div>
                        )}
                        {policy.quote_expiry_hours && (
                          <div>
                            <span className="font-semibold">Quote expires in:</span>{' '}
                            {policy.quote_expiry_hours} hours
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Summary */}
              <div className="border-t pt-6">
                <label className="block text-xs font-semibold text-gray-500 mb-3">SUMMARY</label>
                <div className="bg-teal-50 rounded-lg p-4 text-sm text-teal-800 space-y-2">
                  <div className="flex justify-between">
                    <span>Property:</span>
                    <span className="font-semibold">{propertyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dates:</span>
                    <span className="font-semibold">{formatDate(checkIn)} → {formatDate(checkOut)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Guest:</span>
                    <span className="font-semibold">{guestFirstName} {guestLastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-semibold">{priceBreakdown ? formatPrice(priceBreakdown.grandTotal) : '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success State: Show Payment Link */}
          {createdHold && (
            <div className="absolute inset-x-0 bottom-0 top-[110px] bg-white z-50 p-8 flex flex-col items-center text-center">
              <div className="text-6xl mb-6 text-teal-500 animate-pulse">✨</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Quote Created!</h2>
              <p className="text-gray-600 mb-8 max-w-sm">
                The booking hold is active for 48 hours. Share this payment link with your guest to confirm the booking:
              </p>
              
              <div className="w-full space-y-4">
                <div className="relative group">
                  <input
                    type="text"
                    readOnly
                    value={paymentUrl}
                    className="w-full bg-gray-50 border-2 border-teal-100 rounded-xl px-4 py-4 pr-28 text-sm font-medium text-teal-900 truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="absolute right-2 top-2 bottom-2 px-4 bg-teal-500 text-white rounded-lg font-bold text-xs hover:bg-teal-600 transition-all active:scale-95 flex items-center justify-center min-w-[100px]"
                  >
                    {copied ? (
                      <span className="flex items-center gap-1">✓ Copied</span>
                    ) : (
                      <span className="flex items-center gap-1">📋 Copy Link</span>
                    )}
                  </button>
                </div>

                <div className="flex gap-3 pt-4">
                   <button
                    onClick={onClose}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Done
                  </button>
                  <a
                    href={paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-4 py-3 bg-teal-50 text-teal-700 rounded-lg font-medium hover:bg-teal-100 transition-colors text-center border border-teal-200 flex items-center justify-center"
                  >
                    View Checkout
                  </a>
                </div>
              </div>

              <div className="mt-auto pt-8 text-xs text-gray-400 font-medium">
                A confirmation email has also been sent to {createdHold.guest_email || 'the host'}.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-3 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save & Send Quote'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
