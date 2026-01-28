# CONNECTIONS CONTRACT

**Version:** 1.0 (Draft)
**Date:** Jan 27, 2026

## 1. Purpose
This document defines the architectural boundaries, data flow guarantees, and functional limits of the Connections system. It serves as the immutable "source of truth" for how external platforms interact with the application. Its primary goal is to ensure the system remains a robust "Gmail-first" ingestion engine without creeping into direct PMS integrations or unauthorized booking mutations.

## 2. System Truth / Non-Negotiables
*   **Gmail-Only Ingestion:** We **only** ingest data via Gmail Labels. We **do not** and **will not** plug into Airbnb/VRBO/Booking.com APIs directly.
*   **Read-Only Authority:** The system treats external platform data (via email) as a source of *enrichment*, not a source of *inventory*.
*   **iCal Supremacy:** The `bookings` table (populated via iCal) is the absolute authority on calendar availability and property assignment. Email data never overrides iCal dates or property IDs.
*   **Workspace Isolation:** Every connection, message, and enrichment action is strictly scoped to a single `workspace_id`. Cross-workspace data leakage is a critical failure.
*   **Idempotency:** Sync operations must be replayable. The same email processed twice must result in the same state, without duplication.

## 3. Inputs
The system requires three verified inputs to function:
1.  **OAuth Context:** Valid Google OAuth2 access/refresh tokens with `gmail.readonly` scope.
2.  **Configuration:** A specific, verifiable **Gmail Label** (e.g., "Airbnb Guests") that the user has manually applied or filtered to relevant emails.
3.  **Execution Scope:** A valid `workspace_id` derived from the authenticated user's session.

## 4. Outputs
1.  **Master Log (`gmail_messages`):** 
    *   An append-only (logically), immutable store of raw email content, headers, and metadata.
    *   Acts as the audit trail for "what we saw".
2.  **Enrichment (`bookings` UPDATE):**
    *   **Action:** Updates *existing* rows in the `bookings` table.
    *   **Fields:** `guest_name`, `guest_count`, `guest_email`, `phone`, `metadata`.
    *   **Condition:** strict match on Confirmation Code OR (Property + Exact Import Dates).
3.  **Review Inbox (`enrichment_review_items`):**
    *   **Action:** Inserts new rows for human review.
    *   **Condition:** Valid reservation email parsed, but **NO** matching iCal booking found.

## 5. Consumers
*   **Reservation Enrichment:** The primary consumer. Parses extraction results to hydrate the calendar with human-readable guest details.
*   **Future Messaging Inbox:** (Planned) Will utilize stored `thread_id`, `message-id` headers, and body content to reconstruct conversation threads for the Unified Inbox.

## 6. Connection Types
*   **Classification Only:** The "Platform" dropdown in the UI (Airbnb, VRBO, Booking.com, PMS) is **metadata only**. 
*   **No Native APIs:** Selecting "Airbnb" does **NOT** activate an Airbnb API client. It merely tags the connection for better user organization and potentially hints at regex parsing strategies.
*   **Universal Mechanism:** All platforms are integrated exclusively via the **Gmail Label** ingestion pipeline.

## 7. Hard Guardrails (Must Never Do)
1.  **NEVER Create Bookings:** The email processor is strictly forbidden from performing `INSERT` operations on the `bookings` table. It cannot manufacture availability.
2.  **NEVER Modify Property ID:** Listing/Property assignment is determined solely by the iCal feed URL. Email heuristics (guessing which property "Apt 4" belongs to) are used for matching validation only, never for reassignment.
3.  **NEVER Leak Data:** A connection cannot process a message that has already been ingested by a Connection ID belonging to a different Workspace.

## 8. Definition of Done (Smoke Tests)
A release of the Connections system is considered healthy if:
1.  **Connect:** User can authenticate with Google, select a label, and see status "Connected".
2.  **Sync:** Clicking "Sync" imports new emails into `gmail_messages` with no errors.
3.  **Enrich:** A known, bare iCal booking (e.g., " Reserved") updates to show "Guest Name" after sync.
4.  **Guardrail:** Syncing a message already stored by another connection (in a different workspace) returns a `409 Conflict`.
5.  **Review:** Parsing a valid reservation email for a date *not* on the calendar creates an `enrichment_review_item`, NOT a phantom booking.
