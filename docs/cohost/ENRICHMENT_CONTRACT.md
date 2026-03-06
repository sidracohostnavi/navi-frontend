# Guardrail: Auto-Enrichment Must Require a Single Unambiguous Target

## Purpose
Prevent Gmail enrichment from assigning the wrong guest name / guest count to the wrong property when multiple bookings share the same check-in/check-out window (common during onboarding/import). Preserve “steady-state rhythm” where new iCal bookings and Gmail emails arrive close together and enrichment is reliable.

## Definitions

*   **Masked / Unenriched booking**: A booking is considered unenriched if its `guest_name` is missing or a placeholder/platform string (e.g., “Reserved”, “Guest”, “Airbnb (via Lodgify)”, confirmation-code-like strings), and/or it lacks trusted guest metadata (`guest_first_name`, `guest_last_initial`, `guest_count` as applicable).
*   **Candidate booking**: A booking that could plausibly match a reservation fact based on:
    *   Same `workspace`
    *   Date window match (`check-in`/`check-out` dates)
    *   Optional: `confirmation_code` match (highest confidence)
*   **Ambiguous match**: More than one unenriched candidate booking exists for the same reservation fact within the matching rules below.

## Core Rule (Non-Negotiable)
✅ **Auto-enrichment is allowed ONLY when exactly one valid unenriched candidate booking exists.**

If the system cannot identify a single correct target booking with certainty, it must not enrich automatically and must route to Review Inbox.

## Matching Priority Order

### 1. Confirmation code match (highest confidence)
If the reservation fact has `confirmation_code`, and an iCal event/booking contains it (summary/description/external_uid/canonical_uid), use this first.
*   If confirmation-code matching yields **exactly one** target booking → **enrich**.
*   If it yields **multiple** targets → **Review Inbox**.

### 2. Date window match (fallback, controlled)
*Only used when confirmation-code match is not available.*
*   Date match uses `check-in` date AND `check-out` date (not overlap).
*   Date-only matching is permitted ONLY under the guardrail below (single-unenriched-target rule).

## Guardrail Logic (Required)

When processing a reservation fact (or attempting enrichment for a booking):

1.  **Build the candidate set:**
    *   Filter to the same `workspace_id`
    *   Match exact `check_in` and `check_out` dates (day-level match)
    *   Include bookings across relevant properties (connection scope), but **do not pick a property by guessing**.

2.  **Reduce candidate set to eligible unenriched targets:**
    *   Keep only bookings where current guest data is masked/placeholder (unenriched).
    *   Exclude bookings that already have a real human name (enriched).

3.  **Decide outcome:**
    *   If `eligible_unenriched_count == 1` → **Auto-enrich** that booking with the fact’s `guest_name` / `guest_count`.
    *   If `eligible_unenriched_count == 0` → **Do nothing** (already enriched or no target exists).
    *   If `eligible_unenriched_count > 1` → **Do NOT auto-enrich.** Create a **Review Inbox item** capturing:
        *   fact id / connection id
        *   candidate booking ids + property_ids
        *   check_in/check_out
        *   parsed guest name/count
        *   reason: “Ambiguous: multiple unenriched bookings match date window”

## Steady-State / Rhythm Behavior (What This Enables)
Even if multiple properties have bookings on the same date window, auto-enrichment still works in steady state because:
*   previously existing bookings are already enriched (not eligible)
*   the new incoming booking is the only unenriched candidate → `eligible_unenriched_count becomes 1` → **safe auto-enrichment proceeds.**

## Optional Accuracy Booster (Allowed but not Required)
If timestamps exist:
*   Prefer candidates whose `booking.created_at` is closest to the Gmail email `received_at` (within a threshold like 24h).
*   This can be used as a tie-breaker **ONLY if it results in a single target**; otherwise still Review Inbox.

## Absolute Prohibitions 🚫
1.  **Never** enrich by “first match wins” across multiple properties.
2.  **Never** enrich when more than one unenriched candidate exists.
3.  **Never** overwrite a real human guest name with a platform placeholder or a generic “Guest/Reserved”.
4.  **Never** reassign `property_id` via Gmail enrichment (property comes only from iCal).
