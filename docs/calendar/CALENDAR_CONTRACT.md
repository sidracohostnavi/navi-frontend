# Calendar & Sync Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

This document defines the constraints, guarantees, and "laws" of the Calendar System. Any changes to the codebase MUST respect these rules.

## 1. Data Integrity & Ownership

### The "iCal Supremacy" Rule
- **Rule:** The `.ics` feed is the single source of truth for availability and dates.
- **Constraint:** We NEVER manually modify start/end dates of an iCal-sourced booking. If iCal says a date is blocked, it is blocked.
- **Exception:** Metadata (Guest Name, Price, Notes) CAN be enriched by our internal systems (Email Parsing), but the *existence* and *timing* of the booking are controlled by iCal.

### The "Property Scope" Law
- **Rule:** A booking belongs to exactly ONE property.
- **Constraint:** A feed is linked to ONE property. We never "infer" property based on booking content. The pipe (Feed -> Property) is hardcoded by configuration.

### Unique Identity
- **Rule:** Every booking is uniquely identified by the tuple: `(property_id, source_type, external_uid)`.
- **Constraint:** We rely on the `UID` field from the iCal event. If a source changes the UID, it is treated as a new booking (and the old one may remain until Pruning runs).

## 2. API & Sync Behavior

### One-Way Inbound
- **Rule:** The `/api/cohost/ical/sync` endpoint is READ-ONLY regarding the external world.
- **Constraint:** Syncing an Airbnb feed will NEVER write data back to Airbnb.

### Idempotency
- **Rule:** Syncing the same feed multiple times must result in the same database state.
- **Constraint:** All insert operations must use `ON CONFLICT` upsert logic.

### Failure Isolation
- **Rule:** A failure in one feed MUST NOT block the sync of other feeds for the same property.
- **Constraint:** `ICalProcessor` must wrap each feed processing in a `try/catch` and report status individually.

## 3. Visualization

### Priority Rendering
- **Rule:** When multiple bookings overlap, the "Higher Priority" source wins the visual slot.
- **Order:** `Direct` > `Airbnb` > `VRBO` > `Other`.
- **Constraint:** Lower priority bookings are hidden or shown as nested "duplicates," but they are never deleted from the DB.

## 4. Security

### Scoping
- **Rule:** Users can only view/sync calendars for properties within their active workspace.
- **Constraint:** All API routes must verify `workspace_id` before returning data.
