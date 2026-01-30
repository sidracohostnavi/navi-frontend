# Inbox Architecture
**Date:** January 28, 2026

## Messaging Flow

```mermaid
sequenceDiagram
    participant Guest (Airbnb)
    participant Airbnb Proxy
    participant Navi Ingest (EmailProcessor)
    participant DB (Messages)
    participant AI Agent
    participant Host UI

    Guest (Airbnb)->>Airbnb Proxy: Sends Message "Is early check-in possible?"
    Airbnb Proxy->>Navi Ingest: Fwds Email
    
    Navi Ingest->>Navi Ingest: Extract specific body text (remove footer)
    Navi Ingest->>DB (Messages): INSERT (status='new')
    
    par Async AI
        DB (Messages)-->>AI Agent: Trigger Webhook
        AI Agent->>AI Agent: Analyze intent (Check-in inquiry)
        AI Agent->>AI Agent: Check Risk (Low)
        AI Agent->>AI Agent: Generate Draft "Hi! Early check-in is fine."
        AI Agent->>DB (Messages): UPDATE (status='drafted', body='Hi!...')
    end
    
    Host UI->>DB (Messages): Poll/Sub status='new'
    Host UI-->>Host: Show Notification
    
    Host->>Host UI: Click "Approve & Send"
    Host UI->>DB (Messages): UPDATE status='approved'
    DB (Messages)-->>Navi Ingest: Trigger SEND
    Navi Ingest->>Airbnb Proxy: Send Email
    Airbnb Proxy->>Guest (Airbnb): Post to Chat
```

## Data Model

### `cohost_conversations`
The anchor for a chat.
- `id`: UUID.
- `property_id`: Links to the property discussion is about.
- `guest_email`: The proxy email (`...@guest.airbnb.com`).
- `platform`: 'airbnb', 'vrbo', 'direct'.

### `cohost_messages`
The individual bubbles.
- `direction`: `inbound` (Guest -> Host) or `outbound` (Host -> Guest).
- `status`: `new` -> `drafted` -> `approved` -> `sent`.
- `ai_meta`: JSONB column storing `{ intent: "early_checkin", sentiment: "neutral" }`.

## Integration Points
- **SendGrid / Gmail API:** Used for the actual transport layer.
- **OpenAI:** Used for the `drafted` and `risk_score` logic.
- **Supabase Realtime:** Updates the Host UI instantly when a new message arrives.
