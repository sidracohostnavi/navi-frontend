import { Suspense } from 'react';
import Link from 'next/link';
import { Calendar, MessageSquare, ClipboardList, Settings, Home, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { redirect } from 'next/navigation';
import { getPermissionsForRole, isValidRole } from '@/lib/roles/roleConfig';

export const dynamic = 'force-dynamic';

async function DashboardStats({ workspaceId }: { workspaceId: string }) {
    const supabase = await createClient();

    // Fetch Properties Count
    const { count: propertyCount, error: propError } = await supabase
        .from('cohost_properties')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);

    // Fetch Upcoming Bookings (Next 30 Days)
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(now.getDate() + 30);

    const { count: bookingCount, error: bookError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .gte('check_in', now.toISOString())
        .lte('check_in', thirtyDaysLater.toISOString());

    if (propError) console.error('Error fetching properties:', propError);
    if (bookError) console.error('Error fetching bookings:', bookError);

    // Empty State Check
    if (!propertyCount || propertyCount === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Home className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to CoHost</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                    Get started by adding your first property to manage bookings and operations.
                </p>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    <Plus className="w-4 h-4" />
                    Add Property
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="text-sm text-gray-500 font-medium mb-1">Properties</div>
                <div className="text-3xl font-bold text-gray-900">{propertyCount}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="text-sm text-gray-500 font-medium mb-1">Upcoming Bookings (30d)</div>
                <div className="text-3xl font-bold text-blue-600">{bookingCount || 0}</div>
            </div>
        </div>
    );
}

export default async function CoHostDashboardPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    const workspaceId = await ensureWorkspace(user.id);

    if (!workspaceId) {
        // User has no workspace — they're not a CoHost customer or team member
        redirect('/cohost');
    }

    const { data: workspace } = await supabase
        .from('cohost_workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();

    if (!workspace) {
        redirect('/auth/login?error=workspace_not_found');
    }

    // Fetch user's role in this workspace for nav filtering
    const { data: membership } = await supabase
        .from('cohost_workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single();

    const role = isValidRole(membership?.role) ? membership.role : 'cleaner';
    const perms = getPermissionsForRole(role);

    // Redirect if user is not allowed to view dashboard
    if (!perms.canViewDashboard) {
        if (perms.canViewCalendar) {
            redirect('/cohost/calendar');
        } else {
            // Fallback for weird roles
            redirect('/cohost/settings/profile');
        }
    }

    const allNavItems = [
        {
            title: 'Calendar',
            description: 'Manage availability and reservations',
            icon: Calendar,
            href: '/cohost/calendar',
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            permKey: 'canViewCalendar' as const,
        },
        {
            title: 'Messaging',
            description: 'Guest communication inbox',
            icon: MessageSquare,
            href: '/cohost/messaging',
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            permKey: 'canViewMessaging' as const,
        },
        {
            title: 'Daily Ops',
            description: 'Tasks, check-ins, and turnover',
            icon: ClipboardList,
            href: '/cohost/dailyops',
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            permKey: 'canViewDashboard' as const,
        },
        {
            title: 'Settings',
            description: 'Workspace and property configuration',
            icon: Settings,
            href: '/cohost/settings',
            color: 'text-gray-600',
            bg: 'bg-gray-50',
            permKey: 'canViewSettingsTab' as const,
        }
    ];

    // Filter nav items by role permissions
    const navItems = allNavItems.filter(item => perms[item.permKey]);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">
                    {workspace.name || 'CoHost Dashboard'}
                </h1>
                <p className="text-gray-500">Overview</p>
            </header>

            <Suspense fallback={<div className="h-32 bg-gray-100 animate-pulse rounded-xl mb-8" />}>
                <DashboardStats workspaceId={workspace.id} />
            </Suspense>

            <h2 className="text-lg font-semibold text-gray-900 mb-4">Apps & Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="group flex items-start gap-4 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all"
                    >
                        <div className={`p-3 rounded-lg ${item.bg} ${item.color} group-hover:scale-110 transition-transform`}>
                            <item.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                {item.title}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {item.description}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
