# Connections Product Roadmap

## Phase 1: Gmail Integration (Completed)
- [x] **OAuth:** Secure link to Gmail.
- [x] **Labeling:** Ingest-via-Label strategy.
- [x] **Fact Extraction:** Parse basic booking details.

## Phase 2: Reliability (Current)
- [ ] **Diagnostics UI:** Show "Last Sync Time" and "Last Error" clearly on the connection card.
- [ ] **Re-Auth Nudge:** Email the host when a token expires.
- [ ] **Label Picker:** Instead of typing "Airbnb", fetch and show a dropdown of available Gmail labels during setup.

## Phase 3: Expansion
- [ ] **Outlook/O365:** Support for Microsoft accounts.
- [ ] **IMAP/SMTP:** Generic email support (harder, less secure).
- [ ] **Direct API:** Support specific PMS APIs (Hostaway, Guesty) as "Connections" that bypass email entirely.

## Phase 4: Automation
- [ ] **Auto-Labeling:** Teach users how to set up Gmail filters automatically during onboarding.
- [ ] **Reply Routing:** Handle "Reply-To" routing more intelligently for multi-property setups.
