'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentForm({ 
  booking,
  property,
  token,
}: {
  booking: any;
  property: any;
  token: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    if (property.rentalAgreement && !agreedToTerms) {
      setError('Please accept the rental agreement');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pay/${token}/success`,
        },
      });
      
      if (stripeError) {
        setError(stripeError.message || 'Payment failed');
        setProcessing(false);
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setProcessing(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Rental Agreement */}
      {property.rentalAgreement && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Rental Agreement</h2>
          <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700 whitespace-pre-wrap italic border border-gray-100">
            {property.rentalAgreement}
          </div>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="w-5 h-5 text-[#FA5A5A] rounded border-gray-300 mt-0.5 focus:ring-[#FA5A5A]"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
              I have read and agree to the rental agreement.
            </span>
          </label>
        </div>
      )}
      
      {/* Payment */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 font-display">Payment Method</h2>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex gap-2 items-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
        </div>
      )}
      
      <button
        type="submit"
        disabled={!stripe || processing || (property.rentalAgreement && !agreedToTerms)}
        className="w-full py-4 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold text-xl rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
            <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
            </div>
        ) : `Confirm & Pay ${formatCurrency(booking.totalPrice)}`}
      </button>
    </form>
  );
}

export default function PaymentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingData, setBookingData] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState('');
  
  useEffect(() => {
    loadBooking();
  }, [token]);
  
  const loadBooking = async () => {
    try {
      const res = await fetch(`/api/public/pay/${token}`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Payment link not found');
        setLoading(false);
        return;
      }
      
      setBookingData(data);
      
      // Create payment intent using existing internal route
      const piRes = await fetch('/api/public/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `payment-link-${token}`,
          propertyId: data.propertyId,
          checkIn: data.booking.checkIn.split('T')[0],
          checkOut: data.booking.checkOut.split('T')[0],
          guestName: data.booking.guestName,
          guestEmail: data.booking.guestEmail,
          guestPhone: '',
          guestCount: data.booking.guestCount || 1,
          totalPrice: data.booking.totalPrice,
          bookingId: data.booking.id, // Important: tell webhook to update existing booking
        }),
      });
      
      const piData = await piRes.json();
      
      if (!piRes.ok) {
        setError(piData.error || 'Failed to initialize payment');
        setLoading(false);
        return;
      }
      
      setClientSecret(piData.clientSecret);
      
    } catch (err) {
      setError('Failed to load payment details');
    } finally {
      setLoading(false);
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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-[#FA5A5A] rounded-full animate-spin mb-6" />
          <p className="text-gray-600 font-medium">Securing your payment session...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Unavailable</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors">Retry</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-2">
            <img src="/mascots/cohost.png" alt="Navi" className="w-8 h-8" />
            <span className="text-xl font-display font-bold text-[#FA5A5A]">Stay Payment</span>
        </div>
      </header>
      
      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
        <div className="mb-10">
            <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Complete Your Payment</h1>
            <p className="text-gray-500 font-medium">Please review your booking details and complete the payment below.</p>
        </div>
        
        {/* Booking Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-sm">
          <div className="flex justify-between items-start mb-6">
              <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">{bookingData?.property?.name}</h2>
                  <p className="text-gray-500 text-sm font-medium">Hosted via Navi Direct</p>
              </div>
              <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                  Reserved
              </div>
          </div>
          
          <div className="grid grid-cols-2 gap-y-6 gap-x-12 py-6 border-y border-gray-100 mb-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Check-in</p>
              <p className="text-gray-900 font-semibold">{formatDate(bookingData?.booking?.checkIn)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Check-out</p>
              <p className="text-gray-900 font-semibold">{formatDate(bookingData?.booking?.checkOut)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Guest</p>
              <p className="text-gray-900 font-semibold">{bookingData?.booking?.guestName}</p>
            </div>
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                <p className="text-gray-900 font-semibold">{bookingData?.booking?.nights} nights</p>
            </div>
          </div>
          
          <div className="flex justify-between items-center pt-2">
              <span className="text-gray-500 font-medium">Amount Due</span>
              <span className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(bookingData?.booking?.totalPrice)}</span>
          </div>
        </div>
        
        {clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <PaymentForm
              booking={bookingData.booking}
              property={bookingData.property}
              token={token}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
