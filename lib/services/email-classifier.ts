/**
 * Email Classification Module
 * 
 * Pure, deterministic classification for Gmail messages.
 * Implements blocklist-first pattern matching to identify:
 * - Reservation confirmations (only path to is_reservation_candidate=true)
 * - Inquiries, replies, cancellations, reviews, platform ops (blocked)
 * 
 * NO AI. NO external APIs. NO side effects.
 */

export type MessageType =
    | 'reservation_confirmation'
    | 'booking_inquiry'
    | 'guest_message'
    | 'cancellation_request'
    | 'review_request'
    | 'review_posted'
    | 'platform_system'
    | 'unknown';

export interface EmailClassification {
    message_type: MessageType;
    is_reservation_candidate: boolean;
    classification_reason: string[];
    classification_version: string;
}

const CLASSIFICATION_VERSION = 'v1';

// =============================================================================
// BLOCKLIST PATTERNS (Priority Order)
// =============================================================================

interface BlocklistRule {
    type: MessageType;
    patterns: RegExp[];
    description: string;
}

const BLOCKLIST_RULES: BlocklistRule[] = [
    // Inquiry signals
    {
        type: 'booking_inquiry',
        patterns: [
            /\bInquiry\b/i,
            /Respond to .{0,30} inquiry/i,
            /Respond to this Inquiry/i,
            /Pre-approval request/i,
        ],
        description: 'Inquiry signals'
    },
    // Thread/reply signals
    {
        type: 'guest_message',
        patterns: [
            /^Re:/i,    // Subject starts with Re:
            /^RE:/,     // Subject starts with RE:
            /has replied to your message/i,
            /sent you a message/i,
        ],
        description: 'Reply/thread signals'
    },
    // Cancellation workflow
    {
        type: 'cancellation_request',
        patterns: [
            /cancellation request/i,
            /cancel a booking/i,
            /approve the cancellation/i,
            /cancellation has been confirmed/i,
            /reservation has been cancelled/i,
            /booking was cancelled/i,
        ],
        description: 'Cancellation workflow'
    },
    // Review requests (asking host to write)
    {
        type: 'review_request',
        patterns: [
            /Write a review/i,
            /waiting for your review/i,
            /Leave a review/i,
            /Review your guest/i,
            /guests? (is|are) waiting for your review/i,
        ],
        description: 'Review request signals'
    },
    // Reviews posted (guest wrote review)
    {
        type: 'review_posted',
        patterns: [
            /left a \d-star review/i,
            /posted their review/i,
            /wrote you a review/i,
            /new review for/i,
        ],
        description: 'Review posted signals'
    },
    // Platform operations
    {
        type: 'platform_system',
        patterns: [
            /reimbursement/i,
            /security deposit expiry/i,
            /security deposit reminder/i,
            /payout processed/i,
            /payout has been sent/i,
            /tax document/i,
            /1099/i,
            /account verification/i,
            /verify your (identity|account)/i,
            /update your (payment|payout)/i,
        ],
        description: 'Platform operations'
    },
];

// =============================================================================
// CONFIRMATION PATTERNS (Only path to is_reservation_candidate=true)
// =============================================================================

interface ConfirmationRule {
    platform: string;
    subjectPatterns: RegExp[];
    bodyPatterns: RegExp[];
    requiredBodyPatterns: RegExp[];  // ALL must match
    description: string;
}

const CONFIRMATION_RULES: ConfirmationRule[] = [
    // Airbnb Confirmation
    {
        platform: 'Airbnb',
        subjectPatterns: [
            /Reservation confirmed/i,
        ],
        bodyPatterns: [
            /New booking confirmed/i,
            /booking is confirmed/i,
        ],
        requiredBodyPatterns: [
            /(Check-in|Check in|Checkin)/i,
        ],
        description: 'Airbnb reservation confirmation'
    },
    // Lodgify Confirmation
    {
        platform: 'Lodgify',
        subjectPatterns: [
            /New Confirmed Booking/i,
            /Confirmed Booking/i,
        ],
        bodyPatterns: [
            /BOOKING \(#/i,
            /Booking Id:/i,
            /Booking #/i,
        ],
        requiredBodyPatterns: [
            /(Arrival|Check-in|Checkin)/i,
            /(Departure|Check-out|Checkout)/i,
        ],
        description: 'Lodgify reservation confirmation'
    },
    // VRBO / HomeAway Confirmation
    {
        platform: 'VRBO',
        subjectPatterns: [
            /Instant Booking/i,
            /Booking confirmed/i,
        ],
        bodyPatterns: [
            /Your booking is confirmed/i,
            /booking has been confirmed/i,
        ],
        requiredBodyPatterns: [
            /Reservation ID/i,
            /(Dates|Check-in|Arrival)/i,
        ],
        description: 'VRBO reservation confirmation'
    },
    // Generic / Other Platforms (Direct)
    {
        platform: 'Direct/Other',
        subjectPatterns: [
            /You have a new reservation/i,
            /Reservation from/i,
            /Booking confirmed/i,
        ],
        bodyPatterns: [
            /Reservation Confirmation/i,
            /Booking Confirmation/i,
        ],
        requiredBodyPatterns: [
            /(Check-in|Arrival)/i,
            /(Check-out|Departure)/i,
        ],
        description: 'Generic reservation confirmation'
    }
];

// =============================================================================
// CLASSIFICATION FUNCTION
// =============================================================================

/**
 * Classify an email deterministically.
 * 
 * @param subject - Email subject line
 * @param body - Email body text (HTML stripped)
 * @returns Classification result
 */
export function classifyEmail(subject: string, body: string): EmailClassification {
    const reasons: string[] = [];
    const normalizedSubject = subject.trim();
    const normalizedBody = body.replace(/\s+/g, ' ').trim();
    const combinedText = `${normalizedSubject} ${normalizedBody}`;

    // ==========================================================================
    // STEP 1: BLOCKLIST CHECK (First Priority)
    // ==========================================================================
    for (const rule of BLOCKLIST_RULES) {
        for (const pattern of rule.patterns) {
            // For reply patterns, check subject only
            if (pattern.source.startsWith('^')) {
                if (pattern.test(normalizedSubject)) {
                    reasons.push(`Blocked: ${rule.description} [${pattern.source}]`);
                    return {
                        message_type: rule.type,
                        is_reservation_candidate: false,
                        classification_reason: reasons,
                        classification_version: CLASSIFICATION_VERSION
                    };
                }
            } else {
                // For other patterns, check combined text
                if (pattern.test(combinedText)) {
                    reasons.push(`Blocked: ${rule.description} [${pattern.source}]`);
                    return {
                        message_type: rule.type,
                        is_reservation_candidate: false,
                        classification_reason: reasons,
                        classification_version: CLASSIFICATION_VERSION
                    };
                }
            }
        }
    }

    // ==========================================================================
    // STEP 2: CONFIRMATION DETECTION (Only path to candidate=true)
    // ==========================================================================
    for (const rule of CONFIRMATION_RULES) {
        let hasSubjectMatch = false;
        let hasBodyMatch = false;
        let hasAllRequired = true;

        // Check subject patterns
        for (const pattern of rule.subjectPatterns) {
            if (pattern.test(normalizedSubject)) {
                hasSubjectMatch = true;
                reasons.push(`Subject match: ${rule.platform} [${pattern.source}]`);
                break;
            }
        }

        // Check body patterns (alternative to subject)
        for (const pattern of rule.bodyPatterns) {
            if (pattern.test(normalizedBody)) {
                hasBodyMatch = true;
                reasons.push(`Body match: ${rule.platform} [${pattern.source}]`);
                break;
            }
        }

        // Must have at least subject OR body match
        if (!hasSubjectMatch && !hasBodyMatch) {
            continue;
        }

        // Check all required body patterns
        for (const pattern of rule.requiredBodyPatterns) {
            if (!pattern.test(normalizedBody)) {
                hasAllRequired = false;
                reasons.push(`Missing required: [${pattern.source}]`);
                break;
            }
        }

        if (hasAllRequired && (hasSubjectMatch || hasBodyMatch)) {
            reasons.push(`Confirmed: ${rule.description}`);
            return {
                message_type: 'reservation_confirmation',
                is_reservation_candidate: true,
                classification_reason: reasons,
                classification_version: CLASSIFICATION_VERSION
            };
        }
    }

    // ==========================================================================
    // STEP 3: DEFAULT (Unknown)
    // ==========================================================================
    reasons.push('No blocklist or confirmation patterns matched');
    return {
        message_type: 'unknown',
        is_reservation_candidate: false,
        classification_reason: reasons,
        classification_version: CLASSIFICATION_VERSION
    };
}
