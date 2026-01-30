# Review System Roadmap

## Phase 1: Detection (Completed)
- [x] **Backend:** `enrichment_review_items` table created.
- [x] **Logic:** Email Processor inserts rows when iCal mismatch detected.

## Phase 2: User Interface (Current)
- [ ] **Dashboard:** Build `/cohost/review` page.
- [ ] **Email Preview:** Show a sanitized snippet of the email in the card.

## Phase 3: Automation
- [ ] **Auto-Resolve:** If a subsequent iCal sync *does* bring in the booking (matching code/date), automatically mark the Review Item as `resolved` (Self-Healing).
- [ ] **Smart Ignore:** "Always ignore emails with subject 'Cancelled'".
