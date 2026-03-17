'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutForm({ 
  clientSecret,
  sessionId,
  propertyId,
  slug,
  checkIn,
  checkOut,
  pricing,
  rentalAgreement,
}: {
  clientSecret: string;
  sessionId: string;
  propertyId: string;
  slug: string;
  checkIn: string;
  checkOut: string;
  pricing: any;
  rentalAgreement: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    if (!agreedToTerms) {
      setError('Please accept the rental agreement');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      // Update payment intent with latest guest info just before confirming
      // Metadata in PI is useful for the webhook to create the final booking
      const res = await fetch('/api/public/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          propertyId,
          checkIn,
          checkOut,
          guestName,
          guestEmail,
          guestPhone,
          guestCount,
          totalPrice: pricing.totalPrice,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update payment information');
      }
      
      // Confirm payment
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/book/${slug}/confirmation?session=${sessionId}`,
          receipt_email: guestEmail,
        },
      });
      
      if (stripeError) {
        setError(stripeError.message || 'Payment failed');
        setProcessing(false);
      }
      // If no error, Stripe redirects to return_url
      
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setProcessing(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Guest Info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Your Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="w-full rounded-xl border-gray-300 border px-4 py-2.5 focus:ring-2 focus:ring-[#FA5A5A] outline-none transition-shadow"
              placeholder="John Doe"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                type="email"
                required
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                className="w-full rounded-xl border-gray-300 border px-4 py-2.5 focus:ring-2 focus:ring-[#FA5A5A] outline-none transition-shadow"
                placeholder="john@example.com"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                type="tel"
                required
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                className="w-full rounded-xl border-gray-300 border px-4 py-2.5 focus:ring-2 focus:ring-[#FA5A5A] outline-none transition-shadow"
                placeholder="(555) 000-0000"
                />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Guests</label>
            <input
              type="number"
              min={1}
              value={guestCount}
              onChange={e => setGuestCount(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl border-gray-300 border px-4 py-2.5 focus:ring-2 focus:ring-[#FA5A5A] outline-none transition-shadow"
            />
          </div>
        </div>
      </div>
      
      {/* Rental Agreement */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Rental Agreement</h2>
        <div className="max-h-64 overflow-y-auto bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100 italic">
          {rentalAgreement || "Standard House Rules and Terms Apply."}
        </div>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={e => setAgreedToTerms(e.target.checked)}
            className="w-5 h-5 text-[#FA5A5A] rounded border-gray-300 mt-0.5 focus:ring-[#FA5A5A] cursor-pointer"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
            I have read and agree to the rental agreement and house rules.
          </span>
        </label>
      </div>
      
      {/* Payment */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 font-display">Payment Method</h2>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      
      {/* Price Summary */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 shadow-inner">
        <div className="space-y-3 text-gray-700">
          <div className="flex justify-between">
            <span>{formatCurrency(pricing.nightlyRate)} × {pricing.nights} nights</span>
            <span className="font-medium">{formatCurrency(pricing.nightsTotal)}</span>
          </div>
          {pricing.cleaningFee > 0 && (
            <div className="flex justify-between">
              <span>Cleaning fee</span>
              <span className="font-medium">{formatCurrency(pricing.cleaningFee)}</span>
            </div>
          )}
          <div className="pt-4 border-t border-gray-300 flex justify-between items-baseline">
            <span className="text-xl font-bold text-gray-900">Total (USD)</span>
            <span className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(pricing.totalPrice)}</span>
          </div>
        </div>
      </div>
      
      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex gap-2 items-center">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
      
      {/* Submit */}
      <div className="pt-2">
        <button
            type="submit"
            disabled={!stripe || processing || !agreedToTerms}
            className="w-full py-4 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold text-xl rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {processing ? (
                <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Processing Payment...
                </div>
            ) : `Confirm & Pay ${formatCurrency(pricing.totalPrice)}`}
        </button>
        <p className="text-center text-xs text-gray-500 mt-4 px-4 leading-normal">
            By clicking "Confirm & Pay", you agree to the Terms of Service and authorize the payment processing.
        </p>
      </div>
      
    </form>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutData, setCheckoutData] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState('');
  
  useEffect(() => {
    startCheckout();
  }, []);
  
  const startCheckout = async () => {
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const guests = searchParams.get('guests');
    const propertyId = searchParams.get('propertyId');
    
    if (!checkIn || !checkOut || !propertyId) {
      router.push(`/book/${slug}`);
      return;
    }
    
    try {
      // Start checkout session (creates hold)
      const res = await fetch('/api/public/checkout/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, checkIn, checkOut, guests: parseInt(guests || '1') }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to start checkout');
        setLoading(false);
        return;
      }
      
      setCheckoutData(data);
      
      // Create initial payment intent
      const piRes = await fetch('/api/public/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: data.sessionId,
          propertyId,
          checkIn,
          checkOut,
          guestName: '',
          guestEmail: '',
          guestPhone: '',
          guestCount: parseInt(guests || '1'),
          totalPrice: data.pricing.totalPrice,
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
      setError('Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-[#FA5A5A] rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Preparing your stay...</h2>
          <p className="text-gray-600">Checking dates and securing your booking hold.</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to proceed</h2>
          <p className="text-red-600 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => router.push(`/book/${slug}`)}
            className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/mascots/cohost.png" alt="Navi" className="w-8 h-8" />
            <span className="text-xl font-display font-bold text-[#FA5A5A]">Checkout</span>
          </div>
          <button 
                onClick={() => router.push(`/book/${slug}`)}
                className="text-sm font-medium text-gray-400 hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              Cancel
          </button>
        </div>
      </header>
      
      <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
        <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <svg className="w-6 h-6 text-[#FA5A5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </div>
            <div>
                <h1 className="text-2xl font-bold text-gray-900">{checkoutData?.property?.name}</h1>
                <p className="text-gray-500 font-medium">
                {checkoutData?.booking?.nights} nights • {checkoutData?.booking?.checkIn} to {checkoutData?.booking?.checkOut}
                </p>
            </div>
        </div>
        
        {clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <CheckoutForm
              clientSecret={clientSecret}
              sessionId={checkoutData.sessionId}
              propertyId={searchParams.get('propertyId')!}
              slug={slug}
              checkIn={checkoutData.booking.checkIn}
              checkOut={checkoutData.booking.checkOut}
              pricing={checkoutData.pricing}
              rentalAgreement={checkoutData.rentalAgreement}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
