require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { classifyEmail } from './lib/services/email-classifier';
import { EmailProcessor } from './lib/services/email-processor';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const msgId = "8d6c3dd9-cdd4-4113-acac-d01b13030133";
  const { data: m } = await supabase.from('gmail_messages').select('*').eq('id', msgId).single();

  const raw = m.raw_metadata;
  const originalMsg = raw.original_msg;

  const textForClassification = originalMsg.bodyHtml ?
    originalMsg.bodyHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    : originalMsg.bodyText;

  const classification = classifyEmail(originalMsg.subject, textForClassification);
  console.log("1. Classification Result:");
  console.dir(classification);

  console.log("2. Processed_at ternary evaluation:");
  console.log("   Is it equal to reservation_confirmation?", classification.message_type === 'reservation_confirmation');

  console.log("3. Test parsing with EmailProcessor:");

  let bodyToParse = '';
  if (raw.full_html) {
    bodyToParse = raw.full_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ');
  } else if (raw.full_text) {
    bodyToParse = raw.full_text;
  } else if (raw.original_msg?.bodyText) {
    bodyToParse = raw.original_msg.bodyText;
  } else {
    bodyToParse = m.snippet || '';
  }

  const fact = EmailProcessor.parseReservationEmail(bodyToParse, m.subject);
  console.log("4. Fact returned by parseReservationEmail:");
  console.dir(fact);
}

run();
