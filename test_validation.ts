require('dotenv').config({ path: '.env.local' });
import { EmailProcessor } from './lib/services/email-processor';

const fact = {
  check_in: '2026-04-04',
  check_out: '2026-04-06',
  guest_name: 'Kia',
  guest_count: 19,
  confirmation_code: 'B18850280',
  listing_name: 'Short-term Rental',
  confidence: 0.9
};

const error = EmailProcessor.validateReservationFact(fact);
console.log("Validation Result:", error ? error : "PASS");
