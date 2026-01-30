# Connections System Architecture
**Date:** January 28, 2026

## Connectivity Flow

```mermaid
sequenceDiagram
    participant User
    participant App (Navi)
    participant Google OAuth
    participant Gmail API
    participant DB (Connections)

    %% Setup Phase
    User->>App: "Connect Gmail"
    App->>App: Check RLS & Label Config
    App->>Google OAuth: Redirect (scope=gmail.readonly)
    Google OAuth-->>User: Consent Screen
    User->>Google OAuth: Approve
    Google OAuth-->>App: Callback (Code)
    App->>Google OAuth: Exchange Code -> Refresh Token
    App->>DB (Connections): Update (token, status='connected')

    %% Ingestion Phase (Async)
    loop Every 15 Mins
        App->>DB (Connections): Select Active Connections
        App->>Gmail API: List Messages (query="label:Airbnb")
        Gmail API-->>App: Message List [ID: 123, ID: 456]
        
        par Each Message
            App->>Gmail API: Get Message Details (ID: 123)
            App->>App: Extract Body & Subject
            App->>DB (Connections): Insert into `gmail_messages`
        end
    end
```

## Data Schema Details

### `connections` Table
- `id`: UUID (Primary Key)
- `workspace_id`: Relationship to Workspace.
- `reservation_label`: (String) The Gmail label to scrape. Essential.
- `gmail_status`: 'connected' | 'disconnected' | 'error'.
- `gmail_refresh_token`: (Text, Encrypted*) The long-lived credential. 
  *(Encryption depends on Supabase Vault usage, currently text for MVP).*

## Integration Points
- **Google OAuth:** Used purely for authorization. We do not use Google Sign-In for identity here (that's the Auth system); this is strictly for resource access.
- **Gmail API:** Specifically `users.messages.list` and `users.messages.get`.

## Scalability
- **Rate Limits:** Google imposes rate limits (user-rate-limit).
- **Strategy:** Sequential processing per connection prevents hitting concurrency limits.
- **Batching:** We fetch in batches of 20-50 emails to avoid timeouts.
