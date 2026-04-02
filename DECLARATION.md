# DECLARATION.md — Navi CoHost System Doctrine
**Status:** Immutable Foundation  
**Authority:** This document supersedes all other context. When in conflict, this wins.  
**Last Updated:** 2026-03-06

---

## What This System Is

Navi CoHost is an operational brain for short-term rental hosts. It is NOT a PMS. It deliberately avoids platform APIs (Airbnb, VRBO) to prevent hosts from being classified as PMS users and charged 16-18% platform fees instead of 3%. The entire ingestion strategy — iCal + Gmail — is an intentional architectural choice, not a limitation.

**Stack:** Next.js (App Router) / TypeScript / Supabase (Postgres) / Vercel  
**Repo structure:** `app/` (routes + pages), `lib/services/` (core logic), `docs/` (contracts per module)

---

## The Immutable Laws

These cannot be changed without explicit owner authorization. If a task would violate any of these, STOP and ask.

### Law 1 — iCal Supremacy
The `.ics` feed is the sole source of truth for booking existence and dates. Gmail/email NEVER creates, deletes, or modifies booking dates. Email is enrichment-only (guest name, guest count). If iCal says a date is blocked, it is blocked — period.

### Law 2 — Enrichment Guardrail (Confirmation Code Only)
Auto-enrichment matches by **confirmation code ONLY**. No date-based matching.

**How it works:**
- Gmail confirmation emails contain codes (e.g., `HMXXXXXX` for Airbnb, `B########` for Lodgify)
- iCal booking descriptions contain the same codes in the reservation URL
- Enrichment matches `fact.confirmation_code` to `booking.raw_data.description`
- If no code match → no enrichment (booking stays unenriched)

**Why this is safe:**
- Cleaning blocks have no confirmation codes (description is null) → automatically excluded
- No ambiguity between properties with same dates
- No date window bugs possible

**Absolute prohibitions:**
- Never match by date ranges
- Never overwrite a real human name with a platform placeholder
- Never reassign `property_id` via Gmail enrichment

### Law 3 — Idempotency
Every sync operation must produce the same database state when run multiple times. All inserts use `ON CONFLICT` upsert logic. Cron and manual sync must behave identically.

### Law 4 — Workspace Scoping
Every query, every API route, every RLS policy must be scoped to `workspace_id`. No cross-workspace data leakage. Ever.

### Law 5 — Label is Truth (Connections)
Gmail ingestion only reads from the configured `reservation_label`. Never from INBOX or ALL_MAIL. If the label doesn't exist, halt and surface error — do not fall back to broader access.

### Law 6 — Human-in-the-Loop (Messaging)
No message is ever sent to a guest without explicit human approval. AI-generated drafts always start as `status='drafted'`. The send trigger must come from an authenticated user action.

### Law 7 — Review System is Read-Only
The Review/detection system never writes to the `bookings` table. It observes and flags. Only iCal sync or explicit human action creates bookings.

### Law 8 — Property Cascade
Deleting a property deletes all children (bookings, ical_feeds, tasks, settings) via Postgres CASCADE. No orphaned data. No soft-delete currently — deletion is permanent.

### Law 9 — Tokens Are Plaintext (Current State)
`gmail_refresh_token` and `gmail_access_token` are stored as plain TEXT. This is a known MVP limitation. Do not add Vault/encryption unless explicitly asked.

### Law 10 — Connectors Are Dormant
`lib/connectors/` (guesty, hospitable, hostaway) exist but are NOT wired up and NOT in scope. Do not reference, extend, or activate them.

### Law 11 — Booking Deactivation is Restricted
A booking may only be set to `is_active = false` when the iCal feed explicitly removes the event — meaning the UID is no longer present in the feed on a subsequent sync. No other condition may deactivate a booking. Deactivation must be logged. Never deactivate a booking based on date overlap, duplicate detection, or any heuristic. If a booking disappears from a feed, verify the UID is truly absent before deactivating.

### Law 12 — Multi-Feed Canonical Ownership ⭐ ENFORCED
When multiple iCal feeds (Lodgify, Spark & Stay, Sidra A/C) report the same stay for the same property, exactly ONE booking record must exist. The first feed to create the booking owns the `external_uid` and `source_feed_id`. Subsequent feeds matching by date follow a "richer data wins" rule:

- **Canonical owner** → full update (all iCal fields)
- **Non-owner with richer data** (has `/details/` URL in description, existing doesn't) → upgrades `raw_data` and transfers `source_feed_id`
- **Non-owner with equal/poorer data** → only touches `last_synced_at`

This prevents Lodgify block events from overwriting Airbnb reservation URLs in `raw_data`, which contain the confirmation codes needed for enrichment matching.

### Law 13 — Cleaning Blocks Are Not Guest Bookings
Policy-enabled properties have Airbnb automatically insert cleaning blocks before check-in and after checkout. These appear in iCal feeds as "Airbnb (Not available)" events. They have **no confirmation code** in their description, so they are automatically excluded from enrichment matching. They are displayed on the calendar with visual distinction but never enriched.

**Operational blocks (never enriched):**
- `P********** T***` — Lodgify Preparation Time buffers
- `Airbnb (Not available)` — Airbnb cleaning blocks
- `Closed Period`, `Not Available` — Owner-initiated blocks

### Law 14 — Enrichment Runs Every Cron Cycle
Gmail enrichment runs on every cron cycle regardless of whether iCal found changes. This ensures newly arrived bookings are enriched promptly without waiting for a coincidental iCal change. Previously gated — owner-authorized removal on 2026-03-04.

### Law 15 — Structural Separation of iCal and Enrichment Data ⭐ NEW
**This is the core architectural principle. iCal and enrichment data are stored in separate columns and can NEVER overwrite each other.**

| Data Type | Written By | Columns |
|-----------|-----------|---------|
| iCal data | `ical-processor.ts` only | `guest_name`, `check_in`, `check_out`, `external_uid`, `raw_data` |
| Enrichment data | `email-processor.ts` only | `enriched_guest_name`, `enriched_guest_count`, `enriched_connection_id`, `enriched_at` |

**Display priority:** `enriched_guest_name ?? manual_guest_name ?? guest_name`

**Why this exists:** Previous "name guard" logic was fragile and broke repeatedly. Structural separation makes it physically impossible for iCal sync to overwrite enrichment data.

**Rules:**
- `ical-processor.ts` NEVER reads or writes `enriched_*` columns
- `email-processor.ts` NEVER reads or writes `guest_name` (only reads `raw_data` for code matching)
- A booking is "unenriched" if `enriched_guest_name IS NULL`
- A booking is "enriched" if `enriched_guest_name IS NOT NULL`

### Law 16 — Booking Identity Is (external_uid, property_id)
The canonical identity of a booking is the tuple `(external_uid, property_id)`. This is the only valid primary lookup key. If `external_uid` is absent, fall back to exact date match (`check_in = X AND check_out = Y`, day-level string comparison, no window) on the same property only. A booking matched by date on property A must never be updated by a feed belonging to property B.

### Law 17 — Gmail Enrichment Gate
Gmail enrichment runs only when at least one active future booking has `enriched_guest_name IS NULL`. When all future bookings are enriched, Gmail processing is skipped entirely. The gate is based on unenriched booking count — never on iCal change count.

### Law 18 — Fact Deduplication ⭐ NEW
Before inserting a new `reservation_fact`, check if one with the same `confirmation_code` already exists for that `connection_id`. If yes, skip insertion. Never create duplicate facts for the same booking.

---

## Module Map

| Module | Key Files | Contract |
|--------|-----------|----------|
| Calendar / iCal | `app/api/cohost/ical/`, `lib/services/ical-processor.ts` | `docs/calendar/CALENDAR_CONTRACT.md` |
| Connections / Gmail | `app/api/cohost/connections/`, `lib/services/gmail-service.ts` | `docs/connections/CONNECTIONS_CONTRACT.md` |
| Enrichment | `lib/services/email-processor.ts` | `docs/cohost/ENRICHMENT_CONTRACT.md` |
| Inbox / Messaging | `app/cohost/messaging/`, `app/api/cohost/generate-draft/` | `docs/inbox/INBOX_CONTRACT.md` |
| Properties | `app/cohost/properties/`, `app/api/cohost/properties/` | `docs/properties/PROPERTIES_CONTRACT.md` |
| Review | `app/cohost/review/`, `app/api/cohost/review/` | `docs/review/REVIEW_CONTRACT.md` |
| Cron | `app/api/cron/enrichment/`, `app/api/cron/refresh/` | See Laws 14, 17 |

---

## Current Stability Status (Updated 2026-03-06)

| Component | Status | Notes |
|-----------|--------|-------|
| iCal sync | ✅ Stable | Writes to `guest_name` only, never touches enrichment |
| Email fetching | ✅ Stable | Gmail API pagination working |
| Fact creation | ✅ Stable | Duplicate prevention active |
| Enrichment matching | ✅ Stable | Code-only matching, no date ambiguity |
| Display logic | ✅ Stable | Priority: manual > enriched > legacy > raw |
| Structural separation | ✅ Deployed | iCal cannot overwrite enrichment |
| Cron refresh | ⚠️ Timeout issues | Works manually, times out on cron-job.org (30s limit) |
| ical_sync_log | ⚠️ Minor issue | `'other'` channel constraint, non-blocking |

---

## Key Service Behaviors (Read Before Touching These Files)

**`ical-processor.ts → syncFeed()`:**
- Writes ONLY: `guest_name`, `check_in`, `check_out`, `external_uid`, `raw_data`, `platform`, `status`, `last_synced_at`
- NEVER touches: `enriched_guest_name`, `enriched_guest_count`, `enriched_connection_id`, `enriched_at`
- Lookup order: `external_uid + property_id` first, then exact date match
- **Law 12 Guard:** On update, checks `source_feed_id` for canonical ownership. Non-owner feeds cannot overwrite `raw_data` unless their data is richer (contains `/details/` URL)
- No enrichment logic — that's email-processor's job

**`email-processor.ts → enrichBookings()`:**
- Matches by confirmation code ONLY (code in `fact` matches code in `booking.raw_data.description`)
- Writes ONLY: `enriched_guest_name`, `enriched_guest_count`, `enriched_connection_id`, `enriched_at`
- NEVER touches: `guest_name`, `check_in`, `check_out`, `property_id`
- Cleaning blocks excluded automatically (no code = no match)

**`email-processor.ts → processMessages()`:**
- Classify first → only `reservation_confirmation` proceeds to parse
- Always stores raw to `gmail_messages` regardless of classification
- Idempotent: checks `confirmation_code` before inserting facts (Law 18)
- Orphan sweep: re-processes `gmail_messages` with `processed_at IS NULL`
- **Confirmation code extraction order:** (A) Airbnb `HM` pattern in body, (B) Lodgify `#CODE` in subject, (C) Generic prefix anchor (`Confirmation code`, `Reservation ID`, `BOOKING`) in body

**`email-classifier.ts`:**
- Pure deterministic regex — no AI, no external calls, no side effects
- Blocklist checked before confirmation patterns
- Do NOT add probabilistic or AI logic to this file

---

## Database Schema — Key Tables

### bookings
| Column | Type | Written By |
|--------|------|------------|
| `id` | UUID | System |
| `workspace_id` | UUID | iCal sync |
| `property_id` | UUID | iCal sync |
| `guest_name` | TEXT | iCal sync (raw summary) |
| `check_in` | TIMESTAMPTZ | iCal sync |
| `check_out` | TIMESTAMPTZ | iCal sync |
| `external_uid` | TEXT | iCal sync |
| `raw_data` | JSONB | iCal sync (contains description with confirmation code) |
| `enriched_guest_name` | TEXT | Enrichment only |
| `enriched_guest_count` | INTEGER | Enrichment only |
| `enriched_connection_id` | UUID | Enrichment only |
| `enriched_at` | TIMESTAMPTZ | Enrichment only |
| `manual_guest_name` | TEXT | Manual resolution |
| `manual_connection_id` | UUID | Manual resolution |
| `manually_resolved_at` | TIMESTAMPTZ | Manual resolution |

### reservation_facts
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `connection_id` | UUID | Which Gmail connection |
| `confirmation_code` | TEXT | Used for matching (e.g., HMXXXXXX) |
| `guest_name` | TEXT | Parsed from email |
| `guest_count` | INTEGER | Parsed from email |
| `check_in` | DATE | For reference only |
| `check_out` | DATE | For reference only |

---

## NAMED PROHIBITION — Date Range Booking Lookups

**This has been fixed. Do not reintroduce it.**

### Why date matching was removed from enrichment:
- Two properties can have bookings on the same dates
- Cleaning blocks have the same dates as adjacent bookings
- Date windows (±1 day) cause false matches

### The current approach:
- Enrichment matches by confirmation code ONLY
- iCal lookup uses `external_uid + property_id` (exact match)
- Date fallback in iCal is exact match only, same property only

### When Claude suggests date matching for enrichment:
Stop it immediately. Say: *"No date matching in enrichment. Code-only. See DECLARATION.md Law 2."*

---

## Hospitality Domain Rules

These are operational truths about the short-term rental domain.

### H1 — Same-Day Turnovers Are Standard
Checkout day is the same as the next guest's check-in day. This is intentional and normal.

### H2 — Blocked Dates Are Not Guest Bookings
"Not Available", "Closed Period", and "Airbnb (Not available)" events are owner-initiated blocks, not guest stays. They have no confirmation codes and are never enriched.

### H3 — Double-Booking Is a Crisis Event
Two active bookings on the same property with overlapping dates = critical alert.

### H4 — Cancellations Must Be Tracked Explicitly
When a booking's UID disappears from iCal, record it as cancellation.

### H5 — iCal Feeds Have Finite History Windows
Bookings may age out of feeds (6-12 months past). Don't treat this as cancellation.

### H6 — Dates Are Property-Local Not UTC
Hawaii is UTC-10. Store as noon UTC, display with timezone awareness.

### H7 — Confirmation Codes Are Platform-Scoped
Airbnb: `/^HM/i`. Lodgify: `/^B\d+/`. Match within connection, not globally.

### H8 — Guest Count From iCal Is Unreliable
iCal sends 1 as default. Only trust `enriched_guest_count` from email parsing.

---

## What Claude Must Never Do (Without Explicit Permission)

- Create new database tables or columns
- Create new API routes
- Refactor files not explicitly listed in the task
- Change idempotency logic
- Touch cron behavior
- Activate or extend `lib/connectors/`
- Add new npm packages
- Change RLS policies
- Modify any file in `scripts/migrations/`
- Create new pages or UI components beyond what is asked
- Add date-based matching to enrichment logic
- Modify `enriched_*` columns from iCal sync
- Modify `guest_name` from enrichment

---

## Quick Diagnostic Queries

### Check unenriched bookings
```sql
SELECT id, guest_name, enriched_guest_name, check_in::date,
       substring(raw_data->>'description' from '/details/([A-Z0-9]+)') as code
FROM bookings
WHERE is_active = true AND enriched_guest_name IS NULL AND check_in > NOW()
ORDER BY check_in;
```

### Check if facts exist for codes
```sql
SELECT confirmation_code, guest_name, check_in, connection_id
FROM reservation_facts
WHERE confirmation_code IN ('HMXXXXXX', 'HMYYYYYY')
ORDER BY created_at DESC;
```

### Check Gmail connection health
```sql
SELECT id, name, gmail_status, gmail_last_success_at, gmail_last_error_message
FROM connections WHERE gmail_refresh_token IS NOT NULL;
```

---

## Branding Guidelines

### B1 — CoHost Primary Brand Color
The official primary color for CoHost experiences is Coral (`#FA5A5A`). Use this exact hex code (e.g., `bg-[#FA5A5A]`, `text-[#FA5A5A]`) for primary buttons, important accents, and brand highlights when rendering CoHost-specific UI.

### B2 — CoHost Logo Lockup
The official full lockup image `public/cohost-logo-full.png` should be used for CoHost brand headers and landing pages, replacing the default NaviVerse branding on CoHost domains.
