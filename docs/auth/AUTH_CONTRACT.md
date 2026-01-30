# Authentication Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

This document defines the security guarantees and auth rules for the platform.

## 1. The "Middleware Wall" Law
- **Rule:** Every request to the application MUST be evaluated by `middleware.ts`.
- **Constraint:** We do not rely solely on client-side redirects for protection. The server (Edge) must make the "Allow/Deny" decision.
- **Exception:** Static assets (`_next/static`, images, favicon) and explicitly listed `PUBLIC_ROUTES`.

## 2. Row Level Security (RLS) Supremacy
- **Rule:** Authentication (Who are you?) is handled by Supabase Auth, but Authorization (What can you see?) is handled EXCLUSIVELY by Postgres RLS.
- **Constraint:** Application code should generally not need to filter by `user_id` manually for security. The database policy `auth.uid() = user_id` is the final barrier.
- **Failure Mode:** If application logic fails to filter, the DB must return an empty set, not leaked data.

## 3. Session Handling
- **Rule:** Sessions are managed via HttpOnly cookies.
- **Constraint:** We do not store tokens in `localStorage` for sensitive operations to prevent XSS credential theft.
- **Refresh:** The Supabase client automatically handles token refreshing.

## 4. Redirect Safety
- **Rule:** Open Redirect protection.
- **Constraint:** The `?next=` parameter must be validated or relative-only to prevent Phishing redirects to external sites. (Currently handled by relative path enforcement in app logic).

## 5. Account Uniqueness
- **Rule:** One email = One User ID.
- **Constraint:** If a user signs in with Google, and later with Password (using same email), Supabase treats this as the same identity entity (if configured for linkable identities).
