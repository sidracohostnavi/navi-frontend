'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = use(params);
  const router = useRouter();
  
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  
  useEffect(() => {
    fetchBooking();
  }, [bookingId]);
  
  const fetchBooking = async () => {
    try {
      const res = await fetch(`/api/cohost/bookings/${bookingId}`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to load booking');
        return;
      }
      
      setBooking(data.booking);
    } catch (err) {
      setError('Failed to load booking');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancel = async () => {
    if (!confirm('Cancel this booking? This action cannot be undone.')) return;
    
    setActionLoading('cancel');
    try {
      const res = await fetch(`/api/cohost/bookings/${bookingId}/cancel`, {
        method: 'POST',
      });
      
      if (res.ok) {
        fetchBooking();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to cancel');
      }
    } catch (err) {
      alert('Failed to cancel');
    } finally {
      setActionLoading('');
    }
  };
  
  const handleRefund = async (full: boolean) => {
    const amount = full ? null : prompt('Enter refund amount in dollars:');
    if (!full && !amount) return;
    
    const amountCents = full ? null : Math.round(parseFloat(amount!) * 100);
    
    if (!confirm(`Issue ${full ? 'full' : `$${amount}`} refund?`)) return;
    
    setActionLoading('refund');
    try {
      const res = await fetch(`/api/cohost/bookings/${bookingId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountCents }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert(`Refunded $${(data.refunded / 100).toFixed(2)}`);
        fetchBooking();
      } else {
        alert(data.error || 'Failed to refund');
      }
    } catch (err) {
      alert('Failed to refund');
    } finally {
      setActionLoading('');
    }
  };
  
  const handleResendPaymentLink = async () => {
    setActionLoading('resend');
    try {
      const res = await fetch(`/api/cohost/bookings/${bookingId}/send-payment-link`, {
        method: 'POST',
      });
      
      if (res.ok) {
        alert('Payment link sent!');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send');
      }
    } catch (err) {
      alert('Failed to send');
    } finally {
      setActionLoading('');
    }
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FA5A5A]" />
      </div>
    );
  }
  
  if (error || !booking) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-red-600 mb-4">{error || 'Booking not found'}</p>
          <Link href="/cohost/calendar" className="text-[#FA5A5A] hover:underline">
            Back to Calendar
          </Link>
        </div>
      </div>
    );
  }
  
  const paymentUrl = booking.payment_link_token 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${booking.payment_link_token}`
    : null;
  
  return (
    <div className="min-h-screen bg-transparent p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/cohost/calendar" className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors shadow-sm">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Booking Details</h1>
            <p className="text-gray-500 font-medium">{booking.propertyName}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* Status Section */}
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            {booking.status === 'confirmed' && (
                                <span className="px-4 py-1.5 bg-green-50 text-green-600 font-bold text-xs uppercase tracking-widest rounded-full border border-green-100">
                                    Confirmed
                                </span>
                            )}
                            {booking.status === 'pending_payment' && (
                                <span className="px-4 py-1.5 bg-yellow-50 text-yellow-600 font-bold text-xs uppercase tracking-widest rounded-full border border-yellow-100">
                                    Pending Payment
                                </span>
                            )}
                            {booking.status === 'cancelled' && (
                                <span className="px-4 py-1.5 bg-red-50 text-red-600 font-bold text-xs uppercase tracking-widest rounded-full border border-red-100">
                                    Cancelled
                                </span>
                            )}
                            {booking.source === 'direct' && (
                                <span className="px-4 py-1.5 bg-blue-50 text-blue-600 font-bold text-xs uppercase tracking-widest rounded-full border border-blue-100">
                                    Direct
                                </span>
                            )}
                        </div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            ID: {booking.id.split('-')[0]}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-8">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Check-in</p>
                            <p className="text-gray-900 font-bold text-lg">{formatDate(booking.check_in)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Check-out</p>
                            <p className="text-gray-900 font-bold text-lg">{formatDate(booking.check_out)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Guest</p>
                            <p className="text-gray-900 font-bold">{booking.guest_name}</p>
                            <p className="text-sm text-gray-500 font-medium">{booking.guest_email}</p>
                            {booking.guest_phone && <p className="text-sm text-gray-500 font-medium">{booking.guest_phone}</p>}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Capacity</p>
                            <p className="text-gray-900 font-bold">{booking.guest_count} {booking.guest_count === 1 ? 'Guest' : 'Guests'}</p>
                        </div>
                    </div>
                </div>

                {/* Audit Section */}
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6 border-b border-gray-100 pb-4">Audit Trail</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                            <span className="text-sm text-gray-500 font-medium">Created On</span>
                            <span className="text-sm text-gray-900 font-semibold">{new Date(booking.created_at).toLocaleString()}</span>
                        </div>
                        {booking.rental_agreement_accepted_at && (
                           <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                <span className="text-sm text-gray-500 font-medium">Agreement Accepted</span>
                                <span className="text-sm text-gray-900 font-semibold">{new Date(booking.rental_agreement_accepted_at).toLocaleString()}</span>
                            </div>
                        )}
                        {booking.cancelled_at && (
                           <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-red-600">
                                <span className="text-sm font-bold uppercase tracking-wider">Cancelled At</span>
                                <span className="text-sm font-semibold">{new Date(booking.cancelled_at).toLocaleString()}</span>
                            </div>
                        )}
                        {booking.notes && (
                            <div className="pt-4">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Internal Notes</p>
                                <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-700 font-medium italic">
                                    {booking.notes}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* Financial Summary */}
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6">Payment</h3>
                    <div className="space-y-4 mb-8">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500 font-medium">Total Charge</span>
                            <span className="text-lg font-black text-gray-900 tracking-tight">{formatCurrency(booking.total_price)}</span>
                        </div>
                        {booking.refund_amount > 0 && (
                            <div className="flex justify-between items-center text-red-600">
                                <span className="text-sm font-bold">Refunded</span>
                                <span className="font-black">-{formatCurrency(booking.refund_amount)}</span>
                            </div>
                        )}
                    </div>

                    {booking.status === 'pending_payment' && paymentUrl ? (
                         <div className="space-y-4 pt-6 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-[0.2em]">Guest Payment Link</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={paymentUrl}
                                    className="flex-1 text-[10px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-gray-500"
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(paymentUrl);
                                        alert('Link copied!');
                                    }}
                                    className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:gray-50 transition-colors"
                                >
                                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            </div>
                            <button
                                onClick={handleResendPaymentLink}
                                disabled={!!actionLoading}
                                className="w-full py-3 bg-yellow-50 text-yellow-700 text-xs font-black uppercase tracking-widest rounded-xl border border-yellow-100 hover:bg-yellow-100 transition-all disabled:opacity-50"
                            >
                                {actionLoading === 'resend' ? 'Sending...' : 'Resend Link'}
                            </button>
                        </div>
                    ) : booking.stripe_payment_intent_id ? (
                        <div className="space-y-2 pt-6 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Stripe Reference</p>
                            <p className="text-[10px] font-mono text-gray-500 truncate">{booking.stripe_payment_intent_id}</p>
                        </div>
                    ) : null}
                </div>

                {/* Quick Actions */}
                {booking.source === 'direct' && booking.status !== 'cancelled' && (
                    <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6">Actions</h3>
                        <div className="flex flex-col gap-3">
                            {booking.status === 'confirmed' && booking.stripe_payment_intent_id && (
                                <>
                                    <button
                                        onClick={() => handleRefund(true)}
                                        disabled={!!actionLoading || booking.refund_amount >= booking.total_price}
                                        className="w-full py-3 bg-gray-50 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl border border-gray-200 hover:bg-gray-100 transition-all disabled:opacity-50"
                                    >
                                        Full Refund
                                    </button>
                                    <button
                                        onClick={() => handleRefund(false)}
                                        disabled={!!actionLoading || booking.refund_amount >= booking.total_price}
                                        className="w-full py-3 bg-gray-50 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl border border-gray-200 hover:bg-gray-100 transition-all disabled:opacity-50"
                                    >
                                        Partial Refund
                                    </button>
                                </>
                            )}
                            
                            <button
                                onClick={handleCancel}
                                disabled={!!actionLoading}
                                className="w-full py-3 bg-red-50 text-red-700 text-xs font-black uppercase tracking-widest rounded-xl border border-red-100 hover:bg-red-100 transition-all disabled:opacity-50"
                            >
                                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Booking'}
                            </button>
                        </div>
                        {booking.status === 'confirmed' && (
                             <p className="text-[10px] text-gray-400 font-medium mt-6 text-center italic">
                                Note: Cancellation and refunds are handled separately.
                             </p>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
