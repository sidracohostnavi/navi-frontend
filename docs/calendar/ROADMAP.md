# Calendar Product Roadmap

## Phase 1: Stabilization (Completed)
- [x] **Core Sync Engine:** `node-ical` based parsing.
- [x] **Multi-Feed Support:** Support unlimited feeds per property.
- [x] **Enrichment:** Guest name hydration via Gmail.
- [x] **Infinite Grid:** Virtualized frontend rendering.

## Phase 2: User Control (Current)
- [ ] **Manual Blocking:** Ability to click and drag to block dates (creating a 'direct' booking).
- [ ] **Event Editing:** Override guest name or notes manually for iCal bookings.
- [ ] **Export Enhancements:** Allow filtering what is exported in the outbound `.ics` (e.g. "Export only confirmed bookings").

## Phase 3: Automation & Reliability
- [ ] **Background Workers:** Move sync off API routes and into robust background queues (Inngest/Trigger.dev) to handle 1000+ feeds.
- [ ] **Real-Time Webhooks:** Investigate if Airbnb/VRBO support webhooks to trigger sync instantly instead of polling.
- [ ] **Conflict Resolution UI:** Visual interface for when two feeds claim the same dates (currently strictly priority-based).
- [ ] **Smart Pricing Overlay:** Show nightly rates on the grid.

## Phase 4: Intelligence
- [ ] **Cleaning Integration:** Auto-schedule cleaning blocks after check-outs.
- [ ] **Gap Optimization:** Highlight "orphan nights" (1-2 day gaps) that are hard to sell.
