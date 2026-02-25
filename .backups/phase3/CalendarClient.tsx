'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getPermissionsForRole, type FeaturePermissions } from '@/lib/roles/roleConfig';

import {
  HomeIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  XMarkIcon
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
  confirmationCode?: string;
  sourceFeedId?: string;
  externalUid?: string;
  createdAt?: string;
  // Manual resolution fields (human-in-the-loop)
  manualConnectionId?: string;
  manualGuestName?: string;
  manualGuestCount?: number;
  manualNotes?: string;
  manuallyResolvedAt?: string;
};

// Reservation facts from Gmail parsing - used for TRUE enrichment
type ReservationFact = {
  id: string;
  connectionId: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestCount?: number;
  confirmationCode?: string;
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



// --- Helpers ---
const toIso = (d: Date) => d.toISOString().split('T')[0];
const addDays = (d: Date, days: number) => {
  const newDate = new Date(d);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
};

const normalizeToLocalMidnight = (d: Date) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

const parseDateOnly = (dateStr: string) => {
  // Expect YYYY-MM-DD (handle legacy YYYY/MM/DD just in case)
  const normalized = dateStr.includes('/') ? dateStr.replace(/\//g, '-') : dateStr;
  return new Date(`${normalized}T00:00:00`);
};

const getDatesInWindow = (startDate: Date, days: number) => {
  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
};


const getGridPosition = (item: { startDate: string; endDate: string }, windowStart: Date, windowDays: number) => {
  const bStart = parseDateOnly(item.startDate);
  const bEnd = parseDateOnly(item.endDate);
  const wStart = normalizeToLocalMidnight(windowStart);

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




// Default color for unenriched bookings
const DEFAULT_BOOKING_COLOR = '#e5e7eb'; // gray-200

export default function CalendarClient({ apiBase }: { apiBase: string }) {
  const [permissions, setPermissions] = useState<FeaturePermissions | null>(null);

  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await fetch('/api/cohost/users/role');
        if (res.ok) {
          const data = await res.json();
          setPermissions(getPermissionsForRole(data.role));
        }
      } catch { }
    }
    fetchRole();
  }, []);
  const supabase = createClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Layout State
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  // Infinite Scroll & Navigation State
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [loadedDays, setLoadedDays] = useState(45); // Initial load window
  const [loadingMore, setLoadingMore] = useState(false);
  const [minDate, setMinDate] = useState<Date | null>(null); // Earliest allowed scroll
  const [visibleMonthDate, setVisibleMonthDate] = useState<Date | null>(null);

  // Hydrate dates on client-side only to prevent mismatch
  useEffect(() => {
    const now = normalizeToLocalMidnight(new Date());
    setRangeStart(now);
    setVisibleMonthDate(now);

    // Set Min Date relative to client-side "now"
    const min = new Date(now);
    min.setMonth(now.getMonth() - 12);
    min.setDate(1);
    setMinDate(min);
  }, []);

  // Data State
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [feedMap, setFeedMap] = useState<Record<string, string>>({});
  const [connectionIdMap, setConnectionIdMap] = useState<Record<string, string>>({}); // NormalizedName -> UUID
  const [reservationFacts, setReservationFacts] = useState<ReservationFact[]>([]); // Gmail-sourced enrichment
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);


  // Resolution modal state
  const [resolveBooking, setResolveBooking] = useState<Booking | null>(null);
  const [connections, setConnections] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [resolutionForm, setResolutionForm] = useState({
    connectionId: '',
    guestName: '',
    notes: '',
    guestCount: '1'
  });
  const [savingResolution, setSavingResolution] = useState(false);

  // --- Connection Color Map (from DB color_hex) ---
  const connectionColorMap = useMemo(() => {
    const map = new Map<string, string>();
    connections.forEach(c => {
      if (c.color) map.set(c.id, c.color);
    });
    return map;
  }, [connections]);

  const getConnectionColor = useCallback((connectionId: string): string | null => {
    return connectionColorMap.get(connectionId) || null;
  }, [connectionColorMap]);

  // Map connectionId → name (for showing enrichment source label)
  const connectionIdNameMap = useMemo(() => {
    const map = new Map<string, string>();
    connections.forEach(c => {
      if (c.name) map.set(c.id, c.name.trim());
    });
    return map;
  }, [connections]);

  // Fetch Feeds Helper
  const fetchFeeds = useCallback(async () => {
    try {
      const { data: feedsData } = await supabase
        .from('ical_feeds')
        .select('id, source_name'); // Added last_synced_at per requirement

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
  const fetchInitialData = useCallback(async (startPoint: Date) => {
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
        console.log(`[Calendar DEBUG] Loaded ${mappedProps.length} properties:`, mappedProps.map(p => ({ id: p.id, name: p.name })));
        setProperties(mappedProps);

        // 3. Fetch Earliest Date for Bound
        if (mappedProps.length > 0) {
          const propIds = mappedProps.map(p => p.id);
          const { data: minData, error: minError } = await supabase
            .from('bookings')
            .select('check_in')
            .in('property_id', propIds)
            .order('check_in', { ascending: true })
            .limit(1)
            .single();

          if (!minError && minData) {
            const earliest = new Date(minData.check_in);
            setMinDate(earliest);
          }

          // 4. Fetch Connections & Build Name -> ID Map (Universal)
          const { data: cxData } = await supabase.from('connections').select('id, name, platform, color');

          const idMap: Record<string, string> = {};
          if (cxData) {
            cxData.forEach(c => {
              if (c.name) {
                // Normalize name for matching (trim, lower)
                const key = c.name.trim().toLowerCase();
                idMap[key] = c.id;
              }
            });
            // Store connections for resolution modal dropdown
            setConnections(cxData.map(c => ({ id: c.id, name: c.name || '', color: c.color })));
          }
          setConnectionIdMap(idMap);

          // 5. Fetch Reservation Facts (Gmail enrichment data)
          const { data: factsData } = await supabase
            .from('reservation_facts')
            .select('id, connection_id, check_in, check_out, guest_name, guest_count, confirmation_code');

          if (factsData) {
            const mappedFacts: ReservationFact[] = factsData.map(f => ({
              id: f.id,
              connectionId: f.connection_id,
              checkIn: f.check_in,
              checkOut: f.check_out,
              guestName: f.guest_name || '',
              guestCount: f.guest_count,
              confirmationCode: f.confirmation_code
            }));
            setReservationFacts(mappedFacts);
            console.log(`[Calendar] Loaded ${mappedFacts.length} reservation facts for enrichment`);
          }
        }

        // 6. Fetch Initial Bookings
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
  }, [supabase, fetchFeeds, properties.length, setMinDate]); // properties.length dependency to avoid re-fetching props

  // Fetch Bookings for a specific range and MERGE into state
  const fetchBookingsRange = async (start: Date, end: Date) => {
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    console.log(`[Calendar DEBUG] Fetching bookings from ${startStr} to ${endStr}`);

    const res = await fetch(`${apiBase}/api/cohost/calendar?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`, {
      cache: 'no-store'
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Error fetching bookings:', err?.error || res.statusText);
      return;
    }

    const { bookings: bookingsData } = await res.json();

    console.log(`[Calendar DEBUG] Fetched ${bookingsData?.length || 0} bookings`);

    // Log unique property IDs and platforms for debugging
    const propertyIdSet = new Set((bookingsData || []).map(b => b.property_id));
    const platformSet = new Set((bookingsData || []).map(b => b.platform || 'null'));
    console.log(`[Calendar DEBUG] Unique property_ids:`, Array.from(propertyIdSet));
    console.log(`[Calendar DEBUG] Unique platforms:`, Array.from(platformSet));

    const mappedBookings: Booking[] = (bookingsData || []).map(b => ({
      id: b.id,
      propertyId: b.property_id,
      startDate: b.check_in.split('T')[0],
      endDate: b.check_out.split('T')[0],
      status: (b.status === 'confirmed' || b.status === 'pending') ? b.status : 'confirmed',
      totalPrice: b.total_amount || 0,
      channel: (['direct', 'airbnb', 'vrbo'].includes(b.source_type) ? b.source_type : 'other') as Channel,
      platform: b.platform || b.source_type,
      platformName: b.platform || b.source_type,
      guestName: b.guest_name || 'Guest',
      guestFirstName: b.guest_first_name,
      guestLastInitial: b.guest_last_initial,
      needsReview: b.needs_review || false,
      guestCount: b.guest_count || 0,
      sourceFeedId: b.source_feed_id,
      confirmationCode: b.confirmation_code,
      externalUid: b.external_uid,
      createdAt: b.created_at,
      // Manual resolution fields
      manualConnectionId: b.manual_connection_id,
      manualGuestName: b.manual_guest_name,
      manualGuestCount: b.manual_guest_count,
      manualNotes: b.manual_notes,
      manuallyResolvedAt: b.manually_resolved_at
    }));

    // Discover orphaned properties (bookings with property_id not in current properties list)
    setProperties(prevProperties => {
      const existingPropertyIds = new Set(prevProperties.map(p => p.id));
      const orphanedPropertyIds = new Set<string>();

      for (const booking of mappedBookings) {
        if (booking.propertyId && !existingPropertyIds.has(booking.propertyId)) {
          orphanedPropertyIds.add(booking.propertyId);
        }
      }

      if (orphanedPropertyIds.size === 0) return prevProperties;

      // Create placeholder properties for orphaned bookings
      const placeholderProperties: Property[] = Array.from(orphanedPropertyIds).map(id => ({
        id,
        name: `Unknown Property`, // Will be updated with real name if available
        image: undefined
      }));

      console.log(`[Calendar] Added ${placeholderProperties.length} placeholder properties for orphaned bookings`);
      return [...prevProperties, ...placeholderProperties];
    });

    setBookings(prev => {
      // Merge and Deduplicate by ID
      const existingIds = new Set(prev.map(b => b.id));
      const newBookings = mappedBookings.filter(b => !existingIds.has(b.id));
      return [...prev, ...newBookings];
    });
  };

  const loadMoreDays = useCallback(async () => {
    if (loadingMore || !rangeStart) return;

    const currentEnd = addDays(rangeStart, loadedDays);

    // Stop if we exceed MAX_DATE
    if (currentEnd > MAX_DATE) return;

    setLoadingMore(true);
    const nextEnd = addDays(currentEnd, 30); // Load next 30 days

    await fetchBookingsRange(currentEnd, nextEnd);
    setLoadedDays(prev => prev + 30);
    setLoadingMore(false);
  }, [loadingMore, rangeStart, loadedDays, fetchBookingsRange]);

  const prependDays = useCallback(async () => {
    // Bounded past scroll
    if (loadingMore || !rangeStart || !minDate || rangeStart <= minDate) return;

    setLoadingMore(true);
    const daysToAdd = 30;
    const newStart = addDays(rangeStart, -daysToAdd);

    // Ensure we don't go way past minDate unnecessarily (optional clamp could go here, but strict check is fine)

    // 1. Fetch new data
    await fetchBookingsRange(newStart, rangeStart);

    // 2. Adjust State
    setRangeStart(newStart);
    setLoadedDays(prev => prev + daysToAdd);

    // 3. Adjust Scroll Position to maintain visual stability
    if (scrollContainerRef.current) {
      const addedPixels = daysToAdd * CELL_WIDTH;
      scrollContainerRef.current.scrollLeft += addedPixels;
    }

    setLoadingMore(false);
  }, [loadingMore, rangeStart, minDate, fetchBookingsRange]);

  // Scroll Handler for Lazy Loading & Dynamic Label
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;

    // 1. Infinite Scroll Right (Append)
    if (scrollLeft + clientWidth > scrollWidth - 600) {
      loadMoreDays();
    }

    // 2. Infinite Scroll Left (Prepend)
    if (scrollLeft < 500 && rangeStart && minDate && rangeStart > minDate) {
      prependDays();
    }

    // 3. Dynamic Month Label (Throttled/Debounced roughly by render freq)
    if (rangeStart) {
      const visibleIndex = Math.floor(scrollLeft / CELL_WIDTH);
      // Add ~1-2 days buffer for center-ish alignment
      const visibleDate = addDays(rangeStart, visibleIndex + 1);

      // Only update if month changes to avoid thrashing
      setVisibleMonthDate(prev => {
        if (prev && (prev.getMonth() !== visibleDate.getMonth() || prev.getFullYear() !== visibleDate.getFullYear())) {
          return visibleDate;
        }
        return prev;
      });
    }

  }, [rangeStart, minDate, loadMoreDays, prependDays]); // Dependencies for scroll handler

  // Trigger initial fetch when rangeStart is ready
  useEffect(() => {
    if (rangeStart) {
      fetchInitialData(rangeStart);
    }
  }, [rangeStart, fetchInitialData]);

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
    if (rangeStart) {
      await fetchInitialData(rangeStart);
    }
    setSyncing(false);
  };

  // Jump / Navigation Handler
  const jumpToDate = (targetDate: Date) => {
    // Clamp date
    let d = normalizeToLocalMidnight(new Date(targetDate));
    if (minDate && d < minDate) d = new Date(minDate);
    // Don't strictly clamp MAX for jump start, but ensure we don't render forever

    // Reset state for new jump
    setRangeStart(d);
    setVisibleMonthDate(d);
    setLoadedDays(45);
    setBookings([]); // Clear old bookings to avoid memory bloat if jumping far

    // Reset Scroll
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }

    // Fetching happens via the useEffect that watches rangeStart
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const monthsToAdd = parseInt(e.target.value);
    if (!rangeStart) return;

    const newDate = new Date(); // Relative to 'now'
    newDate.setDate(1); // Normalize to 1st
    newDate.setMonth(new Date().getMonth() + monthsToAdd);
    jumpToDate(newDate);
  };

  // Calculate current month offset based on visibleMonthDate
  const currentMonthOffset = useMemo(() => {
    if (!visibleMonthDate) return 0;
    const now = new Date();
    const diffMonth = (visibleMonthDate.getFullYear() - now.getFullYear()) * 12 + (visibleMonthDate.getMonth() - now.getMonth());
    return diffMonth;
  }, [visibleMonthDate]);

  // Computed Dates for Window
  const dates = useMemo(() => {
    return rangeStart ? getDatesInWindow(rangeStart, loadedDays) : [];
  }, [rangeStart, loadedDays]);

  // Generate Month Options (-12 to +24)
  const monthOptions = Array.from({ length: 37 }, (_, i) => {
    const offset = i - 12; // -12 to +24
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return {
      value: offset,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' })
    };
  });

  // Calculate current selected month offset for dropdown
  // Heuristic: compare visibleMonthDate month/year to today


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
            {permissions?.canViewCalendarSync && (
              <>

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
              </>
            )}
          </div>



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
                <div className="text-xs font-medium uppercase">{new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date)}</div>
                <div className={`text-sm font-bold mt-0.5 ${isToday ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center' : ''}`}>
                  {new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(date)}
                </div>
              </div>
            );
          })}

          {/* Property Rows */}
          {!loading && properties.map((property, rowIdx) => {
            const gridRow = rowIdx + 2;
            const allPropertyBookings = bookings.filter(b => b.propertyId === property.id);

            // Direct render: one block per booking row, no grouping
            const propertyBookings = allPropertyBookings;

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

                {/* Dedup: same property + same dates → keep one, prefer enriched */}
                {(() => {
                  const dedupMap = new Map<string, Booking>();
                  for (const b of propertyBookings) {
                    const key = `${b.propertyId}|${b.startDate}|${b.endDate}`;
                    const existing = dedupMap.get(key);
                    if (!existing) {
                      dedupMap.set(key, b);
                    } else {
                      // Prefer the one with a real guest name (not generic)
                      const isGeneric = (name: string) => !name || ['guest', 'reserved', 'not available', 'blocked', 'unavailable'].includes(name.toLowerCase());
                      if (isGeneric(existing.guestName) && !isGeneric(b.guestName)) {
                        dedupMap.set(key, b);
                      }
                    }
                  }
                  return Array.from(dedupMap.values());
                })().map((booking, _idx, dedupedBookings) => {
                  if (!rangeStart) return null;
                  let { start, span, isVisible } = getGridPosition(booking, rangeStart, loadedDays);
                  if (!isVisible) return null;

                  // === DISPLAY LOGIC (Human-in-the-Loop) ===
                  // Priority: Manual Override > Reservation Facts Match > Needs Attention (Gray)

                  const isManuallyResolved = !!booking.manuallyResolvedAt;

                  // TRUE ENRICHMENT: Match booking to reservation_facts
                  // Priority: confirmation_code match (strongest) > date overlap match
                  let matchedFact: ReservationFact | null = null;

                  if (!isManuallyResolved) {
                    // Try confirmation code match first (strongest)
                    if (booking.confirmationCode) {
                      matchedFact = reservationFacts.find(f =>
                        f.confirmationCode === booking.confirmationCode
                      ) || null;
                    }

                    // Fallback: date overlap match (within 1 day tolerance)
                    if (!matchedFact) {
                      const bookingStart = new Date(booking.startDate);
                      const bookingEnd = new Date(booking.endDate);

                      // Find ALL date-matching facts
                      const dateMatches = reservationFacts.filter(f => {
                        const factStart = new Date(f.checkIn);
                        const factEnd = new Date(f.checkOut);
                        const startDiff = Math.abs(bookingStart.getTime() - factStart.getTime()) / (1000 * 60 * 60 * 24);
                        const endDiff = Math.abs(bookingEnd.getTime() - factEnd.getTime()) / (1000 * 60 * 60 * 24);
                        return startDiff <= 1 && endDiff <= 1;
                      });

                      // Prefer fact whose connection has a color set
                      matchedFact = dateMatches.find(f => connectionColorMap.has(f.connectionId))
                        || dateMatches[0]
                        || null;
                    }
                  }

                  const hasEnrichment = !!matchedFact;

                  // GRACE WINDOW: New bookings (< 5 hours old) do NOT show warning
                  // This allows time for async email ingestion to catch up
                  const GRACE_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours
                  const bookingAgeFn = (b: Booking) => {
                    if (!b.createdAt) return 9999999999; // Assume old if missing
                    return new Date().getTime() - new Date(b.createdAt).getTime();
                  };

                  const isWithinGraceWindow = bookingAgeFn(booking) < GRACE_WINDOW_MS;

                  // needsAttention badge disabled for now
                  const needsAttention = false;

                  let finalStyle: React.CSSProperties = {};
                  let finalClasses = '';
                  let resolvedConnectionColor: string | null = null;
                  let labelText = ''; // Only set when enriched
                  const isEnriched = isManuallyResolved || !!matchedFact;

                  // Clip unenriched blocks: end before the next booking on this property
                  if (!isEnriched && rangeStart) {
                    const bookingEnd = new Date(booking.endDate);
                    for (const other of dedupedBookings) {
                      if (other.id === booking.id) continue;
                      const otherStart = new Date(other.startDate);
                      if (otherStart > new Date(booking.startDate) && otherStart < bookingEnd) {
                        // Clip span to end before the other booking's check-in cell
                        const otherPos = getGridPosition(other, rangeStart, loadedDays);
                        if (otherPos.isVisible) {
                          const clippedSpan = otherPos.start - start;
                          if (clippedSpan > 0 && clippedSpan < span) {
                            span = clippedSpan;
                          }
                        }
                      }
                    }
                  }

                  // === DISPLAY RULES ===
                  // Unenriched: "Reservation", iCal guest count, grey, no label
                  // Enriched:   fact guest name, fact guest count, connection color+name
                  let displayGuestName = 'Reservation';
                  let displayGuestCount = booking.guestCount; // iCal fallback

                  if (isManuallyResolved) {
                    displayGuestName = booking.manualGuestName || booking.guestName || 'Reservation';
                    displayGuestCount = booking.manualGuestCount ?? displayGuestCount;
                    if (booking.manualConnectionId) {
                      resolvedConnectionColor = getConnectionColor(booking.manualConnectionId);
                      labelText = connectionIdNameMap.get(booking.manualConnectionId) || '';
                    }
                  } else if (matchedFact) {
                    displayGuestName = matchedFact.guestName || booking.guestName || 'Reservation';
                    displayGuestCount = matchedFact.guestCount ?? displayGuestCount;
                    resolvedConnectionColor = getConnectionColor(matchedFact.connectionId);
                    labelText = connectionIdNameMap.get(matchedFact.connectionId) || '';
                  }

                  if (isEnriched && resolvedConnectionColor) {
                    // Enriched: translucent connection color fill, slightly darker solid border
                    finalStyle = {
                      backgroundColor: `${resolvedConnectionColor}cc`,
                      borderColor: resolvedConnectionColor,
                      borderWidth: '2px',
                    };
                    finalClasses = 'text-xs font-medium border text-gray-900 shadow-sm';
                  } else {
                    // Unenriched → neutral light grey, thin border
                    finalStyle = {
                      backgroundColor: '#f3f4f6',
                      borderColor: '#d1d5db',
                      borderWidth: '1px',
                    };
                    finalClasses = 'text-xs font-medium border text-gray-500';
                  }

                  const accountName = booking.sourceFeedId ? feedMap[booking.sourceFeedId] : null;
                  const badgeLabel = getPlatformBadgeLabel(booking.platform);

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
                      className={`relative group ${isPast ? 'z-0' : 'z-10'} ${isActive ? 'z-30' : ''}`}
                      style={{
                        gridRow: gridRow,
                        gridColumn: `${start + 2} / span ${span + 1}`,
                        height: ROW_HEIGHT,
                      }}
                    >
                      {/* Cleaning icon: only after a real guest checkout */}
                      {(() => {
                        const thisStart = new Date(booking.startDate);
                        const genericNames = ['guest', 'reserved', 'not available', 'blocked', 'unavailable', 'airbnb (not available)'];
                        const hasPriorCheckout = dedupedBookings.some(other => {
                          if (other.id === booking.id) return false;
                          // Prior booking must have a real guest name
                          const otherName = (other.guestName || '').trim().toLowerCase();
                          if (!otherName || genericNames.some(g => otherName.includes(g))) return false;
                          const otherEnd = new Date(other.endDate);
                          const gap = (thisStart.getTime() - otherEnd.getTime()) / (1000 * 60 * 60 * 24);
                          return gap >= 0 && gap <= 1;
                        });
                        return hasPriorCheckout;
                      })() && (
                          <div
                            className="absolute flex items-center justify-center"
                            style={{
                              left: CELL_WIDTH * 0.1,
                              width: CELL_WIDTH * 0.4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                            }}
                            title="Cleaning / Turnover"
                          >
                            <span style={{ fontSize: '44px', lineHeight: 1 }}>🧹</span>
                          </div>
                        )}

                      {/* Booking bar: starts halfway into check-in cell, extends ~10% into checkout cell */}
                      <div
                        className="absolute"
                        style={{
                          left: CELL_WIDTH / 2,
                          right: CELL_WIDTH * 0.9,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <div
                          className={`
                          rounded-lg flex items-center px-1.5 overflow-hidden cursor-pointer transition-all h-12
                          ${finalClasses}
                          ${isPast ? 'opacity-60 grayscale filter brightness-95 border-opacity-20' : 'shadow-sm'}
                          ${isActive ? 'ring-2 ring-blue-500 ring-offset-1 shadow-lg scale-[1.02]' : 'hover:scale-[1.02] active:scale-[0.98]'}
                        `}
                          style={finalStyle}
                        >
                          {/* Needs Attention Indicator (Unenriched + Not Resolved) */}
                          {needsAttention && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setResolveBooking(booking);
                              }}
                              className="absolute top-0 left-0 p-0.5 bg-orange-500 text-white rounded-br shadow-sm z-20 hover:bg-orange-600"
                              title="Click to resolve - assign label & guest info"
                            >
                              <ExclamationTriangleIcon className="w-3 h-3" />
                            </button>
                          )}

                          {/* Review Flag (separate from resolution) */}
                          {booking.needsReview && !needsAttention && (
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
                                  {displayGuestName}
                                </span>
                              </div>
                              {displayGuestCount && displayGuestCount > 0 && (
                                <div className="flex items-center gap-0.5 bg-white/60 px-1 rounded-full shrink-0">
                                  <UsersIcon className="w-2.5 h-2.5 opacity-70" />
                                  <span className="text-[9px] font-bold">{displayGuestCount}</span>
                                </div>
                              )}

                            </div>
                            {labelText && (
                              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                <span className="text-[10px] font-medium bg-white/60 text-gray-800 px-1.5 py-0.5 rounded-full truncate shrink-0 max-w-full" title={labelText}>
                                  {labelText}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tooltip — enriched bookings only */}
                        {isEnriched && (
                          <div className={`absolute left-1/2 -translate-x-1/2 hidden group-hover:block z-50 min-w-[180px] ${rowIdx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                            <div className="bg-gray-900 text-white text-xs rounded-lg py-3 px-3 shadow-xl ring-1 ring-white/10">
                              <p className="font-bold text-sm mb-1.5">{displayGuestName}</p>
                              <div className="space-y-1 text-left">
                                <p className="opacity-80 flex justify-between"><span>Guests:</span> <span>{displayGuestCount || '-'}</span></p>
                                <p className="opacity-80 flex justify-between"><span>Check-in:</span> <span className="font-mono">{new Date(booking.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(/, /, '-').replace(' ', '-')}</span></p>
                                <p className="opacity-80 flex justify-between"><span>Check-out:</span> <span className="font-mono">{new Date(booking.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(/, /, '-').replace(' ', '-')}</span></p>
                                {labelText && (
                                  <p className="opacity-80 flex justify-between pt-1 mt-1 border-t border-white/10"><span>Source:</span> <span className="font-bold">{labelText}</span></p>
                                )}
                              </div>
                            </div>
                            <div className={`w-2 h-2 bg-gray-900 transform rotate-45 mx-auto absolute left-0 right-0 ${rowIdx === 0 ? '-top-1' : '-bottom-1'}`}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Loading Indicator at End */}
        {
          loadingMore && (
            <div className="flex justify-center py-4 bg-gray-50 border-t border-gray-100">
              <span className="text-sm text-gray-500 animate-pulse">Loading future dates...</span>
            </div>
          )
        }
      </div>

      {/* Resolution Modal */}
      {resolveBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setResolveBooking(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Resolve Booking</h2>
              <button onClick={() => setResolveBooking(null)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Booking Info (Read-Only) */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Check-in:</span>
                <span className="font-mono font-medium">{resolveBooking.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Check-out:</span>
                <span className="font-mono font-medium">{resolveBooking.endDate}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 italic">Dates are from iCal and cannot be edited</p>
            </div>

            {/* Connection/Label Dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Connection / Label</label>
              <select
                value={resolutionForm.connectionId}
                onChange={e => setResolutionForm(prev => ({ ...prev, connectionId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a connection...</option>
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Guest Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
              <input
                type="text"
                value={resolutionForm.guestName}
                onChange={e => setResolutionForm(prev => ({ ...prev, guestName: e.target.value }))}
                placeholder="e.g. John D."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Guest Count */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Count</label>
              <input
                type="number"
                min="1"
                value={resolutionForm.guestCount}
                onChange={e => setResolutionForm(prev => ({ ...prev, guestCount: e.target.value }))}
                placeholder="e.g. 4"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <textarea
                value={resolutionForm.notes}
                onChange={e => setResolutionForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes..."
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setResolveBooking(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSavingResolution(true);
                  try {
                    const { error } = await supabase
                      .from('bookings')
                      .update({
                        manual_connection_id: resolutionForm.connectionId || null,
                        manual_guest_name: resolutionForm.guestName || null,
                        manual_guest_count: resolutionForm.guestCount ? parseInt(resolutionForm.guestCount) : null,
                        manual_notes: resolutionForm.notes || null,
                        manually_resolved_at: new Date().toISOString()
                      })
                      .eq('id', resolveBooking.id);

                    if (error) throw error;

                    // Update local state
                    setBookings(prev => prev.map(b =>
                      b.id === resolveBooking.id
                        ? {
                          ...b,
                          manualConnectionId: resolutionForm.connectionId || undefined,
                          manualGuestName: resolutionForm.guestName || undefined,
                          manualGuestCount: resolutionForm.guestCount ? parseInt(resolutionForm.guestCount) : undefined,
                          manualNotes: resolutionForm.notes || undefined,
                          manuallyResolvedAt: new Date().toISOString()
                        }
                        : b
                    ));

                    setResolveBooking(null);
                    setResolutionForm({ connectionId: '', guestName: '', guestCount: '', notes: '' });
                  } catch (err) {
                    console.error('Failed to save resolution:', err);
                    alert('Failed to save resolution');
                  } finally {
                    setSavingResolution(false);
                  }
                }}
                disabled={savingResolution}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingResolution ? 'Saving...' : 'Save Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
