'use client';

import { useState, useEffect } from 'react';

interface CreateInstantBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  propertyName: string;
  startDate: Date;
  endDate: Date;
  properties: Array<{ id: string; name: string; max_guests?: number }>;
  onSuccess: () => void;
}

export default function CreateInstantBookingModal({
  isOpen,
  onClose,
  propertyId,
  propertyName,
  startDate,
  endDate,
  properties,
  onSuccess,
}: CreateInstantBookingModalProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId);
  const [checkIn, setCheckIn] = useState(startDate);
  const [checkOut, setCheckOut] = useState(endDate);
  const [guestCount, setGuestCount] = useState(2);
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedPropertyId(propertyId);
      setCheckIn(startDate);
      setCheckOut(endDate);
      setGuestCount(2);
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setGuestPhone('');
      setSource('');
      setNotes('');
      setError(null);
    }
  }, [isOpen, propertyId, startDate, endDate]);

  const handleCreate = async () => {
    if (!guestFirstName.trim()) {
      setError('Guest first name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cohost/bookings/create', {
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
          source,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create booking');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e) {
      setError('Failed to create booking');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const maxGuests = selectedProperty?.max_guests || 10;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 uppercase">
            Create Reservation Without Quote
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ⚠️ This creates a confirmed booking immediately. No payment link will be sent.
          </p>

          {/* Property */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Property</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Check-in</label>
              <input
                type="date"
                value={checkIn.toISOString().split('T')[0]}
                onChange={(e) => setCheckIn(new Date(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Check-out</label>
              <input
                type="date"
                value={checkOut.toISOString().split('T')[0]}
                onChange={(e) => setCheckOut(new Date(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Guests & Source */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Guests</label>
              <select
                value={guestCount}
                onChange={(e) => setGuestCount(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              >
                {Array.from({ length: maxGuests }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Source</label>
              <input
                type="text"
                placeholder="e.g. Phone, returning guest"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          {/* Guest Info */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Guest Info</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First name *"
                value={guestFirstName}
                onChange={(e) => setGuestFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <input
                type="text"
                placeholder="Last name"
                value={guestLastName}
                onChange={(e) => setGuestLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <input
              type="email"
              placeholder="Email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Internal Notes</label>
            <textarea
              placeholder="About this booking..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
