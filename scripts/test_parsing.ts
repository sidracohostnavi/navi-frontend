
import { EmailProcessor } from '../lib/services/email-processor';

// Mock Email Body (Based on Airbnb HTML/Text structure)
const mockSubject = "Reservation confirmed - Liz Servin arrives Jan 25";
const mockBody = `
Reservation confirmed
HM12345678

Check-in
Sun, Jan 25, 2026
15:00

Checkout
Thu, Jan 29, 2026
11:00

Guests
3 guests
1 adult, 2 children

Confirmation code
HM12345678

Hosted by
Sidra
`;

async function test() {
    console.log("Testing Email Parser...");
    const result = EmailProcessor.parseReservationEmail(mockBody, mockSubject);

    console.log("Result:", JSON.stringify(result, null, 2));

    if (result &&
        result.guest_name === "Liz S." &&
        result.guest_count === 3 &&
        result.confirmation_code === "HM12345678" &&
        result.check_in.includes("2026-01-25")) {
        console.log("✅ TEST PASSED");
    } else {
        console.error("❌ TEST FAILED");
    }
}

test();
