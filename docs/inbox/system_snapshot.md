# System Snapshot: Unified Inbox (Messaging)
**Date:** January 28, 2026
**Version:** 0.9.0
**Status:** Beta (Read/Write)

## 1. Overview
The Unified Inbox aggregates guest communication from multiple sources (Airbnb, VRBO via email relay, SMS, etc.) into a single queue. It uses AI to draft potential responses (`drafted` status) and flag high-risk messages (`escalated`).

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **Inbox List** | `app/cohost/messaging/inbox/InboxClient.tsx` | Main interface. Filtering by status (New, Drafted, Escalated). Status badges and risk scores. |
| **Thread View** | `app/cohost/messaging/messages/[id]` | (Implied) Detail view to read full conversation and approve/send replies. |

### Backend Services
| Service | Path | Description |
|---------|------|-------------|
| **Ingestion** | `lib/services/email-processor.ts` | (Primary) Parses incoming emails from Airbnb/PMS and inserts them as `cohost_messages`. |
| **AI Draft** | (Background Job) | Analyzes inbound messages, assigns `risk_score`, `category`, and generates a `draft` response. |

### Database Schema
| Table | Key Columns | Role |
|-------|-------------|------|
| `cohost_messages` | `id`, `conversation_id`, `body`, `status`, `direction`, `risk_score` | Individual message units. |
| `cohost_conversations` | `id`, `property_id`, `guest_name`, `pms_type`, `external_thread_id` | Aggregates messages into a thread. Links to Property. |

## 3. Data Flow

### Ingestion (Inbound)
1. **Source:** Email arrives (e.g. from `user-123@guest.airbnb.com` to `host@navicohost.com`).
2. **Process:** `EmailProcessor` parses body, extracts Guest Name and Message.
3. **Thread:** Looks up existing `cohost_conversation` or creates new.
4. **Insert:** Inserts `cohost_message` with `status='new'`.
5. **Enrich:** AI worker (future/current) runs sentiment analysis -> updates `risk_score`.

### Response (Outbound)
1. User types reply or approves AI draft in UI.
2. **Send:** System sends email *back* to the proxy address (`user-123@guest.airbnb.com`).
3. **Platform:** Airbnb receives email and posts it to the guest chat.
4. **Update:** Message status changed to `sent`.

## 4. Key Configurations
- **AI Threshold:** `risk_score > 66` = High Risk (Red badge).
- **Status Lifecycle:** `new` -> `drafted` -> `approved` -> `sent`.

## 5. Known Constraints
- **Latency:** Email relay can take 1-5 minutes.
- **Attachments:** Currently text-only. Images in emails might be stripped.
