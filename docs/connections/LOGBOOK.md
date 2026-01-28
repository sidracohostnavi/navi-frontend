# Connections System Logbook

**Purpose:** A chronological record of changes, decisions, and system state for the Connections module.
**Maintained By:** Engineering

---

## **Entry: Jan 27, 2026**
**Activity:** System Audit & Documentation Baseline

### What Changed
*   **Documentation Suite:** Created `system_snapshot.md`, `CONNECTIONS_CONTRACT.md`, `ARCHITECTURE.md`, `RESTORE_PLAN.md`, and `ROADMAP.md`.
*   **No Code Changes:** Strictly read-only analysis of `app/cohost/connections` and `lib/services`.

### Decisions & Why
*   **Decision:** Freeze all feature development to establish an immutable "Contract".
*   **Why:** There was ambiguity regarding "PMS Integrations" vs "Gmail Ingestion". We clarified that *all* connections are Gmail-based. We also needed to document the "iCal Supremacy" rule (emails never create bookings) to prevent future architectural drift.

### Current State
*   **Works:** Airbnb email ingestion, iCal matching (Code/Date), Review item creation for misses.
*   **Broken/Confusing:**
    *   "Connection not found" error is generic and hides true causes (Workspace mismatch vs Auth vs ID missing).
    *   "Platform" dropdown implies API integration, but backend treats everything as Airbnb-style regex. Non-Airbnb emails (VRBO) likely fail parsing silently.

### Next Step
*   **Action:** Execute **Phase 0** of the Roadmap: Stabilize error handling and UI feedback.

---

## **Entry: Jan 24, 2026**
**Activity:** Connection Scoping & Security Audit

### What Changed
*   **Analysis:** Audited `connections` table for workspace isolation.
*   **Planning:** Identified valid/invalid states for `api/cohost/connections` routes.

### Decisions & Why
*   **Decision:** Enforce `workspace_id` checks on *every* route (Start, Callback, Sync).
*   **Why:** To prevent "Cross-Workspace Leakage" where User A could theoretically sync User B's emails if IDs were guessed. Security non-negotiable.

### Current State
*   **Works:** RLS policies prevent cross-user access.
*   **Risks:** Legacy code might default to "User ownership" instead of "Workspace ownership"; migration path defined.

---

## **Entry: Jan 23, 2026**
**Activity:** Fix "Spark & Stay" Connection & Enrichment Logic

### What Changed
*   **Service:** Updated `GmailService.verifyConnection` (v2) to strictly validate Label existence in Gmail during the OAuth callback.
*   **Logic:** Implemented `EmailProcessor.enrichBookings` to match Reservation Facts -> iCal Bookings.
*   **Bug Fix:** Resolved issue where connections stayed "DISCONNECTED" despite valid tokens.

### Decisions & Why
*   **Decision:** "iCal Supremacy" Pattern.
*   **Why:** We discovered that creating bookings from emails led to duplicates and "ghost bookings". We decided `bookings` table is strictly for iCal feeds, and emails only *UPDATE* metadata (Guest Name, Count).

### Current State
*   **Works:** The "Spark & Stay" test connection successfully transitioned to CONNECTED. Guest names are populating on the calendar.
*   **Broken:** Sync concurrency was an issue (race conditions); partially addressed with simple loc kbut needs robust Redis/DB lock in future.

---

## **Entry: Jan 22, 2026**
**Activity:** Raw Ingestion Architecture

### What Changed
*   **Schema:** Created `gmail_messages` (Raw Log) and `reservation_facts` (Parsed Data) tables.
*   **Ingestion:** Built `EmailProcessor.fetchGmailMessages` to download emails via OAuth.

### Decisions & Why
*   **Decision:** Split processing into "Ingest (Raw)" and "Parse (Fact)" stages.
*   **Why:** To allow re-parsing. If our Regex improves, we can re-run parsing on stored `gmail_messages` without hitting Google API limits or losing historical data.

### Current State
*   **Works:** Raw HTML/Text storage. Capturing "Reservation confirmed" emails.
*   **Limited:** Only supports Airbnb subject lines.

---
