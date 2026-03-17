'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

type Listing = {
  name: string;
  headline: string;
  description: string;
  photos: string[];
  nightlyRate: number;
  cleaningFee: number;
  minNights: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  houseRules: any;
  checkInTime: string;
  checkOutTime: string;
  location: string;
};

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Booking form state
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availability, setAvailability] = useState<boolean | null>(null);
  
  useEffect(() => {
    fetchListing();
  }, [slug]);
  
  const fetchListing = async () => {
    try {
      const res = await fetch(`/api/public/listing/${slug}`);
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Listing not found');
        return;
      }
      
      setListing(data.listing);
      setPropertyId(data.propertyId);
    } catch (err) {
      setError('Failed to load listing');
    } finally {
      setLoading(false);
    }
  };
  
  const checkAvailability = async () => {
    if (!checkIn || !checkOut || !propertyId) return;
    
    setCheckingAvailability(true);
    setAvailability(null);
    
    try {
      const res = await fetch('/api/public/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, checkIn, checkOut }),
      });
      
      const data = await res.json();
      setAvailability(data.available);
    } catch (err) {
      console.error('Availability check failed:', err);
    } finally {
      setCheckingAvailability(false);
    }
  };
  
  useEffect(() => {
    if (checkIn && checkOut) {
      checkAvailability();
    }
  }, [checkIn, checkOut]);
  
  // Calculate pricing
  const calculatePrice = () => {
    if (!listing || !checkIn || !checkOut) return null;
    
    const nights = Math.ceil(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (nights <= 0) return null;
    if (nights < listing.minNights) return null;
    
    const nightsTotal = nights * listing.nightlyRate;
    const cleaningFee = listing.cleaningFee;
    const total = nightsTotal + cleaningFee;
    
    return { nights, nightsTotal, cleaningFee, total };
  };
  
  const pricing = calculatePrice();
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };
  
  const formatTime = (time: string) => {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FA5A5A]" />
      </div>
    );
  }
  
  if (error || !listing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-md w-full">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Listing Not Found</h1>
          <p className="text-gray-600">This property is either unavailable or has not been published for direct booking yet.</p>
        </div>
      </div>
    );
  }
  
  const minCheckIn = new Date().toISOString().split('T')[0];
  const minCheckOut = checkIn || minCheckIn;
  
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <img src="/mascots/cohost.png" alt="Navi" className="w-8 h-8 rounded-full border border-gray-100" />
            <span className="text-xl font-bold text-[#FA5A5A] tracking-tight">Navi Home</span>
          </div>
        </div>
      </header>
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Property Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{listing.name}</h1>
          <p className="text-lg text-gray-600">{listing.headline}</p>
          {listing.location && (
            <div className="flex items-center gap-1 text-gray-500 mt-2 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{listing.location}</span>
            </div>
          )}
        </div>
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          {/* Left Column - Property Details */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* Photos */}
            {listing.photos && listing.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 rounded-2xl overflow-hidden aspect-[16/9] shadow-sm">
                {listing.photos.slice(0, 4).map((photo, i) => (
                  <img
                    key={i}
                    src={photo}
                    alt={`${listing.name} photo ${i + 1}`}
                    className={`w-full h-full object-cover transition-transform hover:scale-105 duration-500 ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
                  />
                ))}
              </div>
            ) : (
                <div className="w-full aspect-[16/9] bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 border border-gray-200">
                    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
            )}
            
            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-6 border-b border-gray-200 text-gray-700 text-lg">
              <div className="flex items-center gap-2">
                 <svg className="w-5 h-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                 <span>{listing.maxGuests} guests</span>
              </div>
              <div className="flex items-center gap-2">
                 <svg className="w-5 h-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                 <span>{listing.bedrooms} bedrooms</span>
              </div>
              <div className="flex items-center gap-2">
                 <svg className="w-5 h-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                 <span>{listing.beds} beds</span>
              </div>
              <div className="flex items-center gap-2">
                 <svg className="w-5 h-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <span>{listing.bathrooms} baths</span>
              </div>
            </div>
            
            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">About this place</h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>
            
            {/* Amenities */}
            {listing.amenities && listing.amenities.length > 0 && (
              <div className="border-t border-gray-200 pt-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">What this place offers</h2>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  {listing.amenities.slice(0, 10).map((amenity, i) => (
                    <div key={i} className="flex items-center gap-3 text-gray-700">
                      <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {amenity}
                    </div>
                  ))}
                </div>
                {listing.amenities.length > 10 && (
                  <button className="mt-6 px-5 py-2.5 border border-gray-900 rounded-lg text-gray-900 font-medium hover:bg-gray-50 transition-colors">
                    Show all {listing.amenities.length} amenities
                  </button>
                )}
              </div>
            )}
            
            {/* House Rules */}
            <div className="border-t border-gray-200 pt-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">House Rules & Notes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-700">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>Check-in: {formatTime(listing.checkInTime) || '3:00 PM'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>Check-out: {formatTime(listing.checkOutTime) || '11:00 AM'}</span>
                    </div>
                </div>
                <div className="space-y-3">
                    {listing.houseRules && (
                        <>
                            {listing.houseRules.petsAllowed ? (
                                <div className="flex items-center gap-3"><span className="w-5 h-5 flex items-center justify-center font-bold text-green-600">✓</span> Pets allowed</div>
                            ) : (
                                <div className="flex items-center gap-3"><span className="w-5 h-5 flex items-center justify-center font-bold text-red-500">✗</span> No pets</div>
                            )}
                            
                            {listing.houseRules.smokingAllowed === false && (
                                <div className="flex items-center gap-3"><span className="w-5 h-5 flex items-center justify-center font-bold text-red-500">✗</span> No smoking</div>
                            )}

                            {listing.houseRules.eventsAllowed === false && (
                                <div className="flex items-center gap-3"><span className="w-5 h-5 flex items-center justify-center font-bold text-red-500">✗</span> No parties or events</div>
                            )}
                        </>
                    )}
                </div>
              </div>
              {listing.houseRules?.notes && (
                  <div className="mt-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <p className="text-gray-700">{listing.houseRules.notes}</p>
                  </div>
              )}
            </div>
          </div>
          
          {/* Right Column - Booking Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
              
              {/* Price */}
              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(listing.nightlyRate)}
                </span>
                <span className="text-gray-500 font-normal">night</span>
              </div>
              
              {/* Date Selection */}
              <div className="border border-gray-300 rounded-xl overflow-hidden mb-4 bg-white">
                <div className="flex border-b border-gray-300">
                    <div className="flex-1 p-3 border-r border-gray-300">
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Check-in</label>
                        <input
                            type="date"
                            value={checkIn}
                            min={minCheckIn}
                            onChange={e => setCheckIn(e.target.value)}
                            className="w-full outline-none text-gray-900 bg-transparent text-sm"
                        />
                    </div>
                    <div className="flex-1 p-3">
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Check-out</label>
                        <input
                            type="date"
                            value={checkOut}
                            min={minCheckOut}
                            onChange={e => setCheckOut(e.target.value)}
                            className="w-full outline-none text-gray-900 bg-transparent text-sm"
                        />
                    </div>
                </div>
                <div className="p-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Guests</label>
                    <select
                        value={guests}
                        onChange={e => setGuests(parseInt(e.target.value))}
                        className="w-full outline-none text-gray-900 bg-transparent text-sm appearance-none"
                    >
                        {Array.from({ length: listing.maxGuests || 1 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>
                        ))}
                    </select>
                </div>
              </div>
              
              {/* Availability Status */}
              <div className="h-10 mb-2 flex items-center justify-center">
                  {checkingAvailability && (
                    <div className="flex items-center justify-center gap-2 text-gray-500 text-sm w-full">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                        Checking dates...
                    </div>
                  )}
                  
                  {availability === false && !checkingAvailability && (
                    <div className="w-full p-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm font-medium text-center shadow-sm">
                      Those dates are unavailable
                    </div>
                  )}
                  
                  {availability === true && !checkingAvailability && checkIn && checkOut && (
                    <div className="text-green-600 text-sm font-medium w-full text-center">
                      ✓ Available to book
                    </div>
                  )}

                  {!checkIn && !checkOut && !checkingAvailability && (
                      <div className="text-gray-400 text-sm">
                          Select dates to see price
                      </div>
                  )}
              </div>
              
              
              {/* Book Button */}
              <button
                disabled={!availability || !pricing || checkingAvailability}
                className="w-full py-3.5 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold text-lg rounded-xl hover:opacity-90 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mb-4"
                onClick={() => {
                    const params = new URLSearchParams({
                      checkIn,
                      checkOut,
                      guests: String(guests),
                      propertyId: propertyId!,
                    });
                    router.push(`/book/${slug}/checkout?${params}`);
                  }}
              >
                Reserve
              </button>
              
              <p className="text-sm text-gray-500 text-center mb-6">
                You won't be charged yet
              </p>

              {/* Price Breakdown */}
              {pricing && availability && (
                <div className="pt-2 space-y-3">
                  <div className="flex justify-between text-gray-600">
                    <span className="underline decoration-dashed underline-offset-4">{formatCurrency(listing.nightlyRate)} × {pricing.nights} nights</span>
                    <span>{formatCurrency(pricing.nightsTotal)}</span>
                  </div>
                  {pricing.cleaningFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span className="underline decoration-dashed underline-offset-4">Cleaning fee</span>
                      <span>{formatCurrency(pricing.cleaningFee)}</span>
                    </div>
                  )}
                  
                  <div className="my-4 border-t border-gray-300"></div>

                  <div className="flex justify-between font-bold text-gray-900 text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(pricing.total)}</span>
                  </div>
                </div>
              )}
              
              {/* Minimum Nights Warning */}
              {checkIn && checkOut && pricing === null && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm text-center font-medium">
                  {listing.minNights} night minimum stay required
                </div>
              )}
              
            </div>
            
            {/* Host info teaser */}
            <div className="mt-6 flex items-center justify-center gap-2 text-gray-500">
                <svg className="w-5 h-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <span className="text-sm">Secure direct booking</span>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
