# Connections System Roadmap

**Status:** Living Document
**Owner:** Engineering
**Last Updated:** Jan 27, 2026

This roadmap guides the evolution of the Connections system from its current state (Airbnb-biased Gmail Ingestion) to a robust, platform-agnostic system capable of supporting messaging.

---

## Phase 0: Stabilize & Audit
**Goal:** Ensure the current system is rock-solid, debuggable, and transparent to the user before adding new features. Fix current confusion around "Connection not found" errors.

### Task 0.1: Explicit Error Handling for "Connection Not Found"
*   **Goal:** Differentiate between "ID does not exist", "Wrong Workspace", and "Auth Failed" in API responses to aid debugging.
*   **Allowed Files:** `app/api/cohost/connections/[id]/gmail/start/route.ts`, `app/api/cohost/connections/gmail/callback/route.ts`
*   **Validation:** Use Postman/Curl to trigger 404 (bad ID), 403 (wrong workspace), and 401 (no auth) and verify distinct JSON error messages.
*   **Rollback:** Revert route changes to generic error handling.

### Task 0.2: UI Status Clarity
*   **Goal:** Make the UI explicitly show *why* a connection is disconnected (e.g., "Label Missing" vs "Token Expired").
*   **Allowed Files:** `app/cohost/settings/connections/page.tsx`
*   **Validation:** Manually revoke a Google Token, refresh page, and ensure status says "Token Expired" or similar.
*   **Rollback:** Revert UI component changes.

---

## Phase 1: Platform-Agnostic Ingestion
**Goal:** Decouple the ingestion logic from Airbnb-specific regexes so that VRBO, Booking.com, and generic "Direct Booking" labels work seamlessly.

### Task 1.1: Broaden Subject Line Regex (Option A)
*   **Goal:** Support generic confirmation emails by relaxing the strict "Reservation confirmed" subject check.
*   **Implementation:** Update `EmailProcessor.parseReservationEmail` to accept `You have a new booking`, `Payment received`, `New reservation`, or fallback to body analysis.
*   **Allowed Files:** `lib/services/email-processor.ts`
*   **Validation:**
    1.  Create a "VRBO" connection in UI.
    2.  Send a test email with subject "You have a new booking!" to the labeled Gmail.
    3.  Run Sync.
    4.  Verify data appears in `gmail_messages` and `enrichment_review_items`.
*   **Rollback:** Revert regex to `/Reservation confirmed/i`.

### Task 1.2: UI Guidance Update
*   **Goal:** Update user instructions to reflect that *any* label works, not just "Airbnb".
*   **Implementation:** Change helper text under Gmail Label input.
*   **Allowed Files:** `app/cohost/settings/connections/page.tsx`
*   **Validation:** Visual check of the settings page.
*   **Rollback:** Revert copy changes.

---

## Phase 2: Messaging Readiness
**Goal:** Prepare the data layer to support a full "Unified Inbox" feature by ensuring we capture enough metadata during ingestion.

### Task 2.1: Thread ID & Header Storage
*   **Goal:** Ensure we persist `threadId` and `Message-ID` headers to allow threading of replies later.
*   **Current State Check:** We currently store `raw_metadata` json.
*   **Implementation:** Verify `raw_metadata` includes `threadId`. If not, explicitly add it to the `insert` payload in `EmailProcessor`.
*   **Allowed Files:** `lib/services/email-processor.ts`
*   **Validation:** Inspect a row in `gmail_messages` and confirm `raw_metadata->threadId` is present and valid.
*   **Rollback:** Revert `EmailProcessor` change.

### Task 2.2: Body Storage Format Review
*   **Goal:** Ensure stored HTML/Text body is sufficient for displaying a readable conversation view.
*   **Implementation:** Verify we aren't aggressively stripping essential formatting (like paragraph breaks) in `gmail_messages` storage.
*   **Allowed Files:** `lib/services/email-processor.ts`
*   **Validation:** Retrieve a stored message and render it in a simple test page or online HTML viewer. Must look readable.
*   **Rollback:** Revert storage logic.

---

## Acceptance Tests (Gatekeepers)
No phase is considered complete until these pass:
1.  **The "Airbnb Smoke Test":** Existing Airbnb connections continue to sync and enrich correctly (regression test).
2.  **The "VRBO Smoke Test":** A simulated VRBO email with a different subject line is successfully ingested (Task 1.1).
3.  **The "Isolation Test":** Data from Connection A never appears in the review queue for Connection B.
