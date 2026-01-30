/**
 * Email Classification Test Suite
 * 
 * Tests the deterministic email classifier against known fixtures.
 * Run with: npx tsx scripts/test_email_classification.ts
 */

import { classifyEmail, MessageType } from '../lib/services/email-classifier';

interface TestFixture {
    name: string;
    subject: string;
    body: string;
    expectedType: MessageType;
    expectedCandidate: boolean;
}

const fixtures: TestFixture[] = [
    // ==========================================================================
    // RESERVATION CONFIRMATIONS (candidate=true)
    // ==========================================================================
    {
        name: 'Airbnb: Reservation confirmed',
        subject: 'Reservation confirmed - John Bainbridge arrives Jan 29',
        body: `
            Reservation confirmed
            HM12345678
            
            Check-in
            Wed, Jan 29, 2026
            15:00
            
            Checkout
            Sun, Feb 2, 2026
            11:00
            
            Guests
            2 adults
            
            Confirmation code
            HM12345678
            
            Hosted by
            Test Host
        `,
        expectedType: 'reservation_confirmation',
        expectedCandidate: true
    },
    {
        name: 'Lodgify: New Confirmed Booking',
        subject: 'New Confirmed Booking: Andreas Müller #B17701827',
        body: `
            BOOKING (#B17701827)
            
            Guest: Andreas Müller
            Id: B17701827
            
            Arrival: January 30, 2026
            Departure: February 5, 2026
            
            Property: Beach House
            Guests: 4
        `,
        expectedType: 'reservation_confirmation',
        expectedCandidate: true
    },
    {
        name: 'VRBO: Instant Booking confirmed',
        subject: 'Instant Booking from Sarah Johnson',
        body: `
            Your booking is confirmed!
            
            Reservation ID: HA-8521479
            Guest: Sarah Johnson
            
            Dates Jan 6 - Jan 12, 2026
            
            Property: Mountain View Cabin
            Total: $1,250.00
        `,
        expectedType: 'reservation_confirmation',
        expectedCandidate: true
    },

    // ==========================================================================
    // BLOCKED: INQUIRIES (candidate=false)
    // ==========================================================================
    {
        name: 'VRBO: Reply with Inquiry signal',
        subject: 'Reservation from Leah Higgs',
        body: `
            Leah Higgs has replied to your message.
            
            Respond to this Inquiry
            
            Message:
            "Is the property available next weekend?"
        `,
        expectedType: 'booking_inquiry',
        expectedCandidate: false
    },
    {
        name: 'Airbnb: Pre-booking inquiry',
        subject: 'Inquiry from Guest - Downtown Loft',
        body: `
            John Smith has sent you an inquiry.
            
            Property: Downtown Loft
            Dates: Feb 10 - Feb 15
            
            Message:
            "Hi, is this place pet friendly?"
        `,
        expectedType: 'booking_inquiry',
        expectedCandidate: false
    },

    // ==========================================================================
    // BLOCKED: CANCELLATIONS (candidate=false)
    // ==========================================================================
    {
        name: 'VRBO: Cancellation request',
        subject: 'Response needed: cancellation request from Mark Davis',
        body: `
            Mark Davis would like to cancel a booking.
            
            Reservation: HA-9999888
            Dates: Mar 1 - Mar 5
            
            Please approve the cancellation or contact the guest.
        `,
        expectedType: 'cancellation_request',
        expectedCandidate: false
    },

    // ==========================================================================
    // BLOCKED: REVIEWS (candidate=false)
    // ==========================================================================
    {
        name: 'Airbnb: Review request',
        subject: 'Write a review for your guest John',
        body: `
            John checked out yesterday.
            
            Share your experience with this guest to help other hosts.
        `,
        expectedType: 'review_request',
        expectedCandidate: false
    },
    {
        name: 'Airbnb: Guests waiting for review',
        subject: '3 guests are waiting for your review',
        body: `
            You have 3 guests waiting for your review.
            
            - John Smith (Jan 15)
            - Jane Doe (Jan 18)
            - Bob Wilson (Jan 20)
        `,
        expectedType: 'review_request',
        expectedCandidate: false
    },
    {
        name: 'Airbnb: Guest left review',
        subject: 'Sarah left a 5-star review!',
        body: `
            Sarah left a 5-star review for your property.
            
            "Amazing place, would definitely stay again!"
        `,
        expectedType: 'review_posted',
        expectedCandidate: false
    },

    // ==========================================================================
    // BLOCKED: PLATFORM SYSTEM (candidate=false)
    // ==========================================================================
    {
        name: 'Lodgify: Security deposit reminder',
        subject: 'Security deposit expiry reminder',
        body: `
            Reminder: The security deposit for booking #12345 will expire in 3 days.
            
            Please review and release the deposit if no damages occurred.
        `,
        expectedType: 'platform_system',
        expectedCandidate: false
    },
    {
        name: 'Airbnb: Reimbursement request',
        subject: 'Reimbursement request from guest',
        body: `
            A guest has submitted a reimbursement request.
            
            Property: Downtown Loft
            Amount: $50.00
            Reason: Damaged towels
        `,
        expectedType: 'platform_system',
        expectedCandidate: false
    },

    // ==========================================================================
    // BLOCKED: REPLIES (candidate=false)
    // ==========================================================================
    {
        name: 'Reply thread',
        subject: 'Re: Question about check-in',
        body: `
            Thanks for asking!
            
            Check-in is at 3pm.
        `,
        expectedType: 'guest_message',
        expectedCandidate: false
    },
];

// =============================================================================
// TEST RUNNER
// =============================================================================

function runTests() {
    console.log('🧪 Email Classification Test Suite\n');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;
    const failures: { name: string; expected: string; got: string }[] = [];

    for (const fixture of fixtures) {
        const result = classifyEmail(fixture.subject, fixture.body);

        const typeMatch = result.message_type === fixture.expectedType;
        const candidateMatch = result.is_reservation_candidate === fixture.expectedCandidate;

        if (typeMatch && candidateMatch) {
            console.log(`✅ ${fixture.name}`);
            passed++;
        } else {
            console.log(`❌ ${fixture.name}`);
            console.log(`   Expected: type=${fixture.expectedType}, candidate=${fixture.expectedCandidate}`);
            console.log(`   Got:      type=${result.message_type}, candidate=${result.is_reservation_candidate}`);
            console.log(`   Reasons:  ${result.classification_reason.join(', ')}`);
            failed++;
            failures.push({
                name: fixture.name,
                expected: `${fixture.expectedType} / candidate=${fixture.expectedCandidate}`,
                got: `${result.message_type} / candidate=${result.is_reservation_candidate}`
            });
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        console.log('❌ FAILURES:');
        for (const f of failures) {
            console.log(`   - ${f.name}: expected ${f.expected}, got ${f.got}`);
        }
        process.exit(1);
    } else {
        console.log('✅ ALL TESTS PASSED!');
        process.exit(0);
    }
}

runTests();
