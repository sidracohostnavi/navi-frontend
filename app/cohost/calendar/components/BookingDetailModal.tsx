'use client';

import { useState } from 'react';

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  enrichedGuestName?: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  guestCount?: number;
  totalPrice?: number;
  channel: string;
  status: string;
  platformName?: string;
  stripe_payment_intent_id?: string;
}

interface BookingDetailModalProps {
  booking: Booking;
  onClose: () => void;
  onCancelled: () => void;
  onUpdated?: () => void;
}

export default function BookingDetailModal({
  booking,
  onClose,
  onCancelled,
  onUpdated,
}: BookingDetailModalProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit state
  const [editGuestName, setEditGuestName] = useState(booking.enrichedGuestName || booking.guestName);
  const [editStartDate, setEditStartDate] = useState(booking.startDate);
  const [editEndDate, setEditEndDate] = useState(booking.endDate);
  const [editGuestCount, setEditGuestCount] = useState(booking.guestCount || 0);
  const [editTotalPrice, setEditTotalPrice] = useState(booking.totalPrice || 0);

  const [refundAmount, setRefundAmount] = useState(booking.totalPrice || 0);
  const [withRefund, setWithRefund] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = booking.enrichedGuestName || booking.guestName;
  const isDirectBooking = booking.channel === 'direct';
  const canCancel = isDirectBooking && booking.status !== 'cancelled';
  const canEdit = isDirectBooking && booking.status !== 'cancelled';

  const formatDate = (dateStr: string) => {
    // Add time component to prevent timezone shift in Date constructor
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleCancel = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch(`/api/cohost/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refundAmount: withRefund ? refundAmount : 0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to cancel booking');
        setIsProcessing(false);
        return;
      }

      onCancelled();
      onClose();
    } catch (e) {
      setError('Failed to cancel booking');
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch(`/api/cohost/bookings/${booking.id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: editGuestName,
          startDate: editStartDate,
          endDate: editEndDate,
          guestCount: editGuestCount,
          totalPrice: editTotalPrice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update booking');
        setIsProcessing(false);
        return;
      }

      onUpdated?.();
      setIsEditing(false);
      setIsProcessing(false);
    } catch (e) {
      setError('Failed to update booking');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Booking Details</h2>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && !showCancelConfirm && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm text-teal-600 font-medium hover:text-teal-700"
              >
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2">
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Status Badge */}
          {booking.status === 'cancelled' && (
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded text-sm inline-block">
              Cancelled
            </div>
          )}

          {/* Guest */}
          <div>
            <div className="text-sm text-gray-500">Guest</div>
            {isEditing ? (
              <input
                type="text"
                value={editGuestName}
                onChange={(e) => setEditGuestName(e.target.value)}
                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            ) : (
              <div className="font-medium text-gray-900">{displayName}</div>
            )}
          </div>

          {/* Dates */}
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="text-sm text-gray-500">Check-in</div>
              {isEditing ? (
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              ) : (
                <div className="font-medium text-gray-900">{formatDate(booking.startDate)}</div>
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500">Check-out</div>
              {isEditing ? (
                <input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              ) : (
                <div className="font-medium text-gray-900">{formatDate(booking.endDate)}</div>
              )}
            </div>
          </div>

          {/* Guests */}
          <div>
            <div className="text-sm text-gray-500">Guests</div>
            {isEditing ? (
              <input
                type="number"
                value={editGuestCount}
                onChange={(e) => setEditGuestCount(parseInt(e.target.value) || 0)}
                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            ) : (
              <div className="font-medium text-gray-900">{booking.guestCount || 0}</div>
            )}
          </div>

          {/* Price */}
          <div>
            <div className="text-sm text-gray-500">Total Price</div>
            {isEditing ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={(editTotalPrice / 100).toFixed(2)}
                  onChange={(e) => setEditTotalPrice(Math.round(parseFloat(e.target.value) * 100))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            ) : (
              <div className="font-medium text-gray-900">{formatPrice(booking.totalPrice || 0)}</div>
            )}
          </div>

          {/* Source */}
          <div>
            <div className="text-sm text-gray-500">Source</div>
            <div className="font-medium text-gray-900">
              {booking.channel === 'direct' ? 'Direct Booking' : booking.platformName || booking.channel}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          {!isEditing && !showCancelConfirm && (
            <div className="pt-4 border-t space-y-3">
              {canCancel && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          )}

          {/* Edit Actions */}
          {isEditing && (
            <div className="pt-4 border-t flex gap-3">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  // Reset state
                  setEditGuestName(booking.enrichedGuestName || booking.guestName);
                  setEditStartDate(booking.startDate);
                  setEditEndDate(booking.endDate);
                  setEditGuestCount(booking.guestCount || 0);
                  setEditTotalPrice(booking.totalPrice || 0);
                }}
                disabled={isProcessing}
                className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={isProcessing}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {isProcessing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Cancel Confirmation */}
          {showCancelConfirm && (
            <div className="pt-4 border-t space-y-4">
              <div className="text-sm font-medium text-gray-900">Cancel this booking?</div>
              
              {booking.stripe_payment_intent_id && booking.totalPrice && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="refundOption"
                      checked={withRefund}
                      onChange={() => setWithRefund(true)}
                      className="text-teal-500 focus:ring-teal-500"
                    />
                    <span>Cancel with refund</span>
                  </label>
                  
                  {withRefund && (
                    <div className="ml-6">
                      <label className="text-sm text-gray-600">Refund amount</label>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={booking.totalPrice / 100}
                          value={(refundAmount / 100).toFixed(2)}
                          onChange={(e) => setRefundAmount(Math.round(parseFloat(e.target.value) * 100))}
                          className="border rounded px-3 py-2 w-32 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <span className="text-sm text-gray-500">
                          of {formatPrice(booking.totalPrice)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="refundOption"
                      checked={!withRefund}
                      onChange={() => setWithRefund(false)}
                      className="text-teal-500 focus:ring-teal-500"
                    />
                    <span>Cancel without refund</span>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  {isProcessing ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* iCal booking notice */}
          {!isDirectBooking && (
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500">
                This booking was synced from {booking.platformName || 'an external platform'}. 
                To cancel or edit, please use the original booking platform.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
