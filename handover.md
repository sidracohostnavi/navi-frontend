# Handover Documentation

## Overview of Changes
During this session, we addressed critical bugs in the workspace invitation system, role-based access control (RBAC), and the calendar data logic for "Cleaners".

---

## 1. Workspace & Invites (Bug Fixes)

### The Problem
When a new user (Cleaners/Co-hosts) accepted an invite, the system:
1.  Created a brand new "Owner Workspace" for them (leaving them isolated in an empty account).
2.  Did not correctly link them to the Inviter's workspace.
3.  Did not set their default view preference.

### What Was Required
- Prevent auto-creation of workspaces for invited users.
- Ensure users land in the correct workspace upon accepting an invite.
- Store the extensive role details in the invite itself.

### The Fix
- **Modified `lib/workspaces/ensureWorkspace.ts`:** Added logic to check for pending invites before creating a new workspace. If an invite exists, we skip creation.
- **Updated `app/api/cohost/users/accept/route.ts`:** Explicitly sets the user's `cohost_user_preferences` to point to the *Inviter's Workspace* immediately upon acceptance.
- **Migration:** Created SQL migration `051_add_role_to_invites` to store role data securely.

---

## 2. Role Permissions (New Features & Restrictions)

### The Problem
- **Cleaners** had too much access (Review Inbox, Sync Settings, "Settings" Tab).
- **Cleaners** had too little access (Could not see Guest Counts or Broom icons).
- **Owners** wanted to restrict Cleaners to specific properties.

### The Fix
- **Restricted Access:**
    - Removed "Settings" tab and dashboard links for Cleaners.
    - Restricted "Review Inbox" access (`canViewReviewInbox`).
    - Hid "Sync" and "Refresh" buttons on the calendar (`canViewCalendarSync`).
- **Restored Visibility:**
    - Enabled `can_view_guest_count` for Cleaners (DB update).
    - Updated Calendar logic to show Broom icons (see Section 3).
- **Property Assignment (New):**
    - Created `cohost_user_properties` table.
    - Updated API to filter bookings by assigned properties.
    - Added UI in "Team Settings" to manage assignments.

---

## 3. The Cleaner Calendar (Data & Logic)

### How It Works (Simplified)
The calendar combines data from two main sources:
1.  **iCal Feeds:** Basic data (Dates + "Reservation"). **Low Quality.**
2.  **Gmail Ingestion:** Rich data (Guest Name, Specific Count, Source=Airbnb/VRBO). **High Quality.**

The system tries to merge these. If they overlap, it picks the "Best" one.

### The Issue (Why it looked broken)
Cleaners see masked names (e.g., "Guest").
1.  **Old Logic:** The system prioritized bookings with "Real Names" over "Generic Names".
    - Since Cleaners see *everything* as "Guest" (Generic), the system couldn't tell which booking was better.
    - It often picked the **iCal version** by mistake.
    - **Result:** Incorrect Guest Count (iCal default is 1) + No Broom (iCal source is "ical", not "airbnb", so deemed invalid).

### The Fix (My Changes)
- **Updated `app/cohost/calendar/CalendarClient.tsx`:**
    - Changed the logic to prioritize the **Source** (e.g., Airbnb, VRBO) over the Name.
    - Now, the system always picks the **Rich Booking** (from Gmail) even if the name is masked.
    - **Broom Check:** Updated to trust known sources (`airbnb`, `vrbo`).

### ⚠️ IMPORTANT: Why it might still look broken
If the Cleaner Calendar **still** shows incorrect data (Guest Count = 1) or missing Brooms, it means **Gmail Ingestion is failing for that specific booking.**

- If Gmail ingestion misses an email (or hasn't run), the system **ONLY** has the iCal event.
- The iCal event has:
    - `guestCount` = 1 (Default/Unknown)
    - `sourceType` = 'ical' (Unknown)
    - `guestName` = "Reservation"
- In this scenario, my code **correctly** hides the broom (because 'ical' is generic and could be a blocked date) and shows the default count.

**Conclusion:** If you see bad data, the issue is likely **Ingestion**, not Permission/Calendar Logic.

---

## Summary of Files Changed
- `app/cohost/calendar/CalendarClient.tsx` (Logic update)
- `app/api/cohost/calendar/route.ts` (API Filtering)
- `app/cohost/settings/(workspace)/team/page.tsx` (Invites & Property UI)
- `lib/roles/roleConfig.ts` (Permissions)
- `lib/workspaces/ensureWorkspace.ts` (Onboarding Fix)
- `app/api/cohost/users/accept/route.ts` (Onboarding Fix)
