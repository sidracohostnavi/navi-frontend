export const PLATFORM_COLORS = {
    airbnb: {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        badge: 'bg-rose-100 text-rose-700',
        hex: '#FF5A5F'
    },
    vrbo: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-700',
        hex: '#0D47A1'
    },
    'booking.com': {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-700',
        badge: 'bg-indigo-100 text-indigo-700',
        hex: '#003580'
    },
    lodgify: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        badge: 'bg-purple-100 text-purple-700',
        hex: '#7C3AED'
    },
    direct: {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        badge: 'bg-gray-100 text-gray-700',
        hex: '#6B7280'
    }
} as const;

export type Platform = keyof typeof PLATFORM_COLORS;

export function getPlatformColors(platform?: string | null) {
    const key = platform?.toLowerCase() as Platform;
    return PLATFORM_COLORS[key] || PLATFORM_COLORS.direct;
}

export function getPlatformBadgeLabel(platform?: string | null) {
    const labels: Record<string, string> = {
        airbnb: 'Airbnb',
        vrbo: 'VRBO',
        'booking.com': 'Booking.com',
        lodgify: 'Lodgify',
        direct: 'Direct'
    };
    return labels[platform?.toLowerCase() || 'direct'] || 'Other';
}
