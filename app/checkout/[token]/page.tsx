'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface HoldData {
  id: string;
  property_name: string;
  property_address?: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  guest_first_name: string;
  guest_last_name: string;
  total_price: number;
  price_breakdown: any;
  status: string;
  expires_at: string;
  policy?: {
    payment_policy?: string;
    cancellation_policy?: string;
  };
}

function CheckoutForm({ holdId, onSuccess }: { holdId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setIsProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?hold_id=${holdId}`,
      },
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full py-4 bg-teal-500 text-white rounded-lg font-semibold text-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? 'Processing...' : 'Pay Now'}
      </button>
    </form>
  );
}

function CheckoutContent() {
  const params = useParams();
  const token = params.token as string;
  
  const [hold, setHold] = useState<HoldData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    const initCheckout = async () => {
      try {
        // Fetch hold data and create payment intent
        const res = await fetch(`/api/public/checkout/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid or expired link');
          setLoading(false);
          return;
        }

        setHold(data.hold);
        setClientSecret(data.clientSecret);
      } catch (e) {
        setError('Failed to load checkout');
      }
      setLoading(false);
    };

    initCheckout();
  }, [token]);

  useEffect(() => {
    console.log('[Checkout] Stripe key defined:', !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      console.log('[Checkout] Stripe key value:', process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.substring(0, 10) + '...');
    }
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const calculateNights = () => {
    if (!hold) return 0;
    const checkIn = new Date(hold.check_in);
    const checkOut = new Date(hold.check_out);
    return Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          Loading checkout...
        </div>
      </div>
    );
  }

  if (!stripeKey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Configuration Error</h1>
          <p className="text-gray-600">Payment system is not yet configured on this environment. (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing)</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Checkout</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!hold || !clientSecret) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Expired</h1>
          <p className="text-gray-600">This payment link is no longer valid. Please contact your host for a new link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Booking</h1>
          <p className="text-gray-600 mt-2 text-lg">Secure payment for {hold.property_name}</p>
        </div>

        <div className="grid md:grid-cols-5 gap-8">
          {/* Booking Summary */}
          <div className="md:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-teal-500">📅</span>
                Booking Details
              </h2>
              
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Check-in</div>
                  <div className="text-lg font-semibold text-gray-900">{formatDate(hold.check_in)}</div>
                  <div className="text-sm text-gray-500">After 3:00 PM</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Check-out</div>
                  <div className="text-lg font-semibold text-gray-900">{formatDate(hold.check_out)}</div>
                  <div className="text-sm text-gray-500">Before 11:00 AM</div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-8 pt-8 border-t border-gray-50">
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Guest</div>
                  <div className="text-lg font-semibold text-gray-900 capitalize">
                    {hold.guest_first_name} {hold.guest_last_name}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Guests</div>
                  <div className="text-lg font-semibold text-gray-900">{hold.guest_count} guest{hold.guest_count > 1 ? 's' : ''}</div>
                </div>
              </div>

              {hold.property_address && (
                <div className="mt-8 pt-8 border-t border-gray-50">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Location</div>
                  <div className="text-gray-700">{hold.property_address}</div>
                </div>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-teal-500">💰</span>
                Price Breakdown
              </h2>
              
              {hold.price_breakdown && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-gray-600">
                    <span>
                      {formatPrice(hold.price_breakdown.nightlyRate)} × {calculateNights()} nights
                    </span>
                    <span className="font-medium text-gray-900">{formatPrice(hold.price_breakdown.roomTotal)}</span>
                  </div>

                  {hold.price_breakdown.extraGuestTotal > 0 && (
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Extra guest fees</span>
                      <span className="font-medium text-gray-900">{formatPrice(hold.price_breakdown.extraGuestTotal)}</span>
                    </div>
                  )}

                  {hold.price_breakdown.fees?.map((fee: any) => (
                    <div key={fee.id} className="flex justify-between items-center text-gray-600">
                      <span>{fee.name}</span>
                      <span className="font-medium text-gray-900">{formatPrice(fee.amount)}</span>
                    </div>
                  ))}

                  {hold.price_breakdown.taxes?.map((tax: any) => (
                    <div key={tax.id} className="flex justify-between items-center text-gray-600">
                      <span>{tax.name}</span>
                      <span className="font-medium text-gray-900">{formatPrice(tax.amount)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                    <span className="text-xl font-bold text-gray-900">Total Amount Due</span>
                    <span className="text-2xl font-black text-teal-600">{formatPrice(hold.total_price)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Policies */}
            {hold.policy && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-teal-500">📋</span>
                  Policies
                </h2>
                <div className="space-y-4">
                  {hold.policy.cancellation_policy && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Cancellation Policy</h3>
                      <p className="text-gray-700 leading-relaxed">{hold.policy.cancellation_policy}</p>
                    </div>
                  )}
                  {hold.policy.payment_policy && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Terms</h3>
                      <p className="text-gray-700 leading-relaxed">{hold.policy.payment_policy}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payment Element */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-teal-100 p-8 sticky top-8">
              <h2 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-2">
                <span className="text-teal-500">💳</span>
                Secure Payment
              </h2>
              
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#14b8a6',
                      colorBackground: '#ffffff',
                      colorText: '#1f2937',
                      colorDanger: '#df1b41',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      spacingUnit: '4px',
                      borderRadius: '8px',
                    },
                  },
                }}
              >
                <CheckoutForm 
                  holdId={hold.id} 
                  onSuccess={() => setPaymentComplete(true)} 
                />
              </Elements>

              <div className="mt-8 pt-8 border-t border-gray-100">
                <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span>Encrypted SSL Secure Payment</span>
                </div>
                <div className="flex justify-center gap-4 mt-6 opacity-30 grayscale">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" alt="Stripe" className="h-6" />
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-400">
                Quote expires: <span className="font-semibold text-gray-500">{formatDate(hold.expires_at)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading payment gateway...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
