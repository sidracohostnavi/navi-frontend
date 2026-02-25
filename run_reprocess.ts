require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { EmailProcessor } from './lib/services/email-processor';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const msgId = "8d6c3dd9-cdd4-4113-acac-d01b13030133";
  const { data: m } = await supabase.from('gmail_messages').select('*').eq('id', msgId).single();
  
  console.log("1. Forcing processing on message", m.gmail_message_id);
  // Pass the actual message array instead of letting it fetch
  await EmailProcessor.processMessages(m.connection_id, [m.raw_metadata.original_msg], supabase);

  console.log("2. Checking reservation_facts...");
  const { data: facts } = await supabase.from('reservation_facts').select('*').eq('source_gmail_message_id', m.gmail_message_id);
  console.log(`Found ${facts.length} facts. Data:`, facts);
}

run();
