# Review System Architecture
**Date:** January 28, 2026

## Detection Flow

```mermaid
sequenceDiagram
    participant EmailProcessor
    participant GmailMessages
    participant Calendar (Bookings)
    participant ReviewItems
    participant User

    EmailProcessor->>GmailMessages: Read Email
    EmailProcessor->>EmailProcessor: Extract Fact (Code: XYZ, Date: Jan 1)
    
    EmailProcessor->>Calendar (Bookings): Query (Code=XYZ OR Date=Jan 1)
    
    alt Match Found
        EmailProcessor->>Calendar (Bookings): Enrich Metadata (Name)
    else No Match
        EmailProcessor->>ReviewItems: INSERT (status='pending', data={...})
    end
    
    User->>ReviewItems: GET /review (Pending Items)
    User->>User: Verifies Email Content
    User->>Calendar (Bookings): INSERT (Source='manual')
    User->>ReviewItems: UPDATE (status='resolved')
```

## Schema

### `enrichment_review_items`
- `extracted_data`: JSONB. Contains `{ guest_name, check_in, check_out, confirmation_code, listing_name }`.
- `connection_id`: Which Gmail account found this.
- `workspace_id`: Scope.

## Integration
- **Tightly coupled with `EmailProcessor`.**
- **Loosely coupled with `Calendar`.** The Review system observes the calendar but does not modify it.
