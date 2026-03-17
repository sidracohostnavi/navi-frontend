# ARCHITECTURE.md — Navi CoHost System Architecture
**Version:** 1.0  
**Last Updated:** 2026-03-06  
**Purpose:** Complete technical reference for onboarding new sessions and developers

---

## Quick Start — Read This First

Navi CoHost is a booking calendar and guest communication system for short-term rental hosts. It ingests bookings from iCal feeds and enriches them with guest names from Gmail confirmation emails.

**The Core Loop:**
```
iCal Feeds → Bookings (dates only) → Gmail Emails → Guest Names → Enriched Calendar
```

**Key Files (90% of debugging happens here):**
- `lib/services/ical-processor.ts` — iCal sync
- `lib/services/email-processor.ts` — Gmail enrichment
- `app/api/cron/enrichment/route.ts` — Enrichment cron
- `app/api/cron/refresh/route.ts` — iCal refresh cron
- `app/calendar/CalendarClient.tsx` — Calendar UI

**Key Tables:**
- `bookings` — All calendar events
- `reservation_facts` — Parsed email data
- `gmail_messages` — Raw emails
- `connections` — Gmail OAuth connections
- `ical_feeds` — iCal feed URLs

**Before making ANY changes, read:** `DECLARATION.md`

---

## System Overview

### What It Does

| Feature | Description |
|---------|-------------|
| **Booking Calendar** | Visual timeline of all bookings across properties |
| **iCal Sync** | Pulls bookings from Airbnb, VRBO, Lodgify via iCal feeds |
| **Gmail Enrichment** | Extracts guest names from confirmation emails |
| **Multi-Property** | Supports multiple properties per workspace |
| **Team Roles** | Owner, admin, operator, cleaner roles with permissions |
| **Guest Messaging** | Draft and send messages to guests (human-in-the-loop) |

### Why It Exists

Hosts using platform APIs (Airbnb API, etc.) get classified as "PMS users" and charged 16-18% fees instead of 3%. Navi CoHost uses iCal + Gmail to avoid this — an intentional architectural choice.

---

## Current Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │  cron-job.org │────▶│    Vercel    │────▶│   Supabase   │   │
│   │  (triggers)   │     │  (Next.js)   │     │  (Postgres)  │   │
│   └──────────────┘     └──────────────┘     └──────────────┘   │
│                               │                                  │
│                               ▼                                  │
│                        ┌──────────────┐                         │
│                        │  Gmail API   │                         │
│                        │  (OAuth 2.0) │                         │
│                        └──────────────┘                         │
│                                                                  │
│   Domain: cohostnavi.com (frontend)                             │
│   Note: Currently hosted inside naviverse.ai codebase           │
│   Future: Will be separated to standalone repo                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### External Services

| Service | Purpose | Config |
|---------|---------|--------|
| **Vercel** | Hosting, serverless functions | Auto-deploy from GitHub |
| **Supabase** | PostgreSQL database, auth, RLS | Shared with naviverse (for now) |
| **Gmail API** | OAuth email access | Google Cloud Console |
| **cron-job.org** | Scheduled triggers | 30s timeout, 2-min intervals |
| **Stripe** | Payments (future) | Not active for CoHost |

### Cron Jobs (cron-job.org)

| Job | URL | Schedule | Timeout |
|-----|-----|----------|---------|
| iCal Refresh | `/api/cron/refresh` | Every 2 min | 30s (often times out) |
| Enrichment | `/api/cron/enrichment` | Every 2 min | 30s |

---

## Codebase Structure

### Note on Current State

CoHost currently lives INSIDE the naviverse.ai monorepo alongside other apps (orakl, momassist, pulse, etc.). Only CoHost-relevant paths are documented here.

**Future Goal:** Separate CoHost to its own repo at cohostnavi.com.

### Directory Map

```
navi-frontend/
├── app/
│   ├── cohost/                    # ← COHOST PAGES
│   │   ├── calendar/              # Main calendar view
│   │   │   ├── page.tsx
│   │   │   └── CalendarClient.tsx # Complex calendar component
│   │   ├── messaging/             # Guest messaging UI
│   │   ├── properties/            # Property management
│   │   ├── review/                # Review inbox (ambiguous bookings)
│   │   ├── settings/              # User/workspace settings
│   │   └── team/                  # Team member management
│   │
│   ├── api/
│   │   ├── cohost/                # ← COHOST API ROUTES
│   │   │   ├── calendar/route.ts  # Calendar data endpoint
│   │   │   ├── connections/       # Gmail connection management
│   │   │   ├── ical/              # iCal feed management
│   │   │   ├── properties/        # Property CRUD
│   │   │   ├── refresh/route.ts   # Manual sync trigger
│   │   │   ├── review/            # Review inbox API
│   │   │   └── users/             # Team management
│   │   │
│   │   ├── cron/                  # ← CRON ENDPOINTS
│   │   │   ├── enrichment/route.ts # Gmail enrichment cron
│   │   │   └── refresh/route.ts    # iCal sync cron
│   │   │
│   │   └── auth/                  # Shared auth (login, signup)
│   │       └── gmail/             # Gmail OAuth flow
│   │
│   └── [other naviverse apps - not CoHost]
│
├── lib/
│   ├── services/                  # ← CORE COHOST LOGIC
│   │   ├── ical-processor.ts      # iCal parsing and sync
│   │   ├── email-processor.ts     # Gmail parsing and enrichment
│   │   ├── email-classifier.ts    # Email type detection (regex)
│   │   └── gmail-service.ts       # Gmail API client wrapper
│   │
│   ├── supabase/                  # ← DATABASE CLIENTS (shared)
│   │   ├── client.ts              # Browser client
│   │   ├── server.ts              # Server client (RLS)
│   │   ├── cohostServer.ts        # Service role client (bypasses RLS)
│   │   └── cohostTypes.ts         # TypeScript types
│   │
│   ├── roles/                     # ← COHOST PERMISSIONS
│   │   └── roleConfig.ts          # Role definitions
│   │
│   ├── connectors/                # DORMANT - do not use
│   │   ├── guesty/
│   │   ├── hospitable/
│   │   └── hostaway/
│   │
│   └── utils/
│       ├── google.ts              # Google OAuth client
│       └── db-lock.ts             # Cron lock mechanism
│
└── docs/                          # Contracts per module
    ├── calendar/
    ├── connections/
    └── cohost/
```

### Files You'll Touch Most Often

| File | Purpose | Danger Level |
|------|---------|--------------|
| `lib/services/ical-processor.ts` | iCal sync logic | 🔴 HIGH — breaks calendar |
| `lib/services/email-processor.ts` | Enrichment logic | 🔴 HIGH — breaks names |
| `app/api/cron/enrichment/route.ts` | Enrichment cron | 🟡 MEDIUM |
| `app/api/cron/refresh/route.ts` | iCal cron | 🟡 MEDIUM |
| `app/calendar/CalendarClient.tsx` | Calendar UI | 🟢 LOW — just display |
| `app/api/cohost/calendar/route.ts` | Calendar API | 🟡 MEDIUM |

---

## Database Schema

### Core Tables

#### `bookings`
The main calendar table. Every booking/block from iCal lands here.

| Column | Type | Written By | Notes |
|--------|------|------------|-------|
| `id` | UUID | System | Primary key |
| `workspace_id` | UUID | iCal | Workspace scope |
| `property_id` | UUID | iCal | Which property |
| `guest_name` | TEXT | iCal | Raw iCal summary ("Reserved", etc.) |
| `check_in` | TIMESTAMPTZ | iCal | Stored as noon UTC |
| `check_out` | TIMESTAMPTZ | iCal | Stored as noon UTC |
| `external_uid` | TEXT | iCal | iCal event UID |
| `raw_data` | JSONB | iCal | Full iCal event (contains confirmation code) |
| `source_feed_id` | UUID | iCal | Which feed created this |
| `is_active` | BOOLEAN | iCal | Soft delete flag |
| `enriched_guest_name` | TEXT | Enrichment | Real guest name |
| `enriched_guest_count` | INTEGER | Enrichment | Guest count from email |
| `enriched_connection_id` | UUID | Enrichment | Which Gmail connection matched |
| `enriched_at` | TIMESTAMPTZ | Enrichment | When enriched |
| `manual_guest_name` | TEXT | Manual | Human override |
| `manual_connection_id` | UUID | Manual | Human-assigned connection |
| `manually_resolved_at` | TIMESTAMPTZ | Manual | When manually resolved |

**Key constraint:** `(property_id, check_in, check_out)` is unique.

#### `reservation_facts`
Parsed data from Gmail confirmation emails.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `connection_id` | UUID | Which Gmail connection |
| `confirmation_code` | TEXT | e.g., "HMXXXXXX" — used for matching |
| `guest_name` | TEXT | Parsed name |
| `guest_count` | INTEGER | Parsed count |
| `check_in` | DATE | Reference only (not used for matching) |
| `check_out` | DATE | Reference only |
| `source_gmail_message_id` | TEXT | Link to raw email |

#### `gmail_messages`
Raw emails fetched from Gmail.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `gmail_message_id` | TEXT | Gmail's message ID |
| `connection_id` | UUID | Which connection |
| `subject` | TEXT | Email subject |
| `raw_metadata` | JSONB | Full email body |
| `processed_at` | TIMESTAMPTZ | When parsed into fact |

#### `connections`
Gmail OAuth connections.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `name` | TEXT | "Spark & Stay", "Sidra A/C", etc. |
| `gmail_refresh_token` | TEXT | OAuth refresh token |
| `gmail_access_token` | TEXT | OAuth access token |
| `gmail_status` | TEXT | 'connected' / 'error' / 'needs_reconnect' |
| `reservation_label` | TEXT | Gmail label to read from |
| `color` | TEXT | Hex color for UI |

#### `ical_feeds`
iCal feed URLs per property.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `property_id` | UUID | Which property |
| `ical_url` | TEXT | Full iCal URL |
| `source_name` | TEXT | "Airbnb", "Lodgify", etc. |
| `source_type` | TEXT | Platform type |
| `is_active` | BOOLEAN | Enabled/disabled |
| `last_synced_at` | TIMESTAMPTZ | Last successful sync |

#### `cohost_properties`
Property definitions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Workspace scope |
| `name` | TEXT | "Aloha Magic Cottage", etc. |
| `image_url` | TEXT | Property photo |

#### `connection_properties`
Many-to-many: which connections serve which properties.

| Column | Type | Notes |
|--------|------|-------|
| `connection_id` | UUID | FK to connections |
| `property_id` | UUID | FK to properties |

### Relationships

```
cohost_workspaces
    │
    ├── cohost_properties
    │       │
    │       ├── ical_feeds
    │       │
    │       └── bookings
    │
    ├── connections
    │       │
    │       ├── connection_properties ──┐
    │       │                           │
    │       ├── gmail_messages          │
    │       │                           │
    │       └── reservation_facts       │
    │                                   │
    └── cohost_workspace_members        │
                                        │
                              (links to properties)
```

---

## Data Flows

### Flow 1: iCal Sync

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Airbnb   │     │   Vercel   │     │  Supabase  │     │  Calendar  │
│ iCal Feed  │────▶│ ical-proc  │────▶│  bookings  │────▶│     UI     │
└────────────┘     └────────────┘     └────────────┘     └────────────┘

Trigger: cron-job.org → /api/cron/refresh (every 2 min)
         OR manual → /api/cohost/refresh

Writes: guest_name, check_in, check_out, external_uid, raw_data
Never touches: enriched_* columns
```

### Flow 2: Gmail Enrichment

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Gmail    │     │   Vercel   │     │  Supabase  │     │  Supabase  │
│   Label    │────▶│ email-proc │────▶│   facts    │────▶│  bookings  │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
                         │                                      │
                         │         Match by confirmation code    │
                         └──────────────────────────────────────┘

Trigger: cron-job.org → /api/cron/enrichment (every 2 min)

Step 1: Fetch emails from Gmail label
Step 2: Parse confirmation emails → create reservation_facts
Step 3: Match fact.confirmation_code to booking.raw_data.description
Step 4: Write enriched_guest_name, enriched_guest_count, enriched_connection_id
```

### Flow 3: Calendar Display

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Browser   │────▶│ /api/cohost│────▶│  Supabase  │
│            │◀────│  /calendar │◀────│  bookings  │
└────────────┘     └────────────┘     └────────────┘

Display Priority:
1. manual_guest_name (if manually_resolved_at set)
2. enriched_guest_name (if enriched_at set)
3. guest_name (raw iCal summary)
```

---

## The Enrichment System (Critical)

### The Structural Separation Principle

**iCal and enrichment data live in SEPARATE columns and can NEVER overwrite each other.**

| Data | Columns | Written By |
|------|---------|------------|
| iCal data | `guest_name`, `check_in`, `check_out`, `raw_data` | ical-processor.ts ONLY |
| Enrichment | `enriched_guest_name`, `enriched_guest_count`, `enriched_connection_id` | email-processor.ts ONLY |

**Why:** Previous systems used "name guards" (logic to prevent overwriting). These broke repeatedly. Structural separation makes conflicts impossible.

### Matching Logic

Enrichment matches by **confirmation code ONLY**:

```
Fact: { confirmation_code: "HMXXXXXX", guest_name: "John Smith" }
                    ↓
                matches
                    ↓
Booking: { raw_data: { description: "...airbnb.com/details/HMXXXXXX..." } }
```

**No date matching.** This eliminates:
- Ambiguity between properties with same dates
- Cleaning blocks (they have no confirmation codes)
- Complex guard logic

### What Gets Enriched vs What Doesn't

| guest_name | Has code in raw_data? | Gets enriched? |
|------------|----------------------|----------------|
| Reserved | Yes | ✅ Yes |
| Blocked | No | ❌ No |
| Airbnb (Not available) | No | ❌ No (cleaning block) |
| Not Available | No | ❌ No (owner block) |
| John Smith (from Lodgify) | Yes | Already has name |

---

## Environment Variables

### Required for CoHost

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key (bypasses RLS) |
| `GOOGLE_CLIENT_ID` | Gmail OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth client secret |
| `CRON_SECRET` | Secret for cron authentication |

### Set in Vercel

All variables must be set in Vercel → Project → Settings → Environment Variables.
Make sure they're enabled for both **Production** and **Preview** environments.

---

## Common Issues & Debugging

### "Bookings not enriching"

1. **Check if facts exist:**
```sql
SELECT confirmation_code, guest_name FROM reservation_facts 
WHERE confirmation_code IN ('HMXXXXXX') ORDER BY created_at DESC;
```

2. **Check if emails were fetched:**
```sql
SELECT subject, created_at FROM gmail_messages 
ORDER BY created_at DESC LIMIT 10;
```

3. **Check Gmail connection health:**
```sql
SELECT name, gmail_status, gmail_last_error_message 
FROM connections WHERE gmail_refresh_token IS NOT NULL;
```

4. **Check Vercel logs** for `/api/cron/enrichment`

### "iCal sync timing out"

The cron-job.org timeout is 30 seconds. If you have many feeds, sync may not complete.

**Current workaround:** Manual sync via `/api/cohost/refresh`

**Fix needed:** Batch processing with time budget (partially implemented)

### "Guest names reverting to Reserved"

This was the most common bug. Fixed by structural separation.

If it happens now, check:
- Is `enriched_guest_name` being cleared? (Should never happen)
- Is display logic reading wrong column?

### "No Gmail token for connection"

The cron is hitting RLS restrictions. Check that:
- `supabase` client is passed to `processMessages()` and `enrichBookings()`
- Using service role client, not server client

---

## API Routes Reference

### Cron (called by cron-job.org)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cron/refresh` | GET | Sync all iCal feeds |
| `/api/cron/enrichment` | GET | Process Gmail and enrich |

Both require `Authorization: Bearer ${CRON_SECRET}` header.

### Calendar

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cohost/calendar` | GET | Fetch bookings for date range |
| `/api/cohost/refresh` | POST | Manual sync trigger |

### Gmail Connections

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cohost/connections/[id]/gmail/start` | POST | Start OAuth flow |
| `/api/cohost/connections/gmail/callback` | GET | OAuth callback |
| `/api/cohost/connections/[id]/gmail/scan` | POST | Manual email scan |
| `/api/cohost/connections/[id]/enrich` | POST | Manual enrichment |

### iCal Management

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cohost/ical/sync` | POST | Sync specific feed |
| `/api/cohost/ical/feed/disable` | POST | Disable a feed |
| `/api/cohost/ical/reset` | POST | Reset feed state |

---

## Roles & Permissions

| Role | Calendar | Guest Names | Sync | Team Management |
|------|----------|-------------|------|-----------------|
| Owner | ✅ Full | ✅ View | ✅ Yes | ✅ Yes |
| Admin | ✅ Full | ✅ View | ✅ Yes | ✅ Yes |
| Operator | ✅ Full | ✅ View | ✅ Yes | ❌ No |
| Cleaner | ✅ View only | ❌ Hidden | ❌ No | ❌ No |

Cleaner role shows bookings as "Reservation" (no guest names) with pastel coral color.

---

## Properties (Current Setup)

| Property | Cleaning Policy | Notes |
|----------|-----------------|-------|
| Aloha Magic Cottage | None | Standard |
| Brown Cottage | None | Standard |
| Farmhouse Estate | Enabled (1 day) | Has cleaning blocks |
| Green Cottage | None | Standard |

---

## Future: Separation from Naviverse

**Current state:** CoHost lives inside naviverse.ai monorepo.

**Target state:** Standalone repo at cohostnavi.com.

### What needs to happen:

1. Create new GitHub repo
2. Copy CoHost-specific files:
   - `app/cohost/`
   - `app/api/cohost/`
   - `app/api/cron/`
   - `lib/services/`
   - `lib/roles/`
3. Copy and adapt shared files:
   - `lib/supabase/` (remove non-CoHost types)
   - `app/api/auth/` (if needed)
4. Create new Vercel project
5. Configure cohostnavi.com domain
6. Set up environment variables
7. Update cron-job.org endpoints

### Risk: Medium

Should be done during a stable period, not while debugging.

---

## Quick Reference — Diagnostic Queries

```sql
-- Unenriched bookings
SELECT id, guest_name, enriched_guest_name, check_in::date
FROM bookings WHERE is_active = true AND enriched_guest_name IS NULL
AND check_in > NOW() ORDER BY check_in LIMIT 20;

-- Recent facts
SELECT guest_name, confirmation_code, check_in, created_at
FROM reservation_facts ORDER BY created_at DESC LIMIT 10;

-- Recent emails
SELECT subject, created_at FROM gmail_messages 
ORDER BY created_at DESC LIMIT 10;

-- Gmail connection health
SELECT name, gmail_status, gmail_last_success_at, gmail_last_error_message
FROM connections WHERE gmail_refresh_token IS NOT NULL;

-- Match check (do facts match bookings?)
SELECT 
  'BOOKING' as src, check_in::date, guest_name,
  substring(raw_data->>'description' from '/details/([A-Z0-9]+)') as code
FROM bookings WHERE check_in::date = '2026-03-29'
UNION ALL
SELECT 'FACT', check_in, guest_name, confirmation_code
FROM reservation_facts WHERE check_in = '2026-03-29';
```

---

## Session Onboarding Checklist

When starting a new AI session for CoHost:

1. ✅ Upload `DECLARATION.md` — immutable laws
2. ✅ Upload `ARCHITECTURE.md` — this document
3. ✅ State the specific problem clearly
4. ✅ Provide relevant SQL query results
5. ✅ Provide Vercel logs if debugging crons
6. ❌ Don't let AI make changes without showing exact before/after
7. ❌ Don't let AI touch files not explicitly needed

---

## Document History

| Date | Change |
|------|--------|
| 2026-03-06 | Initial version after enrichment restructure |
