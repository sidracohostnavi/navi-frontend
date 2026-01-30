# Connections System Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

## 1. The "Label is Truth" Law
- **Rule:** The `reservation_label` is the primary filtering mechanism for ingestion.
- **Constraint:** We NEVER ingest from the `INBOX` or `ALL_MAIL` folders directly.
- **Reason:** To respect user privacy and prevent reading personal emails. 
- **Corollary:** If a user deletes the label in Gmail, the integration triggers a "Label Not Found" error and halts.

## 2. Platform Agnostic Pipe
- **Rule:** A Connection is a generic pipe to an email account, NOT a specific platform wrapper.
- **Constraint:** We do not have columns like `provider='airbnb'` or `provider='vrbo'` on the `connections` table.
- **Logic:** A single "Gmail" connection can legally ingest Airbnb, VRBO, and Booking.com emails if they all land in the target label.

## 3. Token Sovereignty
- **Rule:** A Refresh Token belongs to a specific Connection ID.
- **Constraint:** Tokens are never shared across connections, even if they point to the same Gmail account.
- **Revocation:** If we receive an `invalid_grant` (token revoked), we immediately set `gmail_status='disconnected'` to alert the user.

## 4. Idempotency (Message Level)
- **Rule:** A Gmail Message ID (`gmail_message_id`) consumes exactly one slot in the `gmail_messages` table.
- **Constraint:** If two connections define the same label and scan the same email account, the first one "wins" the ingestion (due to DB unique constraint). The second one logs a "Duplicate/Skipped" warning.
- **Best Practice:** Users should NOT connect the same Gmail account twice within the same Workspace.
