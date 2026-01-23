/**
 * Auto-pick a Gmail label from available labels
 * Prefers labels containing "airbnb" (case-insensitive)
 */
export function autoPickLabel(labels: { name?: string | null }[]): string | null {
    // First, try to find a label containing "airbnb"
    const airbnbLabel = labels.find(l =>
        l.name?.toLowerCase().includes('airbnb')
    );

    if (airbnbLabel?.name) {
        return airbnbLabel.name;
    }

    // Fallback: try other common reservation labels
    const commonLabels = ['vrbo', 'booking', 'lodgify', 'reservations'];
    for (const keyword of commonLabels) {
        const match = labels.find(l =>
            l.name?.toLowerCase().includes(keyword)
        );
        if (match?.name) {
            return match.name;
        }
    }

    return null;
}
