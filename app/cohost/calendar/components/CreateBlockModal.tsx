'use client';

import { useState } from 'react';

interface CreateBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  propertyName: string;
  startDate: Date;
  endDate: Date;
  onSuccess: () => void;
}

export default function CreateBlockModal({
  isOpen,
  onClose,
  propertyId,
  propertyName,
  startDate,
  endDate,
  onSuccess,
}: CreateBlockModalProps) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleCreate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cohost/bookings/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          checkIn: startDate.toISOString().split('T')[0],
          checkOut: endDate.toISOString().split('T')[0],
          reason: reason || 'Blocked',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create block');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e) {
      setError('Failed to create block');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Create Closed Period</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="text-sm text-gray-500">Property</div>
            <div className="font-medium text-gray-900">{propertyName}</div>
          </div>

          <div className="flex gap-4">
            <div>
              <div className="text-sm text-gray-500">From</div>
              <div className="font-medium text-gray-900">{formatDate(startDate)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">To</div>
              <div className="font-medium text-gray-900">{formatDate(endDate)}</div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 font-medium">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g., Maintenance, Personal use, Renovation"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mt-1 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
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
            className="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="flex-1 py-3 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Creating...' : 'Block Dates'}
          </button>
        </div>
      </div>
    </div>
  );
}
