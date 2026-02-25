// lib/roles/requireRole.ts
// Reusable API middleware for role-based access control

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { Role, isValidRole } from './roleConfig';

export interface RoleCheckResult {
    authorized: boolean;
    user: any;
    workspaceId: string | null;
    role: Role | null;
    membership: any;
}

/**
 * Check if the current user has one of the allowed roles in their workspace.
 * Use in API routes to gate access.
 *
 * @param allowedRoles - Array of roles that are permitted (e.g., ['owner', 'admin'])
 * @returns RoleCheckResult with authorization status and user context
 */
export async function requireRole(allowedRoles: Role[]): Promise<RoleCheckResult> {
    const { user, workspaceId } = await getCurrentUserWithWorkspace();

    if (!user || !workspaceId) {
        return { authorized: false, user: null, workspaceId: null, role: null, membership: null };
    }

    const supabase = await createClient();
    const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('id, role, role_label, is_active, can_view_calendar, can_view_guest_name, can_view_guest_count, can_view_booking_notes, can_view_contact_info')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single();

    if (!member?.is_active) {
        return { authorized: false, user, workspaceId, role: null, membership: null };
    }

    const role = isValidRole(member.role) ? member.role : null;

    if (!role || !allowedRoles.includes(role)) {
        return { authorized: false, user, workspaceId, role, membership: member };
    }

    return { authorized: true, user, workspaceId, role, membership: member };
}
