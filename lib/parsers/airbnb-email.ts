interface AirbnbReservation {
    reservation_id: string;
    guest_first_name: string;
    guest_last_name: string;
    guest_last_initial: string;
    guest_count: number;
    check_in: Date;
    check_out: Date;
    listing_name?: string;
}

export function parseAirbnbEmail(emailBody: string, subject: string): AirbnbReservation | null {
    try {
        // Extract confirmation code
        const confirmationMatch = emailBody.match(/confirmation code[:\s]+([A-Z0-9]+)/i) ||
            emailBody.match(/reservation code[:\s]+([A-Z0-9]+)/i) ||
            emailBody.match(/\b([A-Z]{2}[A-Z0-9]{8,12})\b/);

        if (!confirmationMatch) {
            console.warn('[AirbnbParser] No confirmation code found');
            return null;
        }

        const reservation_id = confirmationMatch[1];

        // Extract guest name
        const guestMatch = emailBody.match(/(?:guest|traveler|from)[:\s]+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i) ||
            emailBody.match(/([A-Z][a-z]+)\s+([A-Z][a-z]+)\s+(?:is staying|has booked)/i);

        if (!guestMatch) {
            console.warn('[AirbnbParser] No guest name found');
            return null;
        }

        const guest_first_name = guestMatch[1];
        const guest_last_name = guestMatch[2];
        const guest_last_initial = guest_last_name.charAt(0);

        // Extract guest count
        const guestCountMatch = emailBody.match(/(\d+)\s+guest/i);
        const guest_count = guestCountMatch ? parseInt(guestCountMatch[1]) : 1;

        // Extract check-in date
        const checkInMatch = emailBody.match(/check[- ]?in[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i) ||
            emailBody.match(/arrives?[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i);

        if (!checkInMatch) {
            console.warn('[AirbnbParser] No check-in date found');
            return null;
        }

        // Extract check-out date
        const checkOutMatch = emailBody.match(/check[- ]?out[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i) ||
            emailBody.match(/departs?[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i);

        if (!checkOutMatch) {
            console.warn('[AirbnbParser] No check-out date found');
            return null;
        }

        const check_in = new Date(checkInMatch[1]);
        const check_out = new Date(checkOutMatch[1]);

        // Validate dates
        if (isNaN(check_in.getTime()) || isNaN(check_out.getTime())) {
            console.warn('[AirbnbParser] Invalid dates');
            return null;
        }

        // Extract listing name (optional)
        const listingMatch = emailBody.match(/(?:at|for)\s+([A-Z][^.!?\n]{10,80})/);
        const listing_name = listingMatch ? listingMatch[1].trim() : undefined;

        return {
            reservation_id,
            guest_first_name,
            guest_last_name,
            guest_last_initial,
            guest_count,
            check_in,
            check_out,
            listing_name
        };

    } catch (err) {
        console.error('[AirbnbParser] Parse error:', err);
        return null;
    }
}

export function isAirbnbReservationEmail(subject: string): boolean {
    return /reservation\s+confirmed/i.test(subject) ||
        /you\s+have\s+a\s+new\s+reservation/i.test(subject) ||
        /booking\s+confirmed/i.test(subject);
}
