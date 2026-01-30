# System Snapshot: Connections System
**Date:** January 28, 2026
**Version:** 0.8.0
**Status:** Functional

## 1. Overview
The Connections system manages external integrations (primarily Gmail) for "CoHosting" workflows. It handles OAuth lifecycles, token storage (encrypted/secured), and the "Label Logic" that defines which emails are ingested.

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **Connection List** | `app/cohost/connections/page.tsx` | (Implied) List of active connections. Status indicators (Connected/Disconnected). |
| **Start OAuth** | `/api/cohost/connections/[id]/gmail/start` | OAuth2 init endpoint. Redirects to Google. |
| **Callback** | `/api/cohost/connections/gmail/callback` | OAuth2 callback handler. Exchanges code for Refresh Token. |

### Backend Services
| Service | Path | Description |
|---------|------|-------------|
| **EmailProcessor** | `lib/services/email-processor.ts` | The consumer of connections. Uses `gmail_refresh_token` to fetch emails from a specific Label. |

### Database Schema
| Table | Key Columns | Role |
|-------|-------------|------|
| `connections` | `id`, `workspace_id`, `type`, `reservation_label`, `gmail_refresh_token`, `gmail_status` | The configuration of an integration. |

## 3. Data Flow

### OAuth Flow
1. **User Action:** Clicks "Connect Gmail" on a connection.
2. **Start Route:** 
   - Verifies `workspace_id` scope.
   - **Crucial Check:** Verifies `reservation_label` exists.
   - Redirects to `accounts.google.com`.
3. **Google:** User approves `gmail.readonly` scope.
4. **Callback Route:**
   - Receives `code`.
   - Exchanges for `refresh_token`.
   - Updates `connections` table: `gmail_status='connected'`, `gmail_refresh_token=...`.
5. **Redirect:** Back to `start_url` (or dashboard).

### Ingestion Flow
1. **Trigger:** Cron or Manual Refresh.
2. **Lookup:** `EmailProcessor` finds all `connected` connections.
3. **Fetch:** Uses `gmail_refresh_token` to list messages in `reservation_label`.
4. **Process:** Downloads & Parses emails -> `gmail_messages`.

## 4. Key Configurations
- **Label Based Discovery:** We do NOT blindly scrape the Inbox. We *strictly* only read emails that the user has filtered into the configured `reservation_label` (e.g. "Airbnb" or "Reservations").
- **Provider Agnostic:** The system doesn't rigidly encode "Airbnb" vs "VRBO" at the connection level. The connection is just a pipe to Gmail. The *content* of the email determines the source.

## 5. Security Posture
- **Tokens:** Refresh tokens are sensitive. Stored in `connections` table (RLS protected).
- **Scope:** `workspace_id` is enforced on every read/write.
- **Isolation:** A connection belongs to a workspace; users in other workspaces cannot use its token.
