# Connections System Snapshot (Read-Only Audit)

**Date:** Jan 27, 2026
**Scope:** `app/cohost/settings/connections`, `app/api/cohost/connections`, `lib/services/email-processor.ts`, `lib/services/gmail-service.ts`, DB tables.

---

## 1. Connection Types & Eligibility

### Platform Values
List of values currently supported in the `connections.platform` column (derived from UI dropdown):
- `airbnb` (UI Label: "Airbnb")
- `vrbo` (UI Label: "VRBO")
- `booking` (UI Label: "Booking.com")
- `pms` (UI Label: "PMS Integration")

### Gmail OAuth Eligibility
**Current Definition:**
Any connection is treated as "Gmail OAuth eligible" provided:
1. It exists in the database.
2. It belongs to the current user's active workspace.
3. The `provider` column is either `null` (default) or strictly `'gmail'`.

**Note:** The UI currently sets `platform` but leaves `provider` as default. Thus, **ALL** platform types (Airbnb, VRBO, etc.) are currently eligible for Gmail connection.

### "Connection not found" Causes
The API route `/api/cohost/connections/[id]/gmail/start` returns specific errors for these distinct failure modes:

| Check | Error Message | HTTP Code | Cause |
| :--- | :--- | :--- | :--- |
| **Auth** | `Unauthorized` | 401 | User not logged in. |
| **Workspace** | `No active workspace found` | 403 | User has no active workspace context. |
| **Existence** | `Connection not found` | 404 | Connection ID does not exist. |
| **Ownership** | `Connection belongs to a different workspace` | 403 | Connection `workspace_id` != User's active `workspace_id`. |
| **Provider** | `Connection provider mismatch` | 400 | `connection.provider` is set to something other than `'gmail'` (rare/legacy). |

---

## 2. UI → API Wiring Map

Most platform types follow the exact same wiring pattern.

| Platform | Button Label | Action URL / Route | Prerequisites (Frontend) | Prerequisites (Backend Verify) |
| :--- | :--- | :--- | :--- | :--- |
| **Airbnb** | Connect / Reconnect | `GET /api/cohost/connections/[id]/gmail/start` | `display_email` (saved) | `reservation_label` must be set, else `LABEL_NOT_CONFIGURED` error. |
| **VRBO** | Connect / Reconnect | `GET` (Same as above) | `display_email` (saved) | Same as above. |
| **Booking** | Connect / Reconnect | `GET` (Same as above) | `display_email` (saved) | Same as above. |
| **PMS** | Connect / Reconnect | `GET` (Same as above) | `display_email` (saved) | Same as above. |

**Synced State:**
- Once connected (`gmail_status === 'connected'`), the button changes to **"Sync Now"**.
- **Action:** `POST /api/cohost/connections/[id]/sync`
- **Effect:** Triggers `EmailProcessor.processMessages` and `enrichBookings`.

---

## 3. Data Flow Diagram (Gmail-only path)

1.  **Create Connection (UI)**
    *   User fills form (Platform, Email, Name, **Gmail Label**).
    *   Data inserted into `connections` table.

2.  **OAuth Start**
    *   User clicks "Connect".
    *   Redirects to `/gmail/start`.
    *   Redirects to Google OAuth verification.

3.  **OAuth Callback (`/gmail/callback`)**
    *   Exchanges code for `access_token` / `refresh_token`.
    *   Updates `connections` table with tokens.
    *   **Trigger Verification:** Calls `GmailService.verifyConnection`.
        *   Checks if `reservation_label` is configured in DB.
        *   Fetches User's Labels from Gmail API.
        *   **Validation:** verifiable existence of the label text in Gmail account.
        *   **Result:** Updates `gmail_status` to `'connected'` or `'error'`.

4.  **Sync Operation**
    *   **Fetch:** `EmailProcessor` uses `reservation_label` to query Gmail API.
    *   **Parse:** Downloads messages, checks Subject for "Reservation confirmed" or "Booking confirmed".
    *   **Store:** Inserts raw content into `gmail_messages` (Idempotent: skips if exists).
    *   **Extract:** Parses body for Guest Name, Check-in/out, Code.
    *   **Persist (Future Only):** Writes to `reservation_facts` table.

5.  **Enrichment (Calendar Display)**
    *   **Match:** Compares `reservation_facts` against `bookings` table (Source of Truth: iCal).
    *   **Logic:** Matches on **CONFIRMATION CODE** (Strong) or **EXACT DATES** (Weak).
    *   **Update:** Updates `bookings.guest_name`, `bookings.guest_count`.
    *   **Constraint:** **"Gmail never creates bookings; iCal is source of truth."**
    *   **Review Items:** If email is valid/future but NO booking match found -> Creates `enrichment_review_items` (Pending Review).

---

## 4. Current Guardrails Inventory

| Guardrail | Trigger Point | Blocks | Error Code / Response |
| :--- | :--- | :--- | :--- |
| **Workspace Lock** | API Routes (Start/Callback/Sync) | Cross-workspace access | 403 `Connection belongs to a different workspace` |
| **Missing Label Config** | Verification / Sync | Connecting without target label | `connected: false`, Code: `LABEL_NOT_CONFIGURED` |
| **Label Not in Gmail** | Verification | Connecting to non-existent label | `connected: false`, Code: `LABEL_NOT_FOUND` |
| **Label Conflict** | Sync (`checkForLabelConflict`) | Two connections using same label in workspace | 409 `LABEL_CONFLICT`, "Label X is already being used..." |
| **Cross-Connection Isolation** | Sync (Processing) | Processing message already owned by other connection | 409 `CROSS_CONNECTION_MESSAGE_SEEN`, "Message ... already processed by another connection" |
| **Sync Concurrency** | Sync Route | Parallel sync requests for same ID | 409 `SYNC_IN_PROGRESS` |
| **Booking Creation Block** | Enrichment | Creating bookings from email | **System Design**: Code strictly uses `update` on `bookings` table. Review items created for misses. |

---

## 5. Known Misalignment With Desired Product

### Current Behavior vs Desired
- **Current:** The "Platform" dropdown (`Airbnb`, `VRBO`, etc.) is currently purely cosmetic. It does not change the parsing logic or the connection flow. All connections rely on the generic "Reservation confirmed" subject line regex.
- **Desired:** Support "Gmail label ingestion for any platform label".
- **Gap:**
    - The regex `Reservation confirmed|Booking confirmed` (in `EmailProcessor.ts`) is biased towards Airbnb. VRBO or other platforms might use different subject lines (e.g., "Payment receipt", "New booking from...").
    - The system works perfectly if the user manually creates a Gmail label (e.g. "My Guests") and filters emails into it, but it might fail to parse non-Airbnb email formats due to the hardcoded subject regex.

### Minimal Fix Options

**Option A (Parsing Broadening) - Recommended Minimal Fix**
To strictly support "Gmail label ingestion for any label" without full integration:
1.  **Relax Subject Regex:** Update `EmailProcessor.parseReservationEmail` to accept a broader range of subject lines (e.g., just check if body contains dates/names, or allow "Notification", "New Booking").
2.  **UI Tweak:** Update the helper text under "Gmail Label" in `page.tsx`. Current: "The Gmail label where reservation emails are stored." -> New: "The Gmail label containing booking confirmation emails."

**Option B (Regex per Platform)**
1.  Use the `platform` field (Airbnb/VRBO) to select a different regex in `EmailProcessor`.
    *   If `Airbnb` -> `/Reservation confirmed/`
    *   If `VRBO` -> `/You have a new booking/`
2.  Pass `platform` context to `processMessages`.

**Option C (No Change / User Training)**
1.  Keep code as is.
2.  Instruct users: "You must create a Gmail filter that applies your chosen label ONLY to emails with subject 'Reservation confirmed'". (High friction).

**Recommendation:** Option A is the minimal code change to support broader "Any Platform" ingestion via labels.
