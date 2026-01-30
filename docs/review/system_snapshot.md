# System Snapshot: Review Inbox
**Date:** January 28, 2026
**Version:** 0.5.0
**Status:** Beta (Backend Logic Active, UI In Progress)

## 1. Overview
The **Review Inbox** (or "Missing Bookings" queue) is a safety net for the automation system. It captures "Reservation-like" emails that could not be automatically matched to the Calendar (iCal). This ensures that no booking is lost even if the sync fails or the iCal feed is delayed.

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **Review List** | `app/cohost/review/page.tsx` | (Planned) A list of "Potential Bookings" requiring human action. |
| **Action Modal** | `ReviewActionModal` | (Planned) UI to "Create Booking", "Ignore", or "Link to Existing". |

### Backend Services
| Service | Path | Description |
|---------|------|-------------|
| **EmailProcessor** | `lib/services/email-processor.ts` | Detects "Orphaned Facts". If it finds a Confirmation Code + Guest Name but NO matching iCal event, it creates a Review Item. |

### Database Schema
| Table | Key Columns | Role |
|-------|-------------|------|
| `enrichment_review_items` | `id`, `workspace_id`, `connection_id`, `extracted_data`, `status` | Stores the raw data of the unmatched reservation. |

## 3. Data Flow

### Detection
1. **Ingest:** Email arrives -> `gmail_messages`.
2. **Parse:** Facts extracted (Check-in, Code, Name).
3. **Match Attempt:** System checks `bookings` table for Code match OR Date match.
4. **Failure:** No match found (e.g. iCal hasn't updated yet).
5. **Capture:** System inserts row into `enrichment_review_items` with `status='pending'`.

### Resolution (Human)
1. **View:** User sees "Missing Booking: John Doe, Jan 25".
2. **Action:**
   - **Wait:** If iCal just needs time, user waits. Next sync might auto-resolve (future feature).
   - **Force Create:** User clicks "Create Manual Booking". System inserts into `bookings` (source='manual').
   - **Dismiss:** User clicks "Ignore" (it was a cancellation or spam). Item set to `ignored`.

## 4. Key Configurations
- **Idempotency:** We track `gmail_message_id` to prevent creating duplicate review items for the same email.
- **Safety:** Review Items NEVER automatically write to the `bookings` table. They require human or explicit logic approval.

## 5. Known Constraints
- **Scanning:** Currently happens during the Email Process run.
- **Auto-Resolve:** We do not yet auto-delete the review item if the iCal subsequently arrives (manual cleanup for now).
