'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

import {
  HomeIcon,
  UsersIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/20/solid';
import { createClient } from '@/lib/supabase/client';
import { getPlatformColors, getPlatformBadgeLabel } from '@/lib/utils/platform-colors';

// --- Types ---
type Property = {
  id: string;
  name: string;
  image?: string;
};

type Channel = 'direct' | 'airbnb' | 'vrbo' | 'other';

type Booking = {
  id: string;
  propertyId: string;
  guestName: string;
  guestFirstName?: string;
  guestLastInitial?: string;
  guestCount?: number;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  status: 'confirmed' | 'pending';
  totalPrice: number;
  channel: Channel;
  platform?: string; // Human Readable (e.g. "Spark & Stay")
  platformName: string;
  needsReview: boolean;
  sourceFeedId?: string;
};

// --- Constants ---
const CELL_WIDTH = 140; // px
const ROW_HEIGHT = 80; // px
const HEADER_HEIGHT = 60; // px
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 420;

const TODAY = new Date();
// Range Limits: -12 Months to +24 Months
const MIN_DATE = new Date(TODAY);
MIN_DATE.setMonth(TODAY.getMonth() - 12);
MIN_DATE.setDate(1); // Start of that month

const MAX_DATE = new Date(TODAY);
MAX_DATE.setMonth(TODAY.getMonth() + 24);
MAX_DATE.setDate(1); // Start of that month

const CHANNEL_PRIORITY: Record<Channel, number> = {
  'direct': 1,
  'airbnb': 2,
  'vrbo': 3,
  'other': 4
};

// --- Helpers ---
const toIso = (d: Date) => d.toISOString().split('T')[0];
const addDays = (d: Date, days: number) => {
  const newDate = new Date(d);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
};

const getDatesInWindow = (startDate: Date, days: number) => {
  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
};

const getGridPosition = (booking: Booking, windowStart: Date, windowDays: number) => {
  const bStart = new Date(booking.startDate);
  const bEnd = new Date(booking.endDate);
  const wStart = new Date(windowStart);

  bStart.setHours(0, 0, 0, 0);
  bEnd.setHours(0, 0, 0, 0);
  wStart.setHours(0, 0, 0, 0);

  const diffTime = bStart.getTime() - wStart.getTime();
  let startIndex = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const durationTime = bEnd.getTime() - bStart.getTime();
  const durationDays = Math.ceil(durationTime / (1000 * 60 * 60 * 24));

  let visibleStart = startIndex;
  let visibleDuration = durationDays;

  // Clip from start
  if (visibleStart < 0) {
    visibleDuration += visibleStart;
    visibleStart = 0;
  }

  // Clip from end
  if (visibleStart + visibleDuration > windowDays) {
    visibleDuration = windowDays - visibleStart;
  }

  return { start: visibleStart, span: visibleDuration, isVisible: visibleDuration > 0 };
};

// Deduplication Logic
type BookingGroup = {
  primary: Booking;
  duplicates: Booking[];
};

const deduplicateBookings = (bookings: Booking[]): BookingGroup[] => {
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const groups: BookingGroup[] = [];

  for (const booking of sorted) {
    let placed = false;
    const bStart = new Date(booking.startDate).getTime();
    const bEnd = new Date(booking.endDate).getTime();

    for (const group of groups) {
      const pStart = new Date(group.primary.startDate).getTime();
      const pEnd = new Date(group.primary.endDate).getTime();

      if (bStart < pEnd && bEnd > pStart) {
        const currentPriority = CHANNEL_PRIORITY[group.primary.channel] || 99;
        const newPriority = CHANNEL_PRIORITY[booking.channel] || 99;

        if (newPriority < currentPriority) {
          group.duplicates.push(group.primary);
          group.primary = booking;
        } else {
          group.duplicates.push(booking);
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push({ primary: booking, duplicates: [] });
    }
  }

  return groups;
};

export default function CalendarPage() {
  const supabase = createClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Layout State
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  // Infinite Scroll & Navigation State
  const [rangeStart, setRangeStart] = useState(TODAY);
  const [loadedDays, setLoadedDays] = useState(45); // Initial load window
  const [loadingMore, setLoadingMore] = useState(false);

  // Data State
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [feedMap, setFeedMap] = useState<Record<string, string>>({}); // feed_id -> name
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const dates = useMemo(() => getDatesInWindow(rangeStart, loadedDays), [rangeStart, loadedDays]);

  // Fetch Feeds Helper
  const fetchFeeds = useCallback(async () => {
    try {
      const { data: feedsData } = await supabase
        .from('ical_feeds')
        .select('id, source_name, last_synced_at'); // Added last_synced_at per requirement

      if (feedsData) {
        const map: Record<string, string> = {};
        feedsData.forEach(f => {
          map[f.id] = f.source_name;
        });
        setFeedMap(map);
      }
    } catch (e) {
      console.error('Error fetching feeds:', e);
    }
  }, [supabase]);

  // Initial Fetch (Properties + Feeds + First 45 Days)
  const fetchInitialData = useCallback(async (startPoint: Date = TODAY) => {
    try {
      setLoading(true);

      // 1. Fetch Feeds (Always fetch to ensure fresh identity/timestamp data)
      await fetchFeeds();

      // 2. Fetch Properties (only if empty)
      if (properties.length === 0) {
        const { data: propsData, error: propsError } = await supabase
          .from('cohost_properties')
          .select('id, name, image_url, color')
          .order('name');

        if (propsError) throw propsError;

        const mappedProps: Property[] = (propsData || []).map(p => ({
          id: p.id,
          name: p.name,
          image: p.image_url
        }));
        setProperties(mappedProps);

        // 3. Fetch Initial Bookings
        if (mappedProps.length === 0) {
          setBookings([]);
          setLoading(false);
          return;
        }
      }

      await fetchBookingsRange(startPoint, addDays(startPoint, 45));

    } catch (err) {
      console.error('Error fetching calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, properties.length, fetchFeeds]); // properties.length dependency to avoid re-fetching props

  // Fetch Bookings for a specific range and MERGE into state
  const fetchBookingsRange = async (start: Date, end: Date) => {
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const { data: bookingsData, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('is_active', true)
      .lt('check_in', endStr)
      .gt('check_out', startStr);

    if (error) {
      console.error('Error fetching bookings:', error);
      return;
    }

    const mappedBookings: Booking[] = (bookingsData || []).map(b => ({
      id: b.id,
      propertyId: b.property_id,
      startDate: b.check_in.split('T')[0].replace(/-/g, '/'),
      endDate: b.check_out.split('T')[0].replace(/-/g, '/'),
      status: (b.status === 'confirmed' || b.status === 'pending') ? b.status : 'confirmed',
      totalPrice: b.total_amount || 0,
      channel: (['direct', 'airbnb', 'vrbo'].includes(b.source_type) ? b.source_type : 'other') as Channel,
      platform: b.platform || b.source_type, // "Spark & Stay" etc.
      platformName: b.platform || b.source_type,
      guestName: b.guest_name || 'Guest',
      guestFirstName: b.guest_first_name,
      guestLastInitial: b.guest_last_initial,
      needsReview: b.needs_review || false,
      guestCount: b.guest_count || 0,
      sourceFeedId: b.source_feed_id
    }));

    setBookings(prev => {
      // Merge and Deduplicate by ID
      const existingIds = new Set(prev.map(b => b.id));
      const newBookings = mappedBookings.filter(b => !existingIds.has(b.id));
      return [...prev, ...newBookings];
    });
  };

  const loadMoreDays = async () => {
    if (loadingMore) return;

    const currentEnd = addDays(rangeStart, loadedDays);

    // Stop if we exceed MAX_DATE
    if (currentEnd > MAX_DATE) return;

    setLoadingMore(true);
    const nextEnd = addDays(currentEnd, 30); // Load next 30 days

    await fetchBookingsRange(currentEnd, nextEnd);
    setLoadedDays(prev => prev + 30);
    setLoadingMore(false);
  };

  // Scroll Handler for Lazy Loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    // Trigger when within 600px of end
    if (scrollLeft + clientWidth > scrollWidth - 600) {
      loadMoreDays();
    }
  };

  useEffect(() => {
    fetchInitialData(TODAY);
  }, [fetchInitialData]);

  const handleRefresh = async () => {
    if (properties.length === 0) return;
    setSyncing(true);

    try {
      // 1. Run GLOBAL reconciliation (syncs ALL feeds)
      const refreshRes = await fetch('/api/cohost/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        console.log(`[Calendar] Refresh complete: ${refreshData.calendar_stats?.feeds_synced || 0} feeds synced.`);
      }
    } catch (err) {
      console.error('[Calendar] Refresh API error:', err);
    }

    // 2. Clear and refetch bookings from DB
    setBookings([]);
    setLoadedDays(45);
    // Force re-fetch of feeds and bookings (properties check handled inside)
    await fetchInitialData(rangeStart);
    setSyncing(false);
  };

  // Jump / Navigation Handler
  const jumpToDate = async (targetDate: Date) => {
    // Clamp date
    let d = new Date(targetDate);
    if (d < MIN_DATE) d = new Date(MIN_DATE);
    // Don't strictly clamp MAX for jump start, but ensure we don't render forever

    // Reset state for new jump
    setRangeStart(d);
    setLoadedDays(45);
    setBookings([]); // Clear old bookings to avoid memory bloat if jumping far
    setLoading(true);

    // Reset Scroll
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }

    // Fetch new range
    await fetchBookingsRange(d, addDays(d, 45));
    setLoading(false);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const monthsToAdd = parseInt(e.target.value);
    const newDate = new Date(TODAY);
    newDate.setDate(1); // Normalize to 1st
    newDate.setMonth(TODAY.getMonth() + monthsToAdd);
    jumpToDate(newDate);
  };

  // Generate Month Options (-12 to +24)
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -12; i <= 24; i++) {
      const d = new Date(TODAY);
      d.setDate(1);
      d.setMonth(TODAY.getMonth() + i);
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      const value = i;
      options.push({ label, value });
    }
    return options;
  }, []);

  // Calculate current selected month offset for dropdown
  // Heuristic: compare rangeStart month/year to today
  const currentMonthOffset = useMemo(() => {
    return (rangeStart.getFullYear() - TODAY.getFullYear()) * 12 + (rangeStart.getMonth() - TODAY.getMonth());
  }, [rangeStart]);

  // Local Storage for Sidebar
  useEffect(() => {
    const saved = localStorage.getItem('cohost_calendar_sidebar_width');
    if (saved) {
      const width = Number(saved);
      if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) setSidebarWidth(width);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cohost_calendar_sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  // Resizing Logic
  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);
  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);


  return (
    <div className={`flex flex-col h-[calc(100vh-64px)] bg-white ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {/* Top Controls */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Booking Timeline</h1>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">

            <Link
              href="/cohost/settings/calendar"
              className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              Sync Settings
            </Link>
            <button
              onClick={handleRefresh}
              disabled={syncing || loading}
              className={`p-2 text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm ${syncing ? 'animate-spin' : ''}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100">
            <input
              type="checkbox"
              checked={showDuplicates}
              onChange={e => setShowDuplicates(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            Show duplicates
          </label>

          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={currentMonthOffset}
                onChange={handleMonthChange}
                className="appearance-none bg-white border border-gray-200 text-gray-700 text-xs font-medium py-2 pl-3 pr-8 rounded-lg cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
              </div>
            </div>

            <button
              onClick={() => jumpToDate(TODAY)}
              className="px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors shadow-sm"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative custom-scrollbar overscroll-contain"
      >
        <div
          className="grid relative"
          style={{
            minWidth: 'max-content',
            gridTemplateColumns: `${sidebarWidth}px repeat(${loadedDays}, ${CELL_WIDTH}px)`,
          }}
        >
          {/* Header Row: Properties Title */}
          <div
            className="sticky top-0 left-0 z-40 bg-white border-b border-r border-gray-200 flex items-center px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]"
            style={{ gridColumn: '1', gridRow: '1', height: HEADER_HEIGHT }}
          >
            Properties
          </div>

          {/* Header Row: Dates */}
          {dates.map((date, i) => {
            const isToday = toIso(date) === toIso(TODAY);
            return (
              <div
                key={`header-${i}`}
                className={`sticky top-0 z-30 border-b border-r border-gray-100 flex flex-col justify-center items-center h-[60px] ${isToday ? 'bg-blue-50/80 text-blue-700 box-border border-b-blue-500' : 'bg-gray-50/95 text-gray-700'}`}
                style={{ gridRow: '1', gridColumn: i + 2, height: HEADER_HEIGHT }}
              >
                <div className="text-xs font-medium uppercase">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className={`text-sm font-bold mt-0.5 ${isToday ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center' : ''}`}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}

          {/* Property Rows */}
          {!loading && properties.map((property, rowIdx) => {
            const gridRow = rowIdx + 2;
            const propertyBookings = bookings.filter(b => b.propertyId === property.id);
            const bookingGroups = deduplicateBookings(propertyBookings);
            const isLast = rowIdx === properties.length - 1;
            const rowClass = isLast ? '' : 'border-b border-gray-100';

            return (
              <React.Fragment key={property.id}>
                {/* Sidebar Cell */}
                <div
                  className={`sticky left-0 z-20 bg-white border-r border-gray-200 p-4 flex flex-col justify-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)] ${rowClass}`}
                  style={{ gridColumn: '1', gridRow: gridRow, height: ROW_HEIGHT }}
                >
                  <div className="flex items-center gap-3">
                    {property.image ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                        <img src={property.image} alt={property.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 border border-blue-200 flex-shrink-0">
                        <span className="text-xs font-bold">{property.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{property.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">Entire home</p>
                    </div>
                  </div>
                </div>

                {/* Grid Cells */}
                {dates.map((date, colIdx) => {
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div
                      key={`${property.id}-day-${colIdx}`}
                      className={`border-r border-gray-50 ${isWeekend ? 'bg-gray-50/30' : 'bg-white'} ${rowClass}`}
                      style={{ gridRow: gridRow, gridColumn: colIdx + 2 }}
                    />
                  );
                })}

                {/* Bookings */}
                {bookingGroups.flatMap((group) => {
                  const itemsToRender = [group.primary];
                  if (showDuplicates) itemsToRender.push(...group.duplicates);

                  return itemsToRender.map((booking) => {
                    const isDuplicate = booking.id !== group.primary.id;
                    const { start, span, isVisible } = getGridPosition(booking, rangeStart, loadedDays);
                    if (!isVisible) return null;

                    const colors = getPlatformColors(booking.platform || booking.channel);
                    const badgeLabel = getPlatformBadgeLabel(booking.platform);

                    // Identity Display Logic
                    // 1. Try to get Feed Name from map ("Spark & Stay")
                    // 2. Fallback to Booking's stored Platform Name ("Airbnb")
                    // 3. Fallback to Channel ("airbnb")
                    const accountName = booking.sourceFeedId ? feedMap[booking.sourceFeedId] : null;
                    const displayLabel = accountName || badgeLabel;

                    const getBookingState = (b: Booking) => {
                      const todayStr = toIso(TODAY);
                      if (b.endDate < todayStr) return 'past';
                      if (b.startDate <= todayStr && b.endDate >= todayStr) return 'active';
                      return 'future';
                    };

                    const bookingState = getBookingState(booking);
                    const isPast = bookingState === 'past';
                    const isActive = bookingState === 'active';

                    return (
                      <div
                        key={booking.id}
                        className={`relative mx-1 group ${isDuplicate ? 'mt-8 h-8' : ''} ${isPast ? 'z-0' : 'z-10'} ${isActive ? 'z-30' : ''}`}
                        style={{
                          gridRow: gridRow,
                          gridColumn: `${start + 2} / span ${span}`,
                          alignSelf: isDuplicate ? 'start' : 'center',
                          marginTop: isDuplicate ? '32px' : '0',
                        }}
                      >
                        <div
                          className={`
                            rounded-lg border flex items-center px-1.5 overflow-hidden cursor-pointer transition-all
                            ${isDuplicate ? 'h-full text-[10px] opacity-60' : 'h-12'}
                            ${colors.bg} ${colors.border} ${colors.text}
                            ${isPast ? 'opacity-60 grayscale filter brightness-95 border-opacity-20' : 'shadow-sm border-opacity-40'}
                            ${isActive ? 'ring-2 ring-blue-500 ring-offset-1 shadow-lg scale-[1.02]' : 'hover:scale-[1.02] active:scale-[0.98]'}
                          `}
                        >
                          {booking.needsReview && (
                            <div className="absolute top-0 right-0 p-0.5 bg-yellow-400 text-yellow-900 rounded-bl shadow-sm z-20" title="Needs Review">
                              <ExclamationTriangleIcon className="w-3 h-3" />
                            </div>
                          )}

                          <div className="flex flex-col min-w-0 w-full mb-0.5">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className={`p-0.5 rounded-full bg-white/50 shrink-0`}>
                                  {booking.channel === 'airbnb' ? <span className="text-[10px] font-bold px-0.5">A</span> :
                                    booking.channel === 'vrbo' ? <span className="text-[10px] font-bold px-0.5">V</span> :
                                      <HomeIcon className="w-3 h-3" />}
                                </div>
                                <span className="font-bold truncate text-xs">
                                  {booking.guestFirstName && booking.guestLastInitial
                                    ? `${booking.guestFirstName} ${booking.guestLastInitial}.`
                                    : booking.guestName}
                                </span>
                              </div>
                              {booking.guestCount && booking.guestCount > 0 && (
                                <div className="flex items-center gap-0.5 bg-white/60 px-1 rounded-full shrink-0">
                                  <UsersIcon className="w-2.5 h-2.5 opacity-70" />
                                  <span className="text-[9px] font-bold">{booking.guestCount}</span>
                                </div>
                              )}
                            </div>
                            {!isDuplicate && (
                              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                {/* Platform Tag (Always Visible) */}
                                <span className={`text-[9px] px-1 py-0 rounded ${colors.badge} shrink-0`}>
                                  {badgeLabel}
                                </span>

                                {/* Account Name (Optional, distinct from platform) */}
                                {accountName && (
                                  <span className="text-[9px] text-gray-500 truncate font-medium max-w-[80px]" title={accountName}>
                                    {accountName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tooltip */}
                        <div className={`absolute left-1/2 -translate-x-1/2 hidden group-hover:block z-50 min-w-[200px] ${rowIdx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                          <div className="bg-gray-900 text-white text-xs rounded-lg py-3 px-3 shadow-xl text-center ring-1 ring-white/10">
                            <div className="flex items-center justify-center gap-2 mb-2 border-b border-white/20 pb-2">
                              <span className="font-bold text-sm block">{booking.guestName}</span>
                              {booking.needsReview && <span className="text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">REVIEW</span>}
                            </div>
                            <div className="space-y-1 text-left px-1">
                              <p className="opacity-80 flex justify-between"><span>Check-in:</span> <span className="font-mono">{booking.startDate}</span></p>
                              <p className="opacity-80 flex justify-between"><span>Check-out:</span> <span className="font-mono">{booking.endDate}</span></p>
                              <p className="opacity-80 flex justify-between"><span>Guests:</span> <span>{booking.guestCount || '-'}</span></p>
                              <div className="pt-1 mt-1 border-t border-white/10">
                                <p className="opacity-80 flex justify-between"><span>Platform:</span> <span className="font-bold">{badgeLabel}</span></p>
                                {accountName && (
                                  <p className="opacity-80 flex justify-between"><span>Account:</span> <span className="text-gray-300">{accountName}</span></p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={`w-2 h-2 bg-gray-900 transform rotate-45 mx-auto absolute left-0 right-0 ${rowIdx === 0 ? '-top-1' : '-bottom-1'}`}></div>
                        </div>
                      </div>
                    );
                  });
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Loading Indicator at End */}
        {loadingMore && (
          <div className="flex justify-center py-4 bg-gray-50 border-t border-gray-100">
            <span className="text-sm text-gray-500 animate-pulse">Loading future dates...</span>
          </div>
        )}
      </div>
    </div>
  );
}