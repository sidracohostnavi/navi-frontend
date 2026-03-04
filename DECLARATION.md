# DECLARATION.md — Navi CoHost System Doctrine
**Status:** Immutable Foundation  
**Authority:** This document supersedes all other context. When in conflict, this wins.

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

### Law 2 — Enrichment Guardrail
Auto-enrichment is only permitted when exactly ONE unenriched candidate booking exists for a given reservation fact.

**Candidate definition:** A booking is only a candidate if its guest name is masked/unenriched (e.g. "Reserved", "Blocked", null). An already-enriched booking is NEVER a candidate regardless of whether it shares the same check-in/checkout dates.

**Counting rule:** Only count unenriched bookings when evaluating whether to auto-enrich.
- `eligible_unenriched_count === 1` → auto-enrich safely
- `eligible_unenriched_count > 1` → route both to Review Inbox, do not auto-enrich either

**Timing rule:** Two unenriched bookings sharing identical dates across different properties is only ambiguous when both arrive simultaneously and are both unenriched. Once one is resolved/enriched, the other becomes the sole unenriched candidate and auto-enriches on the next cron run without human intervention.

**Absolute prohibitions:**
- Never count enriched bookings as candidates
- Never block auto-enrichment because an enriched booking shares the same dates
- Never overwrite a real human name with a platform placeholder
- Never reassign `property_id` via Gmail enrichment
- Never create duplicate Review Inbox items for the same confirmation code

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

### Law 12 — Multi-Feed Canonical Ownership
When multiple iCal feeds (Lodgify, Spark & Stay, Sidra A/C) report the same stay for the same property, exactly ONE booking record must exist. The first feed to create the booking owns the `external_uid` and `source_feed_id`. Subsequent feeds matching by date may only update `guest_name` if currently masked. They may never change `check_in`, `check_out`, `property_id`, or `external_uid`. The canonical ownership does not transfer between feeds after creation.

### Law 13 — Cleaning Blocks Are Not Guest Bookings
Policy-enabled properties (currently: Farmhouse Estate) have Airbnb automatically insert cleaning blocks before check-in and after checkout. These appear in iCal feeds as "Airbnb (Not available)" events. They must be stored as bookings with a visual distinction but are never enriched, never sent to Review Inbox, and never matched against reservation facts. Do not attempt to enrich or resolve cleaning blocks. Non-policy properties do not generate these blocks.

**Unenriched count clarification:** The following guest names appear as "unenriched" in SQL queries but are operational blocks that must never be enriched:
- `P********** T***` — Lodgify Preparation Time buffers (1-day padding around bookings)
- `Airbnb (Not available)` — Airbnb cleaning blocks on policy-enabled properties (Law 13)
- `Closed Period`, `Not Available` — Owner-initiated blocks (H2)

Only bookings with guest_name `Reserved` (Airbnb masked name) or similar platform placeholders are genuine unenriched guest bookings eligible for enrichment. When reporting enrichment statistics, distinguish real unenriched bookings from operational blocks.

### Law 14 — Enrichment Runs Every Cron Cycle
Gmail enrichment runs on every cron cycle regardless of whether iCal found changes. This ensures newly arrived bookings are enriched promptly without waiting for a coincidental iCal change. Previously gated — owner-authorized removal on 2026-03-04.

### Law 15 — Enrichment Fields Are Immutable to iCal Sync
iCal sync must never overwrite these fields on an existing booking, regardless of what the feed contains:
- `from_fact_id`
- `enriched_from_review`
- `enriched_manually`
- `connection_label_name`
- `connection_label_color`

These fields are set by the enrichment pipeline and Review Inbox. Once written, they survive all future iCal syncs. The merge pattern is: `{ ...sanitizedRawData, ...preservedEnrichmentFields }` where preserved fields always win over iCal data.

### Law 16 — Booking Identity Is (external_uid, property_id)
The canonical identity of a booking is the tuple `(external_uid, property_id)`. This is the only valid primary lookup key. If `external_uid` is absent, fall back to exact date match (`check_in = X AND check_out = Y`, day-level string comparison, no window) on the same property only. A booking matched by date on property A must never be updated by a feed belonging to property B. This law extends and strengthens the Named Prohibition on date range lookups below.

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
| Cron | `app/api/cron/enrichment/`, `app/api/cron/refresh/` | Stabilization in progress — handle with extra care |

---

## Current Stability Status

- **Manual sync:** Stable
- **Cron sync:** Stabilized — log noise fixed, Gmail gate restored, Airbnb +1 day checkout offset reverted (iCal and email dates already agree — the +1 was wrong and introduced mismatches)
- **Enrichment under cron:** Guardrail correctly counts only unenriched candidates. However no booking has been auto-enriched by cron since launch. Retroactive enrichment requires manual backfill or Review Inbox.
- **Enrichment dedup:** Fixed — Review Inbox no longer creates duplicate items per confirmation code
- **Review Inbox enrichment survival:** Fixed — iCal sync now preserves from_fact_id and enrichment fields (Law 15)
- **Calendar colors and labels:** Fixed — from_fact_id pipeline working, backfill completed for existing bookings
- **Cleaner role:** Implemented — read-only calendar view, pastel coral booking slots, mobile and desktop
- **Hydration/SSR fix:** Deployed — IS_MOBILE now uses useEffect to prevent server/client mismatch on load
- **Messaging:** Partially built — human-in-the-loop draft system exists, auto-send not yet enabled
- **OPEN ISSUE:** Farmhouse Spark & Stay bookings exist in DB (is_active=true) but do not appear in calendar API response. Lodgify bookings for same property display correctly. Root cause unidentified — under active investigation.
- **OPEN ISSUE:** No booking has been auto-enriched by cron pipeline since system launch. Manual backfill and Review Inbox have been the only enrichment paths in practice.

---

## Key Type Definitions (Use These Exactly)

From `lib/supabase/cohostTypes.ts`:

| Type | Values |
|------|--------|
| `TicketStatus` | `'new' \| 'drafted' \| 'approved' \| 'sent' \| 'escalated'` |
| `MessageDirection` | `'inbound' \| 'outbound'` |
| `RiskLevel` | `'low' \| 'med' \| 'high'` |
| `WorkspaceRole` | `'owner' \| 'admin' \| 'operator'` |

⚠️ **Known Type Debt — Do Not Activate:**  
`cohostTypes.ts` contains `PmsType = 'hostaway' | 'guesty' | 'hospitable'` and a `pms_type` field on `CohostProperty`. These are dormant leftovers from an over-build. Do not reference, extend, or wire up anything related to `PmsType`. Treat it as dead code.

From `lib/services/email-classifier.ts`:  
Classification is deterministic regex only — no AI, no external calls. `is_reservation_candidate: true` is the only gate to enrichment processing. Do not add AI or probabilistic logic to this file.

Gmail status values on `connections` table: `'connected' | 'error' | 'pending' | 'needs_reconnect'`  
Token refresh failure → `needs_reconnect` (never silently continue).

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

---

## Known Architecture Risk — Root Cause of Duplicates

`lib/services/ical-processor.ts` uses a **find-then-insert** pattern, NOT a true SQL `ON CONFLICT` upsert.

The existing booking lookup inside `syncFeed` queries by a **date range window (±1 day)**, not by the canonical identity tuple `(property_id, source_type, external_uid)`. This means: if the date window query returns 0 results for any reason (date shifted, race condition, cron parallelism), it **inserts a new booking instead of updating** → duplicate.

The Calendar Contract states identity is `(property_id, source_type, external_uid)`. The lookup does not use this. **Do not touch this logic without explicit instruction.** When the time comes to fix it, look up by `external_uid + property_id + source_type` first, then fall back to date range only if no UID match exists.

---

## Key Service Behaviors (Read Before Touching These Files)

**`ical-processor.ts → syncFeed()`:**
- Loads facts scoped to property via `connection_properties` join
- Enriches at sync time only when `factMatches.length === 1`
- Preserves existing real guest names — will not overwrite with masked name
- Find-then-update/insert pattern (NOT SQL upsert) — see risk above

**`email-processor.ts → enrichBookings()`:**
- Guardrail correctly implemented: only enriches when `eligible_unenriched_matches.length === 1`
- Routes to `enrichment_review_items` on ambiguity or no match
- Never writes `property_id` — only `guest_name`, `guest_count`, `guest_first_name`, `guest_last_initial`
- UPDATE only — never inserts bookings

**`email-processor.ts → processMessages()`:**
- Classify first → only `reservation_confirmation` proceeds to parse
- Always stores raw to `gmail_messages` regardless of classification
- Idempotent: checks `source_gmail_message_id` before inserting facts

**`email-classifier.ts`:**
- Pure deterministic regex — no AI, no external calls, no side effects
- Blocklist checked before confirmation patterns
- Do NOT add probabilistic or AI logic to this file

---

## NAMED PROHIBITION — Date Range Booking Lookups

**This has been fixed multiple times. Do not reintroduce it.**

The booking lookup in `ical-processor.ts → syncFeed()` must use `external_uid + property_id + source_type` as the primary key — not date ranges.

### Why agents keep writing ±1 day / date windows:
Dates in `bookings` are stored as noon UTC timestamps (e.g. `2026-01-15T12:00:00.000Z`). Agents see timestamps and assume exact equality is unsafe due to timezone drift, so they write range queries (`gte check_in`, `lt nextDay`). This reasoning is wrong for this system.

### Why it is wrong here:
- The iCal `external_uid` is a stable string identifier (e.g. `airbnb_1234567890`). String equality on it is exact and safe.
- Date range windows introduce ambiguity when two bookings at different properties share the same dates — which is a normal, expected state in a multi-property system.
- Date range windows are also vulnerable to cron race conditions.

### The correct lookup order (do not deviate):
1. Look up by `external_uid + property_id + source_type` — exact string match
2. If and only if no UID match → fall back to exact date match (`check_in = X AND check_out = Y`, day-level string comparison, no window)
3. Never use ±1 day, `nextDay`, or any date window in booking identity lookups

### When Claude suggests a date window for booking lookups:
Stop it immediately. Say: *"No date windows. Look up by external_uid first. See DECLARATION.md."*

---

## Hospitality Domain Rules

These are operational truths about the short-term rental domain. They are not immutable system laws but must be respected in all feature design, display logic, and data handling.

### H1 — Same-Day Turnovers Are Standard
Checkout day is the same as the next guest's check-in day. This is intentional and normal in this business. The calendar must support back-to-back bookings without treating checkout day as a gap or unavailable slot. Cleaning is handled via Airbnb policy defined at the listing level — not by Navi.

### H2 — Blocked Dates Are Not Guest Bookings
"Not Available", "Closed Period", and "Airbnb (Not available)" events are owner-initiated blocks, not guest stays. They must never trigger guest messaging, enrichment attempts, or Review Inbox items. They are displayed on the calendar as **charcoal grey** blocks (distinct from the light grey of unenriched guest reservations). They are stored with `source_type = 'block'` to distinguish them from guest bookings.

### H3 — Double-Booking Is a Crisis Event
If two active bookings exist for the same property on overlapping dates from different platforms, this is a double-booking — the most operationally damaging failure in multi-platform hosting. The system must detect this on every iCal sync and surface it immediately as a critical alert. It must never be stored silently. Detection query: any two active bookings on the same property where date ranges overlap.

### H4 — Cancellations Must Be Tracked Explicitly
When a booking's UID disappears from its iCal feed, that is a cancellation. Setting `is_active = false` is not sufficient. The system must record: cancellation timestamp, which feed reported the removal, and surface a freed-dates alert so the host can re-open availability. Past bookings must never be silently deactivated without a cancellation record.

### H5 — iCal Feeds Have Finite History Windows
Airbnb and Lodgify iCal feeds expose a rolling window of bookings (typically 6-12 months past, 12-24 months future). A booking disappearing from a feed does not always mean cancellation — it may have aged out of the window. The system must never deactivate a past booking (check_out < today) solely because it no longer appears in the feed. Past bookings are frozen records. Only future bookings should be evaluated for cancellation when their UID goes absent.

### H6 — Dates Are Property-Local Not UTC
A check-in date of "July 7" means July 7 at the property's local timezone — not UTC midnight. All date display in the UI must use the property's local timezone. Hawaii properties (HST, UTC-10) are particularly affected — a UTC midnight timestamp renders as the previous day local time. Dates stored as noon UTC (`T12:00:00Z`) are a safe approximation for Hawaii but must be displayed with timezone awareness, not raw UTC.

### H7 — Confirmation Codes Are Platform-Scoped
Airbnb Spark & Stay codes match `/^HM/i`. Lodgify codes match `/^B\d+/`. Other platforms have their own formats. Confirmation code lookups during enrichment must be scoped to the connection/platform — never matched globally across all connections. Two bookings from different platforms could theoretically share the same code format. Always pair confirmation code with connection_id when looking up reservation facts.

### H8 — Guest Count From iCal Is Unreliable
When a booking arrives with `guest_count = 1` from iCal, treat it as unknown — not as confirmed single occupancy. Airbnb sends 1 as a default when the actual count is unavailable. Displaying "1 guest" when the count is genuinely unknown misrepresents the booking. The UI should show guest count only when it has been confirmed via email enrichment or manual entry. Until then, display no count or a "?" indicator.
