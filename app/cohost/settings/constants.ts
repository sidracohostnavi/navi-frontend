import {
    Link as ConnIcon,
    Calendar,
    Bell,
    Users,
    CreditCard,
    User,
    HelpCircle,
    FileText,
    DollarSign,
    Package
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface SettingsNavItem {
    name: string;
    icon: LucideIcon;
    href: string;
    description: string;
    color: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
    { 
        name: 'Connections', 
        href: '/cohost/settings/connections', 
        icon: ConnIcon,
        description: 'Manage platform accounts (Airbnb, VRBO) and property mappings.',
        color: 'text-blue-600'
    },
    { 
        name: 'Calendar Sync', 
        href: '/cohost/settings/calendar', 
        icon: Calendar,
        description: 'Manage inbound/outbound iCal feeds and sync preferences.',
        color: 'text-purple-600'
    },
    { 
        name: 'Pricing & Fees', 
        href: '/cohost/settings/pricing', 
        icon: DollarSign,
        description: 'Configure nightly rates, additional guest fees, and taxes.',
        color: 'text-teal-600'
    },
    { 
        name: 'Booking Policies', 
        href: '/cohost/settings/policies', 
        icon: FileText,
        description: 'Set cancellation rules, rental agreements, and house rules.',
        color: 'text-gray-600'
    },
    { 
        name: 'Team Members', 
        href: '/cohost/settings/team', 
        icon: Users,
        description: 'Invite and manage co-hosts and cleaners in your workspace.',
        color: 'text-green-600'
    },
    { 
        name: 'Notification Preferences', 
        href: '/cohost/settings/notifications', 
        icon: Bell,
        description: 'Choose what events trigger email or push notifications.',
        color: 'text-amber-600'
    },
    {
        name: 'Plans & Packages',
        href: '/cohost/settings/packages',
        icon: Package,
        description: 'View available subscription tiers and property limits.',
        color: 'text-teal-600'
    },
    {
        name: 'Payments & Payouts',
        href: '/cohost/settings/billing',
        icon: CreditCard,
        description: 'Manage Stripe payouts for direct bookings and subscription payments.',
        color: 'text-indigo-600'
    },
    { 
        name: 'Profile', 
        href: '/cohost/settings/profile', 
        icon: User,
        description: 'Update your personal information and account security.',
        color: 'text-slate-600'
    },
    { 
        name: 'Support', 
        href: '/cohost/settings/support', 
        icon: HelpCircle,
        description: 'Get help, report issues, or view documentation.',
        color: 'text-rose-600'
    },
];
