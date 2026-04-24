# ARCHITECTURE.md — Navi CoHost System Architecture
**Version:** 3.1  
**Last Updated:** 2026-04-24  
**Purpose:** Complete technical reference for onboarding new sessions and developers

---

## Quick Start — Read This First

Navi CoHost is a booking calendar and guest communication system for short-term rental hosts. It ingests bookings from iCal feeds, enriches them with guest names from Gmail confirmation emails, and now supports **direct booking** where guests can book and pay directly.

**The Core Loops:**
```
Loop 1 (iCal): iCal Feeds → Bookings (dates only) → Gmail Emails → Guest Names → Enriched Calendar

Loop 2 (Direct): Guest → Public Booking Page → Stripe Payment → Booking Created → Calendar
```

**Booking Sources:**
| Source | How it works |
|--------|--------------|
| `ical` | Bookings pulled from Airbnb/VRBO/Lodgify iCal feeds |
| `direct` | Bookings created via Navi direct booking (guest-initiated or host-initiated) |

**Key Files (90% of debugging happens here):**
- `lib/services/ical-processor.ts` — iCal sync
- `lib/services/email-processor.ts` — Gmail enrichment
- `lib/services/message-processor.ts` — Guest message threading (NEW)
- `lib/services/stripe-service.ts` — Stripe Connect integration
- `lib/services/booking-service.ts` — Direct booking creation
- `lib/services/email-service.ts` — Transactional emails (Resend)
- `app/api/cron/enrichment/route.ts` — Enrichment cron (also runs message processing)
- `app/api/cron/refresh/route.ts` — iCal refresh cron
- `app/api/webhooks/stripe/route.ts` — Stripe payment webhooks
- `app/calendar/CalendarClient.tsx` — Calendar UI

**Key Tables:**
- `bookings` — All calendar events (both iCal and direct)
- `booking_holds` — Temporary locks during checkout
- `reservation_facts` — Parsed email data
- `gmail_messages` — Raw emails (now includes `thread_id`, `message_type` columns)
- `connections` — Gmail OAuth connections
- `ical_feeds` — iCal feed URLs
- `cohost_properties` — Property definitions (includes direct booking config)
- `cohost_workspaces` — Workspace definitions (includes Stripe Connect)
- `cohost_conversations` — One messaging thread per booking per channel (NEW)
- `cohost_messages` — Individual messages inbound/outbound (NEW)
- `cohost_ai_drafts` — Navi draft suggestions + host edits for learning (NEW)

**Before making ANY changes, read:** `DECLARATION.md`

---

## Design & Branding

Navi CoHost follows a specific brand color palette. All new features and UI updates **MUST** adhere to these colors to maintain brand consistency.

| Element | Hex Code | Purpose |
| --------- | -------- | ------- |
| **Brand Teal** | `#008080` | Primary actions, active states, and headings |
| **Brand Coral** | `#FF5A5F` | "AI Co-Host" accents, status alerts, and highlights |

> [!IMPORTANT]
> **Strict Adherence:** Do not use generic Tailwind color classes (e.g., `teal-600`, `blue-500`) for primary UI elements. Always use the brand hex codes directly or via defined theme variables to ensure a premium, consistent look across the application.

---

## System Overview

### What It Does

| Feature | Description |
|---------|-------------|
| **Booking Calendar** | Visual timeline of all bookings across properties |
| **iCal Sync** | Pulls bookings from Airbnb, VRBO, Lodgify via iCal feeds |
| **Gmail Enrichment** | Extracts guest names from confirmation emails |
| **Direct Booking** | Hosted booking pages with Stripe payments |
| **Multi-Property** | Supports multiple properties per workspace |
| **Team Roles** | Owner, admin, operator, cleaner roles with permissions |
| **Guest Messaging** | Draft and send messages to guests (human-in-the-loop) |

### Why It Exists

Hosts using platform APIs (Airbnb API, etc.) get classified as "PMS users" and charged 16-18% fees instead of 3%. Navi CoHost uses iCal + Gmail to avoid this — an intentional architectural choice.

Direct booking adds a commission-free booking channel where hosts connect their own Stripe account and receive payouts directly.

---

## Current Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             PRODUCTION                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │  cron-job.org │────▶│    Vercel    │────▶│   Supabase   │           │
│   │  (triggers)   │     │  (Next.js)   │     │  (Postgres)  │           │
│   └──────────────┘     └──────────────┘     └──────────────┘           │
│                               │                                          │
│                    ┌──────────┼──────────┐                              │
│                    ▼          ▼          ▼                              │
│             ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│             │Gmail API │ │  Stripe  │ │  Resend  │                      │
│             │(OAuth)   │ │(Payments)│ │ (Email)  │                      │
│             └──────────┘ └──────────┘ └──────────┘                      │
│                                                                          │
│   Domain: cohostnavi.com                                                │
│   Public Booking: cohostnavi.com/book/[slug]                            │
│   Payment Links: cohostnavi.com/pay/[token]                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### External Services

| Service | Purpose | Config |
|---------|---------|--------|
| **Vercel** | Hosting, serverless functions | Auto-deploy from GitHub |
| **Supabase** | PostgreSQL database, auth, RLS | Shared with naviverse (for now) |
| **Gmail API** | OAuth email access | Google Cloud Console |
| **cron-job.org** | Scheduled triggers | 30s timeout, 2-min intervals |
| **Stripe** | Payments via Stripe Connect | Connected accounts per workspace |
| **Resend** | Transactional emails | Booking confirmations, payment links |

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
│   │   │   ├── inbox/             # Conversation list (InboxClient.tsx)
│   │   │   └── conversations/[id] # Thread view + compose (ConversationPage)
│   │   ├── properties/            # Property management
│   │   │   └── [id]/
│   │   │       └── direct-booking/page.tsx  # Listing editor
│   │   ├── bookings/              # Direct booking management
│   │   │   ├── new/page.tsx       # Host-initiated booking form
│   │   │   └── [id]/page.tsx      # Booking detail/management
│   │   ├── review/                # Review inbox (ambiguous bookings)
│   │   ├── settings/              # User/workspace settings + Stripe Connect
│   │   └── team/                  # Team member management
│   │
│   ├── book/                      # ← PUBLIC BOOKING PAGES
│   │   └── [slug]/
│   │       ├── page.tsx           # Public listing page
│   │       ├── checkout/page.tsx  # Checkout flow
│   │       └── confirmation/page.tsx
│   │
│   ├── pay/                       # ← PAYMENT LINK PAGES
│   │   └── [token]/
│   │       ├── page.tsx           # Payment link page
│   │       └── success/page.tsx
│   │
│   ├── api/
│   │   ├── cohost/                # ← COHOST API ROUTES
│   │   │   ├── calendar/route.ts  # Calendar data endpoint
│   │   │   ├── connections/       # Gmail connection management
│   │   │   ├── ical/              # iCal feed management
│   │   │   ├── properties/        # Property CRUD
│   │   │   │   └── [id]/
│   │   │   │       └── listing/route.ts  # Direct booking listing API
│   │   │   ├── bookings/          # Direct booking management
│   │   │   │   ├── create/route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── cancel/route.ts
│   │   │   │       ├── refund/route.ts
│   │   │   │       └── send-payment-link/route.ts
│   │   │   ├── stripe/            # Stripe Connect
│   │   │   │   ├── connect/route.ts
│   │   │   │   ├── callback/route.ts
│   │   │   │   └── status/route.ts
│   │   │   ├── refresh/route.ts   # Manual sync trigger
│   │   │   ├── review/            # Review inbox API
│   │   │   └── users/             # Team management
│   │   │
│   │   ├── public/                # ← PUBLIC APIs (no auth)
│   │   │   ├── listing/[slug]/route.ts
│   │   │   ├── availability/route.ts
│   │   │   ├── checkout/
│   │   │   │   ├── start/route.ts
│   │   │   │   └── create-payment-intent/route.ts
│   │   │   └── pay/[token]/route.ts
│   │   │
│   │   ├── webhooks/              # ← WEBHOOK HANDLERS
│   │   │   └── stripe/route.ts    # Stripe payment webhooks
│   │   │
│   │   ├── cron/                  # ← CRON ENDPOINTS
│   │   │   ├── enrichment/route.ts
│   │   │   └── refresh/route.ts
│   │   │
│   │   └── auth/                  # Shared auth
│   │       └── gmail/
│   │
│   └── [other naviverse apps - not CoHost]
│
├── lib/
│   ├── services/                  # ← CORE COHOST LOGIC
│   │   ├── ical-processor.ts      # iCal parsing and sync
│   │   ├── email-processor.ts     # Gmail parsing and enrichment
│   │   ├── email-classifier.ts    # Email type detection (regex)
│   │   ├── gmail-service.ts       # Gmail API client wrapper
│   │   ├── stripe-service.ts      # Stripe Connect helpers
│   │   ├── booking-service.ts     # Direct booking creation
│   │   └── email-service.ts       # Transactional emails (Resend)
│   │
│   ├── supabase/                  # ← DATABASE CLIENTS
│   │   ├── client.ts              # Browser client
│   │   ├── server.ts              # Server client (RLS)
│   │   ├── cohostServer.ts        # Service role client (bypasses RLS)
│   │   └── cohostTypes.ts         # TypeScript types
│   │
│   ├── roles/                     # ← COHOST PERMISSIONS
│   │   └── roleConfig.ts
│   │
│   ├── utils/
│   │   ├── google.ts              # Google OAuth client
│   │   ├── db-lock.ts             # Cron lock mechanism
│   │   └── slug.ts                # URL slug generation
│   │
│   └── connectors/                # DORMANT - do not use
│
└── docs/                          # Contracts per module
```

### Files You'll Touch Most Often

| File | Purpose | Danger Level |
|------|---------|--------------|
| `lib/services/ical-processor.ts` | iCal sync logic | 🔴 HIGH — breaks calendar |
| `lib/services/email-processor.ts` | Enrichment logic | 🔴 HIGH — breaks names |
| `lib/services/stripe-service.ts` | Stripe Connect | 🔴 HIGH — breaks payments |
| `lib/services/booking-service.ts` | Direct booking creation | 🔴 HIGH — breaks bookings |
| `app/api/webhooks/stripe/route.ts` | Payment confirmation | 🔴 HIGH — breaks payments |
| `app/api/cron/enrichment/route.ts` | Enrichment cron | 🟡 MEDIUM |
| `app/api/cron/refresh/route.ts` | iCal cron | 🟡 MEDIUM |
| `app/book/[slug]/page.tsx` | Public booking page | 🟡 MEDIUM |
| `app/calendar/CalendarClient.tsx` | Calendar UI | 🟢 LOW — just display |

---

## Database Schema

### Core Tables

#### `bookings`
The main calendar table. Contains bookings from ALL sources (iCal and direct).

| Column | Type | Written By | Notes |
|--------|------|------------|-------|
| `id` | UUID | System | Primary key |
| `workspace_id` | UUID | iCal/Direct | Workspace scope |
| `property_id` | UUID | iCal/Direct | Which property |
| `guest_name` | TEXT | iCal/Direct | Raw iCal summary OR direct guest name |
| `check_in` | TIMESTAMPTZ | iCal/Direct | Stored as noon UTC |
| `check_out` | TIMESTAMPTZ | iCal/Direct | Stored as noon UTC |
| `external_uid` | TEXT | iCal/Direct | iCal event UID OR `direct-{uuid}` |
| `raw_data` | JSONB | iCal | Full iCal event (contains confirmation code) |
| `source_feed_id` | UUID | iCal | Which feed created this (null for direct) |
| `is_active` | BOOLEAN | iCal/Direct | Soft delete flag |
| `source` | TEXT | System | `'ical'` or `'direct'` |
| `status` | TEXT | Direct | `'confirmed'`, `'pending_payment'`, `'cancelled'` |
| `guest_email` | TEXT | Direct | Guest contact |
| `guest_phone` | TEXT | Direct | Guest contact |
| `total_price` | INTEGER | Direct | Total in cents |
| `stripe_payment_intent_id` | TEXT | Direct | For payment tracking/refunds |
| `payment_link_token` | TEXT | Direct | For host-initiated payment links |
| `rental_agreement_accepted_at` | TIMESTAMPTZ | Direct | When guest accepted terms |
| `cancelled_at` | TIMESTAMPTZ | Direct | When cancelled |
| `refund_amount` | INTEGER | Direct | Cents refunded |
| `created_by_user_id` | UUID | Direct | For host-initiated bookings |
| `notes` | TEXT | Direct | Internal host notes |
| `enriched_guest_name` | TEXT | Enrichment | Real guest name (iCal only) |
| `enriched_guest_count` | INTEGER | Enrichment | Guest count from email |
| `enriched_connection_id` | UUID | Enrichment | Which Gmail connection matched |
| `enriched_at` | TIMESTAMPTZ | Enrichment | When enriched |
| `manual_guest_name` | TEXT | Manual | Human override |
| `manual_connection_id` | UUID | Manual | Human-assigned connection |
| `manually_resolved_at` | TIMESTAMPTZ | Manual | When manually resolved |

**Key constraints:**
- `(property_id, check_in, check_out)` is unique
- `source` must be `'ical'` or `'direct'`
- `status` must be `'confirmed'`, `'pending_payment'`, or `'cancelled'`

#### `booking_holds`
Temporary locks during checkout to prevent double booking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `property_id` | UUID | FK to cohost_properties |
| `check_in` | DATE | |
| `check_out` | DATE | |
| `session_id` | TEXT | Browser/checkout session identifier |
| `expires_at` | TIMESTAMPTZ | Auto-expire after ~15 min |
| `created_at` | TIMESTAMPTZ | |

**Key constraint:** `(property_id, check_in, check_out, session_id)` is unique.

#### `cohost_properties`
Property definitions with direct booking configuration.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Workspace scope |
| `name` | TEXT | "Aloha Magic Cottage", etc. |
| `image_url` | TEXT | Property thumbnail |
| `direct_booking_enabled` | BOOLEAN | Toggle for public booking page |
| `slug` | TEXT | URL identifier (unique) |
| `headline` | TEXT | Short tagline |
| `description` | TEXT | Full description for guests |
| `listing_photos` | JSONB | Array of photo URLs |
| `rental_agreement_text` | TEXT | Per-property agreement |
| `nightly_rate` | INTEGER | Cents |
| `cleaning_fee` | INTEGER | Cents |
| `min_nights` | INTEGER | Minimum stay (default 1) |
| `max_guests` | INTEGER | Guest limit |
| `bedrooms` | INTEGER | |
| `beds` | INTEGER | |
| `bathrooms` | NUMERIC | |
| `amenities` | JSONB | Array of amenity strings |
| `house_rules` | JSONB | Rules object |
| `check_in_time` | TEXT | e.g., "15:00" |
| `check_out_time` | TEXT | e.g., "11:00" |

#### `cohost_workspaces`
Workspace definitions with Stripe Connect.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `owner_id` | UUID | FK to auth.users |
| `name` | TEXT | Workspace name |
| `slug` | TEXT | URL identifier |
| `stripe_account_id` | TEXT | Stripe Connect account ID |
| `stripe_onboarding_complete` | BOOLEAN | Whether payouts enabled |

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
| `snippet` | TEXT | Gmail preview text |
| `thread_id` | TEXT | Gmail thread ID (added migration 20260419) |
| `message_type` | TEXT | Classification: `reservation_confirmation`, `guest_message`, etc. (added migration 20260419) |
| `raw_metadata` | JSONB | Full email body + classification in `raw_metadata.classification` |
| `processed_at` | TIMESTAMPTZ | NULL = needs second pass. Set when fully processed. |

**Important:** `email-processor.ts` must write `thread_id` and `message_type` on insert, and leave `processed_at = null` for `guest_message` and `reservation_confirmation` types (second-pass). Earlier deployed versions did not write these columns — rows from before the fix have `message_type = NULL`.

#### `connections`
Email connections — one row per OTA account per workspace. Supports Gmail, Microsoft/Outlook, and SMTP providers.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `name` | TEXT | "Spark & Stay", "Sidra A/C", etc. |
| `color` | TEXT | Hex color for UI |
| `reservation_label` | TEXT | Gmail label OR Outlook folder name to sync from |
| `email_provider` | TEXT | `'gmail'` \| `'microsoft'` \| `'smtp'` (default: `'gmail'`) |
| `gmail_refresh_token` | TEXT | Gmail OAuth refresh token |
| `gmail_access_token` | TEXT | Gmail OAuth access token |
| `gmail_status` | TEXT | `'connected'` / `'error'` / `'needs_reconnect'` |
| `gmail_account_email` | TEXT | Verified Gmail address |
| `microsoft_refresh_token` | TEXT | Microsoft OAuth refresh token |
| `microsoft_access_token` | TEXT | Microsoft OAuth access token |
| `microsoft_token_expires_at` | BIGINT | Expiry as Unix ms |
| `microsoft_account_email` | TEXT | Verified Outlook/Microsoft address |
| `microsoft_status` | TEXT | `'connected'` / `'error'` / `'needs_reconnect'` |
| `smtp_host` | TEXT | e.g. `smtp.mail.yahoo.com` |
| `smtp_port` | INTEGER | Usually 587 (STARTTLS) |
| `smtp_user` | TEXT | Full email address used for login |
| `smtp_password_encrypted` | TEXT | AES-256-GCM encrypted app password (`iv:authTag:ciphertext`) |
| `smtp_secure` | BOOLEAN | `false` = STARTTLS on 587; `true` = TLS on 465 |
| `smtp_provider` | TEXT | `'yahoo'` / `'icloud'` / `'zoho'` / `'custom'` |
| `smtp_from_name` | TEXT | Display name in From header |
| `smtp_status` | TEXT | `'connected'` / `'error'` |

#### `ical_feeds`
iCal feed URLs per property.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `property_id` | UUID | Which property |
| `ical_url` | TEXT | Full iCal URL |
| `source_name` | TEXT | "Airbnb", "Lodgify", etc. |
| `source_type` | TEXT | Platform type (set at insert time; not used for UI labels — see below) |
| `color` | TEXT | Hex color for calendar booking windows (e.g. `#FF5A5F`). Auto-assigned per platform on create. User-editable via color swatch in Calendar Settings. |
| `is_active` | BOOLEAN | Enabled/disabled |
| `last_synced_at` | TIMESTAMPTZ | Last successful sync |

### Relationships

```
cohost_workspaces
    │
    ├── stripe_account_id ──────────────────────────▶ Stripe Connect
    │
    ├── cohost_properties
    │       │
    │       ├── ical_feeds
    │       │
    │       ├── bookings (source='ical' OR source='direct')
    │       │
    │       ├── booking_holds (temporary checkout locks)
    │       │
    │       └── direct_booking_enabled, slug, pricing...
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

Writes: guest_name, check_in, check_out, external_uid, raw_data, source='ical'
Never touches: enriched_* columns, direct booking columns

Multi-feed guard (Law 12):
  - Canonical owner → full update
  - Non-owner with richer data (has /details/ URL) → upgrades raw_data + transfers ownership
  - Non-owner with equal/poorer data → only touches last_synced_at
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

Step 1: Fetch emails from Gmail label (+ orphan sweep for processed_at IS NULL)
Step 2: Parse confirmation emails → extract code → create reservation_facts
        Code extraction order: (A) Airbnb HM-pattern, (B) Lodgify #CODE, (C) Generic prefix
Step 3: Match fact.confirmation_code to booking.raw_data.description
Step 4: Write enriched_guest_name, enriched_guest_count, enriched_connection_id

Only applies to: source='ical' bookings
```

### Flow 3: Direct Booking (Guest-Initiated)

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Guest    │     │  /book/    │     │  Checkout  │     │   Stripe   │
│  Browser   │────▶│  [slug]    │────▶│   Flow     │────▶│  Payment   │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
                                             │                  │
                                             ▼                  │
                                      ┌────────────┐            │
                                      │   Hold     │            │
                                      │  Created   │            │
                                      └────────────┘            │
                                             │                  │
                                             │    Webhook       │
                                             ◀──────────────────┘
                                             │
                                             ▼
                                      ┌────────────┐     ┌────────────┐
                                      │  Booking   │────▶│   Emails   │
                                      │  Created   │     │    Sent    │
                                      └────────────┘     └────────────┘

Step 1: Guest visits /book/[slug]
Step 2: Guest selects dates → availability checked against bookings + holds
Step 3: Guest enters info, clicks checkout → hold created (15 min expiry)
Step 4: Guest pays via Stripe → payment_intent.succeeded webhook
Step 5: Webhook creates booking (source='direct', status='confirmed')
Step 6: Hold deleted
Step 7: Confirmation emails sent to guest and host
```

### Flow 4: Direct Booking (Host-Initiated)

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│    Host    │     │  Create    │     │  Payment   │     │   Guest    │
│   Admin    │────▶│  Booking   │────▶│   Link     │────▶│   Pays     │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
                         │                                      │
                         ▼                                      │
                  ┌────────────┐                                │
                  │  Booking   │                                │
                  │  pending   │                                │
                  └────────────┘                                │
                         │                                      │
                         │         Stripe Webhook               │
                         ◀──────────────────────────────────────┘
                         │
                         ▼
                  ┌────────────┐
                  │  Booking   │
                  │ confirmed  │
                  └────────────┘

Step 1: Host creates booking via /cohost/bookings/new
Step 2: Booking created with status='pending_payment', payment_link_token generated
Step 3: Host sends payment link to guest (email or manual)
Step 4: Guest visits /pay/[token], pays via Stripe
Step 5: Webhook updates booking status to 'confirmed'
Step 6: Confirmation emails sent
```

### Flow 5: Calendar Display

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Browser   │────▶│ /api/cohost│────▶│  Supabase  │
│            │◀────│  /calendar │◀────│  bookings  │
└────────────┘     └────────────┘     └────────────┘
                          │
                          ├── bookings (date range)
                          └── ical_feeds (source_name + color per source_feed_id)

Display Priority (for guest name):
1. manual_guest_name (if manually_resolved_at set)
2. enriched_guest_name (if enriched_at set)
3. guest_name (raw iCal summary OR direct booking guest name)

Booking window color priority:
1. Cleaner view → pastel coral (role-based)
2. Manually resolved → manual connection's color (host explicit override)
3. iCal booking → ical_feeds.color (set at feed create, user-editable in Calendar Settings)
4. No color → gray fallback

Label on booking window:
- iCal bookings: ical_feeds.source_name (e.g. "Airbnb", "VRBO") — always present
- Manually resolved: connection name (host chose it explicitly)

Both iCal and direct bookings appear on the same calendar.
Direct bookings identified by source='direct'.
```

---

## The Enrichment System (Critical)

### The Structural Separation Principle

**iCal and enrichment data live in SEPARATE columns and can NEVER overwrite each other.**

| Data | Columns | Written By |
|------|---------|------------|
| iCal data | `guest_name`, `check_in`, `check_out`, `raw_data` | ical-processor.ts ONLY |
| Enrichment | `enriched_guest_name`, `enriched_guest_count`, `enriched_connection_id` | email-processor.ts ONLY |
| Direct booking | `guest_name`, `guest_email`, `guest_phone`, `total_price`, etc. | booking-service.ts ONLY |

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

**Direct bookings are never enriched.** They have `source='direct'` and already contain guest info.

### What Gets Enriched vs What Doesn't

| Source | guest_name | Has code in raw_data? | Gets enriched? |
|--------|------------|----------------------|----------------|
| iCal | Reserved | Yes | ✅ Yes |
| iCal | Blocked | No | ❌ No |
| iCal | Airbnb (Not available) | No | ❌ No (cleaning block) |
| iCal | John Smith (from Lodgify) | Yes | Already has name |
| Direct | John Smith | N/A | ❌ No (already has name) |

---

## Direct Booking System

### Availability Check

Availability is checked against BOTH bookings and holds:

```sql
-- Dates are blocked if:
-- 1. Active booking overlaps (any source), OR
-- 2. Unexpired hold overlaps

SELECT EXISTS (
  SELECT 1 FROM bookings 
  WHERE property_id = $1 
    AND is_active = true
    AND status != 'cancelled'
    AND check_in < $3  -- requested checkout
    AND check_out > $2 -- requested checkin
)
OR EXISTS (
  SELECT 1 FROM booking_holds
  WHERE property_id = $1
    AND expires_at > NOW()
    AND check_in < $3
    AND check_out > $2
)
```

### Booking Holds

Holds prevent double-booking during checkout:
- Created when guest starts checkout
- Expire after 15 minutes
- Deleted when booking is created or payment fails
- Checked during availability queries

### Stripe Connect

- Each workspace connects ONE Stripe account
- All properties in the workspace use that account
- Payouts go directly to host (Navi takes no commission)
- Hosts manage refunds via Navi or Stripe Dashboard

### Booking Statuses

| Status | Meaning | Calendar Blocks? |
|--------|---------|------------------|
| `confirmed` | Payment received, booking is live | ✅ Yes |
| `pending_payment` | Host-initiated, awaiting guest payment | ✅ Yes (dates held) |
| `cancelled` | Cancelled by host | ❌ No |

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
| `MICROSOFT_CLIENT_ID` | Azure app registration client ID (for Outlook OAuth) |
| `MICROSOFT_CLIENT_SECRET` | Azure app registration secret (for Outlook OAuth) |
| `SMTP_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM SMTP password encryption (`openssl rand -hex 32`) |
| `CRON_SECRET` | Secret for cron authentication |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key for transactional + direct_email channel |
| `EMAIL_FROM` | From address for system emails and direct_email channel (e.g. `noreply@cohostnavi.com`) |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g., https://cohostnavi.com) |

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

### "Direct booking not appearing on calendar"

1. **Check booking exists:**
```sql
SELECT id, source, status, check_in, check_out 
FROM bookings WHERE source = 'direct' ORDER BY created_at DESC LIMIT 10;
```

2. **Check booking status:** Must be `confirmed` or `pending_payment` with `is_active = true`

3. **Check Stripe webhook:** Look at Vercel logs for `/api/webhooks/stripe`

### "Payment succeeded but booking not created"

1. **Check webhook received:**
```sql
SELECT * FROM bookings WHERE stripe_payment_intent_id = 'pi_xxx';
```

2. **Check Vercel logs** for webhook errors

3. **Check Stripe Dashboard** → Webhooks → Recent events

### "Stripe Connect not working"

1. **Check workspace has Stripe connected:**
```sql
SELECT stripe_account_id, stripe_onboarding_complete 
FROM cohost_workspaces WHERE id = 'xxx';
```

2. **Verify environment variables** are set correctly

### "Dates showing as unavailable incorrectly"

1. **Check for stale holds:**
```sql
SELECT * FROM booking_holds 
WHERE property_id = 'xxx' AND expires_at > NOW();
```

2. **Clean up expired holds:**
```sql
DELETE FROM booking_holds WHERE expires_at < NOW();
```

---

## API Routes Reference

### Cron (called by cron-job.org)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cron/refresh` | GET | Sync all iCal feeds |
| `/api/cron/enrichment` | GET | Process Gmail and enrich |

Both require `Authorization: Bearer ${CRON_SECRET}` header.

### Webhooks

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/webhooks/stripe` | POST | Handle Stripe payment events |

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

### Stripe Connect

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cohost/stripe/connect` | POST | Start Stripe Connect OAuth |
| `/api/cohost/stripe/callback` | GET | Stripe OAuth callback |
| `/api/cohost/stripe/status` | GET | Check connection status |

### Direct Booking (Host)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cohost/properties/[id]/listing` | GET/PUT | Get/update listing config |
| `/api/cohost/bookings/create` | POST | Create host-initiated booking |
| `/api/cohost/bookings/[id]` | GET | Get booking details |
| `/api/cohost/bookings/[id]/cancel` | POST | Cancel booking |
| `/api/cohost/bookings/[id]/refund` | POST | Issue refund |
| `/api/cohost/bookings/[id]/send-payment-link` | POST | Send payment link email |

### Direct Booking (Public)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/public/listing/[slug]` | GET | Get public listing data |
| `/api/public/availability` | POST | Check date availability |
| `/api/public/checkout/start` | POST | Start checkout, create hold |
| `/api/public/checkout/create-payment-intent` | POST | Create Stripe PaymentIntent |
| `/api/public/pay/[token]` | GET | Get payment link booking data |
| `/api/public/ical/[propertyId]` | GET | Outbound iCal feed for OTAs to subscribe to (no auth). Returns RFC 5545-compliant `.ics` with all active bookings as `SUMMARY:Blocked` events. Accepts `.ics` suffix in the URL (Airbnb/VRBO append it automatically). `Cache-Control: public, max-age=3600`. |

---

## Roles & Permissions

| Role | Calendar | Guest Names | Sync | Team | Direct Booking |
|------|----------|-------------|------|------|----------------|
| Owner | ✅ Full | ✅ View | ✅ Yes | ✅ Yes | ✅ Full |
| Admin | ✅ Full | ✅ View | ✅ Yes | ✅ Yes | ✅ Full |
| Operator | ✅ Full | ✅ View | ✅ Yes | ❌ No | ✅ Create/View |
| Cleaner | ✅ View only | ❌ Hidden | ❌ No | ❌ No | ❌ No |

Cleaner role shows bookings as "Reservation" (no guest names) with pastel coral color.

---

## Quick Reference — Diagnostic Queries

```sql
-- Unenriched iCal bookings
SELECT id, guest_name, enriched_guest_name, check_in::date, source
FROM bookings WHERE is_active = true AND enriched_guest_name IS NULL
AND source = 'ical' AND check_in > NOW() ORDER BY check_in LIMIT 20;

-- Recent direct bookings
SELECT id, guest_name, guest_email, status, check_in::date, total_price
FROM bookings WHERE source = 'direct' ORDER BY created_at DESC LIMIT 10;

-- Pending payment bookings
SELECT id, guest_name, guest_email, payment_link_token, created_at
FROM bookings WHERE status = 'pending_payment' ORDER BY created_at DESC;

-- Direct bookings by property
SELECT p.name, COUNT(*) as bookings, SUM(b.total_price) as revenue
FROM bookings b JOIN cohost_properties p ON b.property_id = p.id
WHERE b.source = 'direct' AND b.status = 'confirmed'
GROUP BY p.name;

-- Active booking holds
SELECT * FROM booking_holds WHERE expires_at > NOW();

-- Stripe connection status
SELECT id, name, stripe_account_id, stripe_onboarding_complete
FROM cohost_workspaces WHERE stripe_account_id IS NOT NULL;

-- Recent facts
SELECT guest_name, confirmation_code, check_in, created_at
FROM reservation_facts ORDER BY created_at DESC LIMIT 10;

-- Gmail connection health
SELECT name, gmail_status, gmail_last_success_at, gmail_last_error_message
FROM connections WHERE gmail_refresh_token IS NOT NULL;

-- Match check (do facts match bookings?)
SELECT 
  'BOOKING' as src, check_in::date, guest_name,
  substring(raw_data->>'description' from '/details/([A-Z0-9]+)') as code
FROM bookings WHERE check_in::date = '2026-03-29' AND source = 'ical'
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
5. ✅ Provide Vercel logs if debugging crons or webhooks
6. ❌ Don't let AI make changes without showing exact before/after
7. ❌ Don't let AI touch files not explicitly needed

---

---

## Messaging System

### Overview

Two types of guest messages flow through the system:

| Channel | Guest Type | How it works |
|---------|-----------|--------------|
| `gmail_relay` | iCal guests (Airbnb/VRBO/Lodgify) | Platform relays guest messages to host Gmail. Navi parses relay emails and threads them. |
| `direct_email` | Direct booking guests | Guests have real email addresses. Outbound via Resend. Inbound via reply+{token} webhook (future). |

### Data Model

```
conversations (1 per booking per channel)
    │
    ├── messages (N inbound + outbound)
    │
    └── ai_message_drafts (Navi's suggested replies + host edits)
```

**`cohost_conversations`** — one row per booking per channel. `gmail_thread_id` groups all relay emails from the same Gmail thread (reply chain).

**`cohost_messages`** — individual messages. `direction = 'inbound'` is guest → host. `direction = 'outbound'` is host → guest. `sent_by_user_id = null` means Navi sent autonomously.

**`cohost_ai_drafts`** — every time Navi suggests a reply:
- `draft_body` = what Navi wrote
- `edited_body` = what the host actually sent (if they changed it)
- This diff is the training loop that teaches Navi each host's voice over time.

### Flow 6: Guest Message Processing (iCal guests)

```
Gmail Label
    │
    ▼
EmailProcessor.processMessages()   ← already running every 2 min
    │  classifies as 'guest_message'
    │  stores in gmail_messages (processed_at = NULL)
    │
    ▼
MessageProcessor.processGuestMessages()   ← called after enrichBookings()
    │  extracts guest name from subject
    │  strips platform HTML → pure message body
    │  matches to booking by guest name fuzzy score
    │  finds or creates conversation (by thread_id, then by booking_id)
    │
    ▼
conversations + messages tables
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/services/email-classifier.ts` | Classifies `guest_message` type (already existed) |
| `lib/services/email-processor.ts` | Fetches mail (Gmail or Microsoft Graph, dispatched by `email_provider`), stores raw. SMTP connections skipped (send-only). |
| `lib/services/gmail-service.ts` | Gmail OAuth: read inbox, send replies |
| `lib/services/microsoft-mail-service.ts` | Microsoft Graph: read Outlook inbox, send replies (OAuth) |
| `lib/services/smtp-mail-service.ts` | SMTP via nodemailer: send replies (Yahoo, iCloud, custom). Send-only. |
| `lib/services/email-crypto.ts` | AES-256-GCM encrypt/decrypt for SMTP app passwords stored in DB |
| `lib/utils/microsoft.ts` | Microsoft Identity Platform OAuth helpers (auth URL, token exchange, refresh) |
| `lib/services/message-processor.ts` | Second-pass processor: extracts body, matches booking, writes conversations + messages |
| `app/api/cron/enrichment/route.ts` | Calls `MessageProcessor.processGuestMessages()` after enrichBookings() |
| `app/api/cohost/connections/[id]/microsoft/start` | Start Microsoft OAuth flow |
| `app/api/cohost/connections/microsoft/callback` | Microsoft OAuth callback — stores tokens, sets `email_provider = 'microsoft'` |
| `app/api/cohost/connections/[id]/smtp/setup` | Save + verify SMTP credentials |
| `supabase/migrations/20260419000000_add_messaging.sql` | Creates all messaging tables + RLS |
| `supabase/migrations/20260423000001_add_multi_provider_email.sql` | Adds `email_provider`, Microsoft, and SMTP columns to `connections` |

### Multi-Provider Email (Ingest + Send)

Hosts connect an email account per OTA connection. The `connections.email_provider` column controls which service handles both read and write:

| Provider | email_provider | Ingest (read relay emails) | Send replies |
|----------|---------------|---------------------------|--------------|
| Gmail | `gmail` | Gmail API (GmailService) | Gmail API |
| Outlook / Office 365 | `microsoft` | Microsoft Graph API (MicrosoftMailService) | Microsoft Graph API |
| Yahoo / iCloud / Custom | `smtp` | **Not yet — phase 2 (IMAP)** | SMTP via nodemailer |

**Key files per provider:**

| Provider | OAuth/Config | Send | Ingest |
|----------|-------------|------|--------|
| Gmail | `lib/utils/google.ts` | `GmailService.sendReply()` | `GmailService.fetchMessages()` |
| Microsoft | `lib/utils/microsoft.ts` | `MicrosoftMailService.sendReply()` | `MicrosoftMailService.fetchMessages()` |
| SMTP | `lib/services/smtp-mail-service.ts` | `SmtpMailService.sendReply()` | — (phase 2) |

**SMTP password security:** Stored AES-256-GCM encrypted (`iv:authTag:ciphertext` base64 format) using `SMTP_ENCRYPTION_KEY` env var (32-byte hex key). Decrypted only at send time via `email-crypto.ts`.

**New env vars required:**
- `MICROSOFT_CLIENT_ID` — Azure app registration client ID
- `MICROSOFT_CLIENT_SECRET` — Azure app registration secret
- `SMTP_ENCRYPTION_KEY` — 32-byte hex key (`openssl rand -hex 32`)

**New DB columns on `connections`:** `email_provider`, `microsoft_refresh_token`, `microsoft_access_token`, `microsoft_token_expires_at`, `microsoft_account_email`, `microsoft_status`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password_encrypted`, `smtp_secure`, `smtp_provider`, `smtp_from_name`, `smtp_status`.

### Airbnb Relay Email Formats

Airbnb sends guest messages in two different subject formats:

| Format | Subject | When |
|--------|---------|------|
| **Standard relay** | `Norilda Garcia-Reed sent you a message` | Guest initiates message on platform |
| **Reply-thread relay** | `RE: Reservation for Aloha Magic Cottage, Apr 21 – 23` | Guest **replies to the reservation confirmation email** thread |

The reply-thread format has NO guest name in the subject. The backfill and cron both handle this via a **date-based fallback**: extract the check-in date from `RE: Reservation for%Apr 21%` and match to a booking with that check-in date (unique match required).

### Matching Logic

Guest messages are matched to bookings by guest name (extracted from relay email subject). Scoring:

| Score | Condition |
|-------|-----------|
| 100 | Exact match on `enriched_guest_name` |
| 90 | Exact match on `guest_name` |
| 60 | First-name match on `enriched_guest_name` |
| 50 | First-name match on `guest_name` |
| +20 | Future booking boost |
| +15 | Active stay boost |

Minimum score of 50 required. Low-confidence matches are skipped and logged.

### What's Not Built Yet (Next Steps)

- [x] Messaging UI — inbox (conversation list) + thread view (message bubbles) + reply composer
- [x] Send API (`/api/cohost/messaging/send`) — stores outbound messages, updates draft status
- [x] Outbound delivery for `gmail_relay` — dispatches to Gmail / Microsoft / SMTP depending on `email_provider` on the connection
- [x] Outbound delivery for `direct_email` — sends via Resend FROM `noreply@cohostnavi.com`
- [ ] Direct booking email channel — inbound webhook (Resend inbound)
- [x] AI draft generation (OpenAI gpt-4o-mini → writes cohost_ai_drafts with status='pending'; auto-fires from MessageProcessor cron; on-demand "Generate Navi Draft" button in thread UI)
- [x] Multi-provider email (Gmail OAuth, Microsoft/Outlook OAuth, SMTP/app-password for Yahoo/iCloud/custom)
- [ ] IMAP ingest for SMTP connections (receive relay emails for Yahoo/iCloud hosts) — phase 2
- [ ] Host voice learning loop (rows where edited_body != draft_body)
- [ ] Unread badge in sidebar nav

---

## Document History

| Date | Change |
|------|--------|
| 2026-03-06 | Initial version after enrichment restructure |
| 2026-03-22 | v2.0: Added Direct Booking system (Stripe Connect, booking holds, payment links, host-initiated bookings, email notifications) |
| 2026-04-19 | v2.2: Added Messaging System foundation (conversations, messages, ai_message_drafts tables, MessageProcessor service, enrichment cron integration) |
| 2026-04-19 | v2.3: Built Messaging UI — inbox (conversations list), thread view (message bubbles), reply composer, send API (`/api/cohost/messaging/send`) |
| 2026-04-19 | v2.4: Wired outbound Gmail delivery — `GmailService.sendReply()` replies into existing Gmail threads for gmail_relay channel; delivery warnings surface in UI if Gmail send fails |
| 2026-04-21 | v2.3 (daily ops): Fixed check/checkout time timezone bug in summary API (datetime helpers now return local-time strings, no UTC conversion). Added hourlyRate to summary response. Added live payment estimate to CompleteCleaningForm + new CompleteTaskForm for cleaner task completions. TaskCard now shows completion state (Done/Payment Pending/Paid). Completed tasks split into pending-payment and paid sections in cleaner Daily Ops view. Fixed latest_completion.completed_by_email enrichment in summary. Added host_payment_confirmed_at to completedTasks response for host dashboard. |
| 2026-04-19 | v2.5: AI draft generation — `DraftGeneratorService` uses OpenAI gpt-4o-mini with property/booking/host context; auto-fires from MessageProcessor cron; on-demand Generate Draft button + Regenerate in thread UI |
| 2026-04-21 | v2.6: Fixed messaging ingestion pipeline. Root causes: (1) deployed `email-processor.ts` was not writing `thread_id`/`message_type` columns — all 1000 emails had NULL, breaking `processGuestMessages()` query. (2) Airbnb "reply-thread" relay format (`RE: Reservation for [property], Apr 21 – 23`) has no guest name in subject — neither `backfillForWorkspace()` nor `processGuestMessages()` could match it. Fixes: `email-processor.ts` now writes `thread_id`+`message_type` and leaves `guest_message` as `processed_at=null`; `backfillForWorkspace()` and `processGuestMessages()` both fall back to check-in date extraction when name-based search returns nothing; `extractMessageBody()` now detects Airbnb relay structure and returns only the guest's message text. |
| 2026-04-23 | v2.8: Multi-provider email — Microsoft OAuth (Outlook/Office 365 read+send via Graph API), SMTP/app-password (Yahoo/iCloud/custom send via nodemailer), direct_email channel wired to Resend. Gmail OAuth scope fixed to include gmail.send. Connections UI updated with provider picker, Microsoft connect flow, and SMTP setup form. DB migration 20260423000001. New env vars: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, SMTP_ENCRYPTION_KEY. |
| 2026-04-23 | v2.7: Inbox UI polish. (1) Inbox conversation list now grouped into "Staying Now" / "Upcoming" / "Past" sections with sticky headers. Current guests get amber background highlight + coral left-bar accent. Sort: current → upcoming → past, unread floats to top within each group, date ordering within groups (current: soonest checkout; upcoming: soonest check-in; past: most recent first). (2) Sync Gmail button changed to solid teal (`bg-teal-600`) to stand out in the header. (3) Each conversation row now shows a colored dot + connection name (e.g. `● Airbnb Magic`) sourced from `connections.name` / `connections.color`, using `bookings.enriched_connection_id`. Bugfix: `matched_connection_id` does NOT exist as a DB column (it is computed in-memory in the calendar API route from `raw_data.from_fact_id`) — including it in a PostgREST nested select caused the entire bookings join to fail and emptied the inbox. Only `enriched_connection_id` should be queried directly. |
| 2026-04-24 | v2.9: iCal feed colors — booking window colors now come from `ical_feeds.color` (not email connections). Every iCal booking is colored from day 1 of sync, no enrichment required. Smart defaults per platform on feed create (Airbnb=#FF5A5F, VRBO=#3B82F6, Booking.com=#003580). User-editable color swatch on each feed row in Calendar Settings. Calendar API fetches feed colors and attaches `source_color` + `source_label` to each booking. CalendarClient color priority: cleaner override → manual resolution color → feed color → gray. Label on booking window changed from connection name to `ical_feeds.source_name` (always present for iCal bookings). Migration: `supabase/migrations/20260424000001_add_ical_feed_color.sql`. |
| 2026-04-24 | v3.0: Connection creation redesigned as a single-step wizard. New flow: email → OTA checkboxes → properties → single **Connect** button (provider auto-detected from email domain). Common providers (Gmail, Outlook, Yahoo, iCloud, Zoho) route automatically; custom domains get a two-button inline choice (Google Workspace / Microsoft 365). Clicking Connect creates the DB record and immediately redirects to OAuth — no intermediate "Not Connected" state. SMTP inline form shows within the wizard for SMTP providers. Post-OAuth: **success screen** (not a toast) with "Email Connected!" heading, "Add Another Email" + "Done" buttons. "Configure Platforms" button removed from cards (OTAs always set during creation). Auto-color and auto-name assigned on create. Edit modal cleaned up: Color field removed, grey Email Provider picker block removed, per-OTA label names sub-section removed. |
| 2026-04-24 | v3.1: Calendar Sync improvements. (1) Feed name is now click-to-edit inline — click the name in Calendar Sync settings to rename; saves on blur/Enter, cancels on Escape. (2) OTA badge label on each feed row is now derived from the iCal URL domain (e.g. `airbnb.com` → "Airbnb", `vrbo.com` → "VRBO") instead of `source_type` which defaulted to 'other' for custom-named feeds. Badge is a single pale-yellow pill (`bg-yellow-50 text-yellow-700`). (3) Outbound iCal export URL corrected to `/api/public/ical/{propertyId}` (was broken `/ical/export/{id}.ics`). (4) Public iCal route (`app/api/public/ical/[propertyId]/route.ts`) fixed for OTA compatibility: RFC 5545 line-folding at 75 octets, `SUMMARY:Blocked` (OTA standard for date-blocking), `X-WR-TIMEZONE:UTC` header, stable UID using `external_uid` if available, `.ics` suffix stripped from URL so Airbnb/VRBO don't 404. |
