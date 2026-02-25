require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { EmailProcessor } from './lib/services/email-processor';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("--- 1. Resetting test message ---");
  const msgId = '3771bf3a-38e3-4105-bf39-a2990b4703b4';
  
  const { data: dbMsg } = await supabase.from('gmail_messages').select('*').eq('id', msgId).single();

  console.log("--- 4. Silent Failure test ---");
  // Keep the 'Arrival' keyword but strip the actual date value to fail parseReservationEmail
  const rawBody = dbMsg.raw_metadata.full_text || dbMsg.raw_metadata.original_msg?.bodyText;
  const badBody = rawBody.replace(/Mar 12 2026/g, '----').replace(/Mar 15 2026/g, '----');

  const unparseableMsg = {
    id: "fake-msg-id-123456",
    gmail_message_id: "fake-msg-id-123456",
    subject: dbMsg.subject,
    snippet: dbMsg.snippet,
    bodyText: badBody,
    bodyHtml: ""
  };

  await EmailProcessor.processMessages(dbMsg.connection_id, [unparseableMsg], supabase);

  const { data: failedMsg } = await supabase.from('gmail_messages').select('processed_at, raw_metadata').eq('gmail_message_id', "fake-msg-id-123456").single();
  console.log("Failed message processed_at:", failedMsg.processed_at ? "SET" : "NULL");
  console.log("Failed message parse_error:", failedMsg.raw_metadata?.parse_error || "MISSING");
  
  await supabase.from('gmail_messages').delete().eq('gmail_message_id', "fake-msg-id-123456");
}

run();
