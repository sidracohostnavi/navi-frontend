# Backfill Report: Connections Workspace (Phase 2)

**Date**: 2026-01-24T20:35:03.040Z
**Total Connections**: 4

## Summary
| Category | Count | Action |
| :--- | :--- | :--- |
| **Safe** | 3 | Backfilled |
| **Already Set** | 0 | Skipped |
| **Orphans** | 1 | Skipped (Manual Fix Required) |
| **Conflicts** | 0 | Skipped (Manual Fix Required) |

## Rollback SQL
Run this to Undo Stage B changes:
```sql
UPDATE connections 
SET workspace_id = NULL 
WHERE id IN (
    '76dd4b3b-ea77-4ef2-802d-eaf73295c358',
    '75bccd32-fd37-47d0-9cf9-77e527113f73',
    '4483d88b-1411-497f-9ca2-b456d43c4b01'
);
```

## Manual Decision List

### Orphans (No Linked Properties)
These connections have no properties linked, so we cannot infer workspace.
- **test@example.com** (ID: 373054ea-3e86-4166-b205-4857c5cb21a9)

### Conflicts (Linked to Multiple Workspaces)
These connections are linked to properties in different workspaces.
None
