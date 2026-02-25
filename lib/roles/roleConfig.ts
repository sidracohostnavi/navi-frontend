// lib/roles/roleConfig.ts
// Single source of truth for workspace roles and feature-level permissions

export const ROLES = ['owner', 'admin', 'manager', 'cleaner'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    cleaner: 'Cleaner',
};

// Roles that can be assigned via invite (owners are created by ensureWorkspace)
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'manager', 'cleaner'];

export interface FeaturePermissions {
    canViewCalendar: boolean;
    canViewConnections: boolean;
    canViewProperties: boolean;
    canViewMessaging: boolean;
    canManageTeam: boolean;
    canViewBilling: boolean;
    canViewProfile: boolean;
    canViewSupport: boolean;
    canViewDashboard: boolean;
    canViewNotifications: boolean;
    canViewCalendarSync: boolean;
    canViewSettingsTab: boolean;
    canViewReviewInbox: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, FeaturePermissions> = {
    owner: {
        canViewCalendar: true,
        canViewConnections: true,
        canViewProperties: true,
        canViewMessaging: true,
        canManageTeam: true,
        canViewBilling: true,
        canViewProfile: true,
        canViewSupport: true,
        canViewDashboard: true,
        canViewNotifications: true,
        canViewCalendarSync: true,
        canViewSettingsTab: true,
        canViewReviewInbox: true,
    },
    admin: {
        canViewCalendar: true,
        canViewConnections: true,
        canViewProperties: true,
        canViewMessaging: true,
        canManageTeam: true,
        canViewBilling: false,
        canViewProfile: true,
        canViewSupport: true,
        canViewDashboard: true,
        canViewNotifications: true,
        canViewCalendarSync: true,
        canViewSettingsTab: true,
        canViewReviewInbox: true,
    },
    manager: {
        canViewCalendar: true,
        canViewConnections: false,
        canViewProperties: true,
        canViewMessaging: true,
        canManageTeam: false,
        canViewBilling: false,
        canViewProfile: true,
        canViewSupport: true,
        canViewDashboard: true,
        canViewNotifications: true,
        canViewCalendarSync: false,
        canViewSettingsTab: true,
        canViewReviewInbox: true,
    },
    cleaner: {
        canViewCalendar: true,
        canViewConnections: false,
        canViewProperties: false,
        canViewMessaging: false,
        canManageTeam: false,
        canViewBilling: false,
        canViewProfile: true,
        canViewSupport: true,
        canViewDashboard: false,
        canViewNotifications: false,
        canViewCalendarSync: false,
        canViewSettingsTab: false,
        canViewReviewInbox: false,
    },
};

// Map sidebar hrefs to permission keys
export const SIDEBAR_PERMISSION_MAP: Record<string, keyof FeaturePermissions> = {
    '/cohost/settings/connections': 'canViewConnections',
    '/cohost/settings/calendar': 'canViewCalendarSync',
    '/cohost/settings/properties': 'canViewProperties',
    '/cohost/settings/team': 'canManageTeam',
    '/cohost/settings/notifications': 'canViewNotifications',
    '/cohost/settings/billing': 'canViewBilling',
    '/cohost/settings/profile': 'canViewProfile',
    '/cohost/settings/support': 'canViewSupport',
};

// Helper: is this a valid assignable role?
export function isValidRole(role: string): role is Role {
    return ROLES.includes(role as Role);
}

// Helper: get permissions for a role, defaulting to cleaner for unknown roles
export function getPermissionsForRole(role: string): FeaturePermissions {
    if (isValidRole(role)) {
        return ROLE_PERMISSIONS[role];
    }
    // Legacy 'member' role maps to cleaner (most restrictive)
    return ROLE_PERMISSIONS.cleaner;
}
