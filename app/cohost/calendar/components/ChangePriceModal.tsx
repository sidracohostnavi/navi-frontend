'use client';

import { useState } from 'react';

interface ChangePriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  propertyName: string;
  startDate: Date;
  endDate: Date;
  currentBaseRate: number; // cents
  onSuccess: () => void;
}

export default function ChangePriceModal({
  isOpen,
  onClose,
  propertyId,
  propertyName,
  startDate,
  endDate,
  currentBaseRate,
  onSuccess,
}: ChangePriceModalProps) {
  const [newRate, setNewRate] = useState(currentBaseRate.toFixed(0));
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (d: Date) => {
    // Ensure we don't have timezone shifts for display
    const date = new Date(d);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  // Calculate number of nights
  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const toIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleSave = async () => {
    const rateInCents = Math.round(parseFloat(newRate) * 100);
    
    if (isNaN(rateInCents) || rateInCents < 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cohost/pricing/dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          startDate: toIso(startDate),
          endDate: toIso(endDate),
          nightlyRate: rateInCents,
          note: note || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update pricing');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e) {
      setError('Failed to update pricing');
      setIsLoading(false);
    }
  };

  const handleRevertToBase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/cohost/pricing/dates?propertyId=${propertyId}&startDate=${toIso(startDate)}&endDate=${toIso(endDate)}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to revert pricing');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e) {
      setError('Failed to revert pricing');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Change Nightly Rate</h2>
            <p className="text-sm text-gray-500 mt-0.5">{propertyName}</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-teal-50 border border-teal-100 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-teal-700 uppercase tracking-wider">Date Range</div>
              <div className="font-bold text-teal-900 text-lg mt-0.5">
                {formatDate(startDate)} &rarr; {formatDate(endDate)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-teal-700 uppercase tracking-wider">Duration</div>
              <div className="font-bold text-teal-900 text-lg mt-0.5">
                {nights} night{nights !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                New nightly rate
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-xl font-semibold group-focus-within:text-teal-600 transition-colors">$</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className="w-full pl-10 pr-16 py-4 text-2xl font-bold text-gray-900 border border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all outline-none"
                  placeholder="0"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <span className="text-gray-400 font-medium whitespace-nowrap">/ night</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                <span>Base rate is <span className="font-semibold text-gray-700 line-through">${Math.round(currentBaseRate)}</span></span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Holiday pricing, Special offer"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all outline-none text-gray-700"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-800 animate-in slide-in-from-top-2 duration-200">
              <span className="shrink-0 text-xl">⚠️</span>
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-6 border-t bg-gray-50/50 space-y-4 text-center">
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-4 px-6 border border-gray-200 bg-white rounded-xl font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 py-4 px-6 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all shadow-lg shadow-teal-600/20"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </div>
              ) : 'Update Price'}
            </button>
          </div>
          
          <button
            onClick={handleRevertToBase}
            disabled={isLoading}
            className="text-sm font-semibold text-gray-500 hover:text-teal-600 transition-colors py-1 inline-flex items-center gap-1.5"
          >
            <span className="underline decoration-dotted transition-all">Revert to base rate (${Math.round(currentBaseRate)}/night)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
