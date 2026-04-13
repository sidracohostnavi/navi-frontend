'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Photo { url: string; caption: string; space: string; }
interface Fee { name: string; amount: number; type: 'fixed' | 'percentage'; frequency?: 'night' | 'stay'; }
interface Listing {
  name: string; headline: string; description: string;
  yourProperty: string; guestAccess: string; interactionWithGuests: string; otherDetails: string;
  photos: Photo[]; spaces: string[]; coverPhoto: string;
  nightlyRate: number; cleaningFee: number; minNights: number; maxNights: number;
  maxGuests: number; baseGuestsIncluded: number; extraGuestFee: number; extraGuestFeeFrequency: string;
  additionalFees: Fee[]; taxes: Fee[];
  bedrooms: number; beds: number; bathrooms: number;
  amenities: string[]; houseRules: any;
  checkInTime: string; checkOutTime: string;
  location: string; address: string; rentalAgreementText: string;
  policy: { name: string; payment_policy: string; cancellation_policy: string; rental_agreement_text: string; quote_expiry_hours: number; } | null;
  workspaceName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const currency = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const fmtTime = (t: string) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const nightsBetween = (a: string, b: string) => Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// ─── Dual-month calendar ──────────────────────────────────────────────────────
function DualCalendar({ checkIn, checkOut, onSelect, minDate }: {
  checkIn: string; checkOut: string;
  onSelect: (ci: string, co: string) => void;
  minDate: string;
}) {
  const today = new Date();
  const [baseYear, setBaseYear] = useState(today.getFullYear());
  const [baseMonth, setBaseMonth] = useState(today.getMonth());
  const [hovered, setHovered] = useState('');
  const [picking, setPicking] = useState<'in' | 'out'>('in');

  const months = [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
  ];
  const monthName = (m: number) => new Date(2000, m, 1).toLocaleString('default', { month: 'long' });

  const handleDay = (d: string) => {
    if (d < minDate) return;
    if (picking === 'in') { onSelect(d, ''); setPicking('out'); return; }
    if (d <= checkIn) { onSelect(d, ''); setPicking('out'); return; }
    onSelect(checkIn, d);
    setPicking('in');
  };

  const isInRange = (d: string) => { const end = checkOut || hovered; return !!(checkIn && end && d > checkIn && d < end); };

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return (
      <div className="flex-1 min-w-0" key={`${year}-${month}`}>
        <p className="text-center font-semibold text-gray-900 mb-4 text-sm">{monthName(month)} {year}</p>
        <div className="grid grid-cols-7 gap-y-1">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-xs text-gray-400 pb-2">{d}</div>)}
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={i} />;
            const past = dateStr < minDate;
            const isStart = dateStr === checkIn;
            const isEnd = dateStr === checkOut;
            const inRange = isInRange(dateStr);
            return (
              <button key={dateStr} disabled={past} onClick={() => handleDay(dateStr)}
                onMouseEnter={() => picking === 'out' && setHovered(dateStr)}
                onMouseLeave={() => setHovered('')}
                className={`h-9 text-sm transition-colors rounded-full
                  ${past ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}
                  ${isStart || isEnd ? 'bg-gray-900 text-white hover:bg-gray-800 font-semibold' : ''}
                  ${inRange ? 'bg-gray-100 rounded-none' : ''}
                  ${isStart && checkOut ? 'rounded-l-full rounded-r-none' : ''}
                  ${isEnd ? 'rounded-r-full rounded-l-none' : ''}
                `}>
                {parseInt(dateStr.split('-')[2], 10)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => { const p = new Date(baseYear, baseMonth - 1, 1); setBaseYear(p.getFullYear()); setBaseMonth(p.getMonth()); }}
          disabled={baseYear === today.getFullYear() && baseMonth === today.getMonth()}
          className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => { const n = new Date(baseYear, baseMonth + 1, 1); setBaseYear(n.getFullYear()); setBaseMonth(n.getMonth()); }}
          className="p-2 rounded-full hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="flex gap-8">{months.map(({ year, month }) => renderMonth(year, month))}</div>
      {checkIn && !checkOut && <p className="text-center text-sm text-gray-500 mt-4">Select your check-out date</p>}
      {checkIn && checkOut && (
        <button onClick={() => { onSelect('', ''); setPicking('in'); }} className="w-full mt-4 text-sm text-gray-500 underline hover:text-gray-800">Clear dates</button>
      )}
    </div>
  );
}

// ─── Gallery modal ────────────────────────────────────────────────────────────
function GalleryModal({ photos, spaces, initialSpace, onClose }: { photos: Photo[]; spaces: string[]; initialSpace: string; onClose: () => void; }) {
  const [activeSpace, setActiveSpace] = useState(initialSpace);
  const filtered = activeSpace === 'all' ? photos : photos.filter(p => p.space === activeSpace);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          Close
        </button>
        <p className="text-sm font-semibold text-gray-600">{filtered.length} photos</p>
      </div>
      {spaces.length > 1 && (
        <div className="flex gap-2 px-6 py-3 border-b border-gray-100 overflow-x-auto flex-shrink-0">
          {['all', ...spaces].map(s => (
            <button key={s} onClick={() => setActiveSpace(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeSpace === s ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {s === 'all' ? 'All photos' : s}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto columns-2 md:columns-3 gap-4 space-y-4">
          {filtered.map((photo, i) => (
            <div key={i} className="break-inside-avoid rounded-2xl overflow-hidden mb-4">
              <img src={photo.url} alt={photo.caption || `Photo ${i + 1}`} className="w-full object-cover" />
              {photo.caption && <p className="bg-gray-50 text-xs text-gray-500 px-3 py-2">{photo.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────
function BookingCard({ listing, propertyId, slug, checkIn, checkOut, guests, setCheckIn, setCheckOut, setGuests, showCalendar, setShowCalendar, calendarRef, pricing, availability, checkingAvailability, today, router }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
      <div className="flex items-baseline gap-1 mb-5">
        <span className="text-2xl font-bold text-gray-900">{currency(listing.nightlyRate)}</span>
        <span className="text-gray-500 text-base">/ night</span>
        {listing.minNights > 1 && <span className="ml-auto text-xs text-gray-400">{listing.minNights} night min</span>}
      </div>

      {/* Date + guests picker */}
      <div className="border border-gray-300 rounded-xl mb-4 relative" ref={calendarRef}>
        <div className="flex border-b border-gray-300">
          <button onClick={() => setShowCalendar((v: boolean) => !v)}
            className="flex-1 p-3 border-r border-gray-300 text-left hover:bg-gray-50 transition-colors">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Check-in</p>
            <p className={`text-sm ${checkIn ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{checkIn || 'Add date'}</p>
          </button>
          <button onClick={() => setShowCalendar((v: boolean) => !v)}
            className="flex-1 p-3 text-left hover:bg-gray-50 transition-colors">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Check-out</p>
            <p className={`text-sm ${checkOut ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{checkOut || 'Add date'}</p>
          </button>
        </div>
        <div className="p-3">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Guests</p>
          <select value={guests} onChange={e => setGuests(parseInt(e.target.value))}
            className="w-full text-sm text-gray-900 bg-transparent outline-none appearance-none">
            {Array.from({ length: listing.maxGuests || 1 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        {showCalendar && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-[640px] max-w-[calc(100vw-2rem)]">
            <DualCalendar checkIn={checkIn} checkOut={checkOut}
              onSelect={(ci, co) => { setCheckIn(ci); setCheckOut(co); if (ci && co) setShowCalendar(false); }}
              minDate={today} />
          </div>
        )}
      </div>

      {/* Status */}
      <div className="h-9 mb-2 flex items-center justify-center">
        {checkingAvailability && <div className="flex items-center gap-2 text-gray-500 text-sm"><div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />Checking...</div>}
        {availability === false && !checkingAvailability && <div className="w-full p-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm font-medium text-center">Those dates are unavailable</div>}
        {availability === true && !checkingAvailability && checkIn && checkOut && <p className="text-green-600 text-sm font-medium">✓ Available</p>}
        {!checkIn && !checkOut && !checkingAvailability && <p className="text-gray-400 text-sm">Select dates to check availability</p>}
      </div>

      {checkIn && checkOut && !pricing && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm text-center">{listing.minNights} night minimum stay</div>
      )}

      <button disabled={!availability || !pricing || checkingAvailability}
        onClick={() => router.push(`/book/${slug}/checkout?${new URLSearchParams({ checkIn, checkOut, guests: String(guests), propertyId })}`)}
        className="w-full py-3.5 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold text-lg rounded-xl hover:opacity-90 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mb-2">
        Reserve
      </button>
      <p className="text-xs text-gray-400 text-center mb-5">You won't be charged yet</p>

      {/* Price breakdown */}
      {pricing && availability && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex justify-between text-gray-600 text-sm">
            <span className="underline decoration-dashed underline-offset-4">{currency(listing.nightlyRate)} × {pricing.nights} nights</span>
            <span>{currency(pricing.nightsTotal)}</span>
          </div>
          {pricing.cleaning > 0 && <div className="flex justify-between text-gray-600 text-sm"><span className="underline decoration-dashed underline-offset-4">Cleaning fee</span><span>{currency(pricing.cleaning)}</span></div>}
          {pricing.extraFee > 0 && <div className="flex justify-between text-gray-600 text-sm"><span className="underline decoration-dashed underline-offset-4">Extra guests ({pricing.extraGuests})</span><span>{currency(pricing.extraFee)}</span></div>}
          {pricing.addlBreakdown.map((f: any) => <div key={f.name} className="flex justify-between text-gray-600 text-sm"><span className="underline decoration-dashed underline-offset-4">{f.name}</span><span>{currency(f.amount)}</span></div>)}
          {pricing.taxBreakdown.map((t: any) => <div key={t.name} className="flex justify-between text-gray-600 text-sm"><span>{t.name}</span><span>{currency(t.amount)}</span></div>)}
          <div className="flex justify-between font-bold text-gray-900 pt-3 border-t border-gray-200"><span>Total</span><span>{currency(pricing.total)}</span></div>
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-4 text-center">
        <button className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors">Contact host</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const isPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'true';

  const [listing, setListing] = useState<Listing | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [showCalendar, setShowCalendar] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availability, setAvailability] = useState<boolean | null>(null);

  const [showGallery, setShowGallery] = useState(false);
  const [galleryInitSpace, setGalleryInitSpace] = useState('all');
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [showAllAgreement, setShowAllAgreement] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { fetchListing(); }, [slug]);
  useEffect(() => { if (checkIn && checkOut) checkAvailability(); else setAvailability(null); }, [checkIn, checkOut]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) setShowCalendar(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchListing = async () => {
    try {
      const res = await fetch(`/api/public/listing/${slug}${isPreview ? '?preview=true' : ''}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Listing not found'); return; }
      setListing(data.listing);
      setPropertyId(data.propertyId);
    } catch { setError('Failed to load listing'); }
    finally { setLoading(false); }
  };

  const checkAvailability = async () => {
    if (!checkIn || !checkOut || !propertyId) return;
    setCheckingAvailability(true); setAvailability(null);
    try {
      const res = await fetch('/api/public/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, checkIn, checkOut }) });
      setAvailability((await res.json()).available);
    } catch { /* silent */ }
    finally { setCheckingAvailability(false); }
  };

  const calcPricing = () => {
    if (!listing || !checkIn || !checkOut) return null;
    const nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0 || nights < listing.minNights) return null;
    const nightsTotal = nights * listing.nightlyRate;
    const cleaning = listing.cleaningFee;
    const extraGuests = Math.max(0, guests - listing.baseGuestsIncluded);
    const extraFee = extraGuests > 0 ? listing.extraGuestFee * (listing.extraGuestFeeFrequency === 'night' ? nights : 1) * extraGuests : 0;
    const addlBreakdown = (listing.additionalFees || []).map((f: Fee) => ({ name: f.name, amount: f.type === 'fixed' ? (f.frequency === 'night' ? f.amount * nights : f.amount) : Math.round(nightsTotal * f.amount / 100) }));
    const addlTotal = addlBreakdown.reduce((s: number, f: any) => s + f.amount, 0);
    const subtotal = nightsTotal + cleaning + extraFee + addlTotal;
    const taxBreakdown = (listing.taxes || []).map((t: Fee) => ({ name: t.name, amount: t.type === 'fixed' ? t.amount : Math.round(subtotal * t.amount / 100) }));
    return { nights, nightsTotal, cleaning, extraFee, extraGuests, addlBreakdown, taxBreakdown, total: subtotal + taxBreakdown.reduce((s: number, t: any) => s + t.amount, 0) };
  };

  const pricing = calcPricing();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF5A5F]" /></div>;
  if (error || !listing) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center bg-white p-10 rounded-2xl shadow-sm border border-gray-100 max-w-md">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Listing Not Found</h1>
        <p className="text-gray-500 text-sm">This property is unavailable or hasn't been published yet.</p>
      </div>
    </div>
  );

  const photos = listing.photos || [];
  const heroPhotos = photos.slice(0, 5);

  return (
    <div className="min-h-screen bg-white">

      {/* Draft preview banner */}
      {isPreview && (
        <div className="bg-amber-500 text-white text-xs font-semibold text-center py-2 px-4">
          Draft Preview — this listing is not yet published. Only you can see this page.
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/mascots/cohost.png" alt="CoHost" className="w-8 h-8 rounded-full border border-gray-100" />
            <span className="text-lg font-bold text-[#FF5A5F] tracking-tight">{listing.workspaceName || 'Navi CoHost'}</span>
          </div>
          <p className="flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Powered by Navi CoHost
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-36">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{listing.name}</h1>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
            {listing.location && <span className="flex items-center gap-1"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{listing.location}</span>}
            <span className="flex items-center gap-1 text-[#FF5A5F] font-medium text-xs">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              Rare find
            </span>
          </div>
        </div>

        {/* Hero photo grid */}
        {heroPhotos.length > 0 ? (
          <div className="relative rounded-2xl overflow-hidden mb-10">
            <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[460px]">
              <div className="col-span-2 row-span-2 overflow-hidden bg-gray-100 cursor-pointer" onClick={() => { setGalleryInitSpace('all'); setShowGallery(true); }}>
                <img src={heroPhotos[0].url} alt={heroPhotos[0].caption || listing.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
              </div>
              {[1,2,3,4].map(i => (
                heroPhotos[i] ? (
                  <div key={i} className="overflow-hidden bg-gray-100 cursor-pointer" onClick={() => { setGalleryInitSpace('all'); setShowGallery(true); }}>
                    <img src={heroPhotos[i].url} alt={heroPhotos[i].caption || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                  </div>
                ) : <div key={i} className="bg-gray-100" />
              ))}
            </div>
            {photos.length > 5 && (
              <button onClick={() => { setGalleryInitSpace('all'); setShowGallery(true); }}
                className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-900 rounded-xl text-sm font-semibold text-gray-900 hover:bg-gray-50 shadow-md transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Show all {photos.length} photos
              </button>
            )}
            {listing.spaces.length > 1 && (
              <div className="absolute bottom-4 left-4 flex gap-2 max-w-xs overflow-x-auto">
                {listing.spaces.map(space => (
                  <button key={space} onClick={() => { setGalleryInitSpace(space); setShowGallery(true); }}
                    className="px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-white/60 rounded-full text-xs font-medium text-gray-800 hover:bg-white transition-colors whitespace-nowrap shadow-sm">
                    {space}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-64 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300 mb-10 border border-gray-200">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-16">

          {/* Left column */}
          <div className="flex-1 min-w-0 space-y-10">

            {/* Quick stats */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 pb-8 border-b border-gray-200">
              {[
                { d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', text: `${listing.maxGuests} guests` },
                { d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', text: `${listing.bedrooms} bedroom${listing.bedrooms !== 1 ? 's' : ''}` },
                { d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z', text: `${listing.beds} bed${listing.beds !== 1 ? 's' : ''}` },
                { d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', text: `${listing.bathrooms} bath${listing.bathrooms !== 1 ? 's' : ''}` },
              ].map(({ d, text }) => (
                <div key={text} className="flex items-center gap-2 text-gray-700">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} /></svg>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* About */}
            {listing.description && (
              <div className="border-b border-gray-200 pb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">About this place</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
              </div>
            )}

            {/* The space */}
            {listing.yourProperty && (
              <div className="border-b border-gray-200 pb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">The space</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.yourProperty}</p>
              </div>
            )}

            {/* Guest access */}
            {listing.guestAccess && (
              <div className="border-b border-gray-200 pb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Guest access</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.guestAccess}</p>
              </div>
            )}

            {/* Amenities */}
            {listing.amenities && listing.amenities.length > 0 && (
              <div className="border-b border-gray-200 pb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">What this place offers</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                  {(showAllAmenities ? listing.amenities : listing.amenities.slice(0, 10)).map((a, i) => (
                    <div key={i} className="flex items-center gap-3 text-gray-700">
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                      {a}
                    </div>
                  ))}
                </div>
                {listing.amenities.length > 10 && (
                  <button onClick={() => setShowAllAmenities(v => !v)}
                    className="mt-6 px-5 py-2.5 border border-gray-900 rounded-xl text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                    {showAllAmenities ? 'Show fewer' : `Show all ${listing.amenities.length} amenities`}
                  </button>
                )}
              </div>
            )}

            {/* Map */}
            <div className="border-b border-gray-200 pb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Where you'll be</h2>
              {listing.location && <p className="text-gray-500 text-sm mb-4">{listing.location}</p>}
              {listing.address ? (
                <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-200">
                  <iframe title="Property location" width="100%" height="100%" style={{ border: 0 }} loading="lazy" allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&q=${encodeURIComponent(listing.address)}&zoom=14`} />
                </div>
              ) : (
                <div className="w-full h-64 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                    <p className="text-sm">Exact location shown after booking</p>
                  </div>
                </div>
              )}
            </div>

            {/* House rules */}
            <div className="border-b border-gray-200 pb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">House rules</h2>
              <div className="space-y-4">
                {[
                  { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Check-in', value: fmtTime(listing.checkInTime) || '3:00 PM' },
                  { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Check-out', value: fmtTime(listing.checkOutTime) || '11:00 AM' },
                  ...(listing.minNights > 1 ? [{ icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Minimum stay', value: `${listing.minNights} nights` }] : []),
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center gap-4">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} /></svg>
                    <div><p className="font-medium text-gray-900">{label}</p><p className="text-gray-500 text-sm">{value}</p></div>
                  </div>
                ))}
                {listing.houseRules && [
                  { key: 'petsAllowed', yes: 'Pets allowed', no: 'No pets' },
                  { key: 'smokingAllowed', yes: 'Smoking allowed', no: 'No smoking' },
                  { key: 'eventsAllowed', yes: 'Events allowed', no: 'No parties or events' },
                ].map(({ key, yes, no }) => listing.houseRules[key] !== undefined && (
                  <div key={key} className="flex items-center gap-4">
                    <svg className={`w-5 h-5 ${listing.houseRules[key] ? 'text-green-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {listing.houseRules[key] ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />}
                    </svg>
                    <p className="text-gray-700">{listing.houseRules[key] ? yes : no}</p>
                  </div>
                ))}
                {listing.houseRules?.notes && <div className="mt-2 bg-gray-50 p-4 rounded-xl border border-gray-100"><p className="text-gray-600 text-sm">{listing.houseRules.notes}</p></div>}
              </div>
            </div>

            {/* Host — placeholder for future profile system */}
            {/* TODO: Build host profile (legal name, business name, bio, photo) in DB + Settings, then render here */}
            <div className="border-b border-gray-200 pb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Meet your host</h2>
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{listing.workspaceName || 'Your host'}</p>
                  <p className="text-sm text-gray-400 mt-0.5">Host profile coming soon.</p>
                </div>
              </div>
            </div>

            {/* Reviews — placeholder for future reviews system */}
            {/* TODO: Build reviews system — guest submission after checkout, host response, aggregate star rating */}
            <div className="border-b border-gray-200 pb-10">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-gray-900" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                <h2 className="text-xl font-semibold text-gray-900">Reviews</h2>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
                <p className="text-sm">No reviews yet. Guest reviews will appear here once the review system is live.</p>
              </div>
            </div>

            {/* Policies */}
            {(listing.policy || listing.rentalAgreementText) && (
              <div className="pb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Policies & Terms</h2>
                <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 space-y-6">
                  {listing.policy?.cancellation_policy && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <svg className="w-4 h-4 text-[#FF5A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Cancellation Policy
                      </h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{listing.policy.cancellation_policy}</p>
                    </div>
                  )}
                  {listing.policy?.payment_policy && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <svg className="w-4 h-4 text-[#FF5A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                        Payment Terms
                      </h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{listing.policy.payment_policy}</p>
                    </div>
                  )}
                  {(listing.policy?.rental_agreement_text || listing.rentalAgreementText) && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <svg className="w-4 h-4 text-[#FF5A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Rental Agreement
                      </h3>
                      <div className={`bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-600 font-mono whitespace-pre-wrap leading-relaxed shadow-inner overflow-hidden transition-all duration-300 ${showAllAgreement ? '' : 'max-h-40'}`}>
                        {listing.policy?.rental_agreement_text || listing.rentalAgreementText}
                      </div>
                      <button onClick={() => setShowAllAgreement(v => !v)} className="mt-2 text-xs text-gray-500 underline hover:text-gray-800">
                        {showAllAgreement ? 'Show less' : 'Read full agreement'}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 italic flex items-center gap-1.5 pt-2 border-t border-gray-200">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    By clicking "Reserve" you agree to these policies and the rental agreement above.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right column — desktop booking card */}
          <div className="hidden lg:block w-[380px] flex-shrink-0">
            <div className="sticky top-24">
              <BookingCard listing={listing} propertyId={propertyId} slug={slug}
                checkIn={checkIn} checkOut={checkOut} guests={guests}
                setCheckIn={setCheckIn} setCheckOut={setCheckOut} setGuests={setGuests}
                showCalendar={showCalendar} setShowCalendar={setShowCalendar}
                calendarRef={calendarRef} pricing={pricing} availability={availability}
                checkingAvailability={checkingAvailability} today={today} router={router} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40 flex items-center justify-between gap-4 shadow-lg">
        <div>
          <p className="font-bold text-gray-900">{currency(listing.nightlyRate)} <span className="text-sm font-normal text-gray-500">/ night</span></p>
          {checkIn && checkOut && <p className="text-xs text-gray-500">{checkIn} – {checkOut}</p>}
        </div>
        <button
          disabled={(!checkIn || !checkOut) ? false : (!availability || !pricing || checkingAvailability)}
          onClick={() => {
            if (!checkIn || !checkOut) { setShowCalendar(true); return; }
            router.push(`/book/${slug}/checkout?${new URLSearchParams({ checkIn, checkOut, guests: String(guests), propertyId: propertyId! })}`);
          }}
          className="px-6 py-3 bg-gradient-to-r from-[#FF5A5F] to-[#FA5A5A] text-white font-bold rounded-xl hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
          {!checkIn || !checkOut ? 'Select dates' : 'Reserve'}
        </button>
      </div>

      {/* Mobile calendar sheet */}
      {showCalendar && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCalendar(false)}>
          <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <DualCalendar checkIn={checkIn} checkOut={checkOut}
              onSelect={(ci, co) => { setCheckIn(ci); setCheckOut(co); if (ci && co) setShowCalendar(false); }}
              minDate={today} />
          </div>
        </div>
      )}

      {/* Gallery */}
      {showGallery && <GalleryModal photos={photos} spaces={listing.spaces} initialSpace={galleryInitSpace} onClose={() => setShowGallery(false)} />}

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} {listing.workspaceName || 'CoHost'}. Booking powered by{' '}
          <span className="text-[#FF5A5F] font-semibold">Navi CoHost</span>.
        </p>
      </footer>
    </div>
  );
}
