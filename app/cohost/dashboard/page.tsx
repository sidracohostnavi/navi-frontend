import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { isValidRole, getPermissionsForRole } from '@/lib/roles/roleConfig';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function CoHostDashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/auth/login');
  }

  const workspaceId = await ensureWorkspace(user.id);
  if (!workspaceId) {
    redirect('/cohost');
  }

  const { data: workspace } = await supabase
    .from('cohost_workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .single();

  if (!workspace) {
    redirect('/auth/login?error=workspace_not_found');
  }

  // Fetch user role
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  const role = isValidRole(membership?.role) ? membership.role : 'cleaner';
  const perms = getPermissionsForRole(role);

  // Cleaners go to Daily Ops
  if (!perms.canViewDashboard) {
    redirect('/cohost/dailyops');
  }

  // Count properties
  const { count: propertyCount } = await supabase
    .from('cohost_properties')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  // Empty state — no properties yet
  if (!propertyCount || propertyCount === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Plus className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No properties yet</h2>
        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
          Add your first property to start managing bookings, cleanings, and operations.
        </p>
        <a
          href="/cohost/onboarding"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Property
        </a>
      </div>
    );
  }

  // Count upcoming bookings (30 days)
  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(now.getDate() + 30);

  const { count: upcomingBookings } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('check_in', now.toISOString())
    .lte('check_in', thirtyDays.toISOString())
    .neq('status', 'cancelled');

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">{workspace.name || 'Dashboard'}</h1>
      </div>
      <DashboardClient
        stats={{
          propertyCount: propertyCount ?? 0,
          upcomingBookings: upcomingBookings ?? 0,
        }}
      />
    </div>
  );
}
