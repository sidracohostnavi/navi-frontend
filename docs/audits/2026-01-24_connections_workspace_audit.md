# Audit: Connection Workspace Scoping (2026-01-24)

## 1. Schema Reality Check

### `connections` Table
**Current State**: User-scoped, not Workspace-scoped.
| Column | Type | Nullable | References |
| :--- | :--- | :--- | :--- |
| `id` | UUID | NO | PK |
| `user_id` | UUID | NO | `auth.users(id)` |
| `platform` | TEXT | NO | - |
| `display_email` | TEXT | YES | - |
| `notes` | TEXT | YES | - |
| `reservation_label` | TEXT | YES | - |
| `gmail_...` | (Various) | YES | - |

**Missing**: `workspace_id`.

### `gmail_messages` Table
**Current State**: Scoped to Connection only.
| Column | Type | References |
| :--- | :--- | :--- |
| `connection_id` | UUID | `connections(id)` |
| `gmail_message_id` | TEXT | - |

**Missing**: `workspace_id` (Indirectly linked via Connection).

### RLS Policies
*   **connections**: `USING (auth.uid() = user_id)`
    *   *Result*: A user sees ALL their connections across all contexts.
*   **cohost_properties**: `USING (workspace_id IN (SELECT workspace_id FROM cohost_workspace_members...))`
    *   *Result*: A user sees properties from ALL workspaces they are a member of (unless filtered by query).

## 2. Current Runtime Scoping
*   **UI (`connections/page.tsx`)**: Fetches `supabase.from('connections').select('*')`.
    *   **Behavior**: Ignores the `(workspace)` URL parameter. Displays all connections owned by the user.
*   **API (`health/route.ts`)**: Fetches by `id` + `user_id`.
    *   **Behavior**: Global access to any connection owned by the user.

## 3. Risk Assessment
*   **Leakage**: High. If a user belongs to "Personal" and "Agency" workspaces, their "Personal Airbnb" connection appears in the Agency dashboard.
*   **Data Integrity**: Low/Medium. Relationships are enforced via `connection_properties`, so data doesn't cross-contaminate *logic* unless the user explicitly links them wrong.
*   **UX**: Confusing. "Why is my personal email showing up in the company dashboard?"

## 4. Migration Plan (Option B)

### Phase 0: Preparation
*   Identify canonical workspace for existing connections.
    *   *Heuristic*: Look at linked properties (`connection_properties` -> `cohost_properties.workspace_id`).
    *   *Conflict*: If a connection is linked to properties in DIFFERENT workspaces, it must be split or assigned to one.

### Phase 1: Schema Change (Non-Breaking)
Add nullable column and index.
```sql
ALTER TABLE connections 
ADD COLUMN workspace_id UUID REFERENCES cohost_workspaces(id) ON DELETE CASCADE;

CREATE INDEX idx_connections_workspace ON connections(workspace_id);
```

### Phase 2: Backfill Data
Run a one-off script (or SQL) to populate `workspace_id`.
```sql
-- Example Backfill Logic
UPDATE connections c
SET workspace_id = (
    SELECT p.workspace_id 
    FROM connection_properties cp
    JOIN cohost_properties p ON p.id = cp.property_id
    WHERE cp.connection_id = c.id
    LIMIT 1
)
WHERE workspace_id IS NULL;

-- Fallback for orphans: Assign to user's 'personal' workspace or active preference
```

### Phase 3: Update RLS & API
*   **RLS**: Update policies to check `workspace_id`.
    ```sql
    check (workspace_id IN (select workspace_id from cohost_workspace_members where user_id = auth.uid()))
    ```
*   **API/UI**: Update `connections/page.tsx` and API routes to:
    1.  Filter by `workspace_id`.
    2.  Insert with `workspace_id`.

### Phase 4: Enforce Constraint
Make it mandatory once backfill is 100% verified.
```sql
ALTER TABLE connections ALTER COLUMN workspace_id SET NOT NULL;
```

## 5. Validation Strategy
1.  **Orphan Check**: `SELECT count(*) FROM connections WHERE workspace_id IS NULL` should be 0 before Phase 4.
2.  **Cross-Check**: Ensure `connection.workspace_id` matches `linked_property.workspace_id`.
