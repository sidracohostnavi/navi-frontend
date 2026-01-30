# Inbox Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

## 1. Human-in-the-Loop
- **Rule:** The system NEVER sends a message to a guest without human approval (or explicit "Auto-Pilot" configuration).
- **Default:** All AI-generated responses start as `status='drafted'`.
- **Constraint:** The send trigger must come from an authenticated user action (API or UI).

## 2. Thread Continuity
- **Rule:** We must preserve the `external_thread_id` (e.g. Airbnb Thread ID).
- **Constraint:** Breaking a thread (sending a new email subject) will cause the platform (Airbnb) to treat it as a new separate email, confusing the guest. We must always `Reply-To` the correct thread headers.

## 3. Privacy & Redaction
- **Rule:** PII (Phone numbers, emails) in message bodies may be redacted by the platforms (Airbnb/VRBO).
- **Constraint:** Our system must handle "masked" emails (`xyz@guest.airbnb.com`) as the primary identity for guests in the inbox context.

## 4. Delivery Guarantees
- **Rule:** If a message is marked `sent` in our DB, we must have a confirmation from the underlying transport (SendGrid/Gmail).
- **Failure:** If sending fails, status must revert to `error` or `new`, never `sent`.
