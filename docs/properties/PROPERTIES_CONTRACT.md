# Properties Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

## 1. Ownership & Hierarchy
- **Rule:** Every Property MUST belong to a single Workspace.
- **Constraint:** Properties cannot be "orphaned" (null `workspace_id`).
- **Transfer:** Moving a property between workspaces requires an explicit Administrative transfer (delete + recreate or SQL update).

## 2. Cascade Deletion
- **Rule:** Deleting a Property is a Destructive Action.
- **Constraint:** When a property is deleted, all child entities MUST be deleted or archived.
    - **Deleted:** Bookings, ICal Feeds, Tasks, Wifi Settings.
    - **Retained:** (Optional) Invoices or Financial records if strictly required by law (otherwise deleted).

## 3. Scope Isolation
- **Rule:** Properties in Workspace A are invisible to Workspace B.
- **Constraint:** RLS policies must enforce `workspace_id` equality. Even if a user is a member of both workspaces, they can only see properties for the *active* workspace context.

## 4. Uniqueness
- **Rule:** Property Names are NOT unique.
- **Reason:** An owner might have "Unit 101" in two different buildings.
- **Identifier:** The UUID (`id`) is the only safe reference.
