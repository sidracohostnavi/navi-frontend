'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Link as ConnIcon,
    Calendar,
    Bell,
    Users,
    CreditCard,
    User,
    HelpCircle,
    Home
} from 'lucide-react';
import { SIDEBAR_PERMISSION_MAP, getPermissionsForRole, type FeaturePermissions } from '@/lib/roles/roleConfig';

const SIDEBAR_ITEMS = [
    { name: 'Connections', href: '/cohost/settings/connections', icon: ConnIcon },
    { name: 'Calendar Sync', href: '/cohost/settings/calendar', icon: Calendar },
    { name: 'Properties', href: '/cohost/settings/properties', icon: Home },
    { name: 'Team Members', href: '/cohost/settings/team', icon: Users },
    { name: 'Notification Preferences', href: '/cohost/settings/notifications', icon: Bell },
    { name: 'Billing', href: '/cohost/settings/billing', icon: CreditCard },
    { name: 'Profile', href: '/cohost/settings/profile', icon: User },
    { name: 'Support', href: '/cohost/settings/support', icon: HelpCircle },
];

export default function SettingsWorkspaceLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [permissions, setPermissions] = useState<FeaturePermissions | null>(null);

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const res = await fetch('/api/cohost/users/role');
                if (res.ok) {
                    const data = await res.json();
                    setPermissions(getPermissionsForRole(data.role));
                } else {
                    // If role fetch fails, default to most restrictive
                    setPermissions(getPermissionsForRole('cleaner'));
                }
            } catch {
                setPermissions(getPermissionsForRole('cleaner'));
            }
        };
        fetchRole();
    }, []);

    // Filter sidebar items based on role permissions
    const visibleItems = permissions
        ? SIDEBAR_ITEMS.filter(item => {
            const permKey = SIDEBAR_PERMISSION_MAP[item.href];
            if (!permKey) return true; // No mapping = always visible
            return permissions[permKey];
        })
        : []; // Show nothing while loading

    const backLink = permissions?.canViewSettingsTab ? '/cohost/settings' : '/cohost/dashboard';
    const backLabel = permissions?.canViewSettingsTab ? 'Back to Settings' : 'Back to Dashboard';

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Persistent Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0 fixed h-full overflow-y-auto z-10">
                <div className="p-6 border-b border-gray-100">
                    <Link
                        href={backLink}
                        className="flex items-center gap-2 text-gray-500 hover:text-blue-600 transition-colors group"
                    >
                        <div className="p-1 rounded bg-gray-100 group-hover:bg-blue-50 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </div>
                        <span className="font-semibold text-sm">{backLabel}</span>
                    </Link>
                </div>

                <div className="p-4">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">Workspace</h3>
                    <nav className="space-y-1">
                        {visibleItems.map(item => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 ml-64 min-h-screen">
                {children}
            </main>
        </div>
    );
}
