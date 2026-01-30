# System Snapshot: Calendar & Sync Engine
**Date:** January 28, 2026
**Version:** 1.0.0
**Status:** Stable (Production Ready)

## 1. Overview
The Calendar system serves as the central "Booking Timeline" for the CoHost platform. It aggregates booking data from multiple sources (Direct, Airbnb, VRBO, etc.) via iCal feeds and displays them on a unified multi-property grid. It includes a robust sync engine (`ICalProcessor`) that handles ingestion, parsing, and enrichment of booking data using email intelligence.

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **Calendar Grid** | `app/cohost/calendar/page.tsx` | Main visual interface. Features infinite scroll (-12m to +24m), row-per-property, conflict/duplicate visualization, and "jump to date" navigation. |
| **Sync Settings** | `app/cohost/settings/(workspace)/calendar/page.tsx` | Dashboard for managing iCal feeds. Provides per-feed status, diagnostics (HTTP code, snippets), and manual sync controls. |
| **Feed Modal** | `FeedBookingsModal` (in settings) | Diagnostic view to inspect raw bookings currently imported from a specific feed. |

### Backend Services
| Service | Path | Description |
|---------|------|-------------|
| **ICalProcessor** | `lib/services/ical-processor.ts` | Core engine. Fetches `.ics` files, parses VEVENTs, matches with `reservation_facts` (email data), and performs upsert on `bookings` table. |
| **Sync API** | `app/api/cohost/ical/sync/route.ts` | Endpoint to trigger individual or property-wide syncs. |
| **Refresh API** | `app/api/cohost/refresh/route.ts` | Global workspace-wide sync trigger. |

### Database Schema
| Table | Key Columns | Role |
|-------|-------------|------|
| `bookings` | `id`, `property_id`, `source_feed_id`, `check_in`, `check_out`, `status`, `external_uid` | The normalized schedule. Source of Truth for availability. |
| `ical_feeds` | `id`, `property_id`, `ical_url`, `last_synced_at`, `last_sync_status`, `is_active` | Configuration for inbound sync sources. |
| `reservation_facts` | `confirmation_code`, `guest_name`, `check_in`, `connection_id` | Extracted email data used to "enrich" iCal bookings with real guest names. |

## 3. Data Flow & Logic

### Ingestion Flow
1. **Trigger:** Manual click or Scheduled Cron.
2. **Fetch:** `ICalProcessor` downloads `.ics` content.
3. **Parse:** `node-ical` converts text to VEVENT objects.
4. **Enrichment:**
   - System searches `reservation_facts` for matching dates + property.
   - If match found (Code OR Exact Date), `guest_name` is promoted from "Reserved" (iCal default) to real name (e.g. "John Doe").
5. **Upsert:** 
   - Uses composite key `(property_id, source_type, external_uid)` to prevent duplicates.
   - Updates status, dates, and metadata.
6. **Cleanup:** Update `ical_feeds` status with success/error metrics.

### Deduplication (Visual)
The UI (`CalendarPage`) implements client-side deduplication:
- If multiple bookings overlap on the same property (e.g., Airbnb block vs VRBO booking), strict priority determines visibility.
- **Priority:** Direct > Airbnb > VRBO > Other.
- Lower priority duplicates are visually nested/hidden unless "Show duplicates" is toggled.

## 4. Key Configurations
- **Window:** -12 Months to +24 Months.
- **Scroll:** Infinite horizontal scroll with lazy loading (batch size: 30-45 days).
- **Enrichment:** Requires `reservation_facts` to be populated (via Gmail integration) to show names instead of "Blocked".

## 5. Known Constraints
- **One-Way Sync (Inbound):** We strictly *read* from external iCals. We do not *push* events back to them (except via our own export URL).
- **Latency:** Sync is not real-time. Depends on when the user clicks "Sync Now" or the background cron runs.
- **Property Mapping:** Feeds are strictly mapped to `property_id`. Moving a feed requires deleting and re-adding.
