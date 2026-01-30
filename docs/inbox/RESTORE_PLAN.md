# Inbox Restoration & Recovery
**Primary Owner:** Engineering Team

## Level 1: Missing Messages
**Symptoms:** Guest says they sent a message, but it's not in Navi.

### Diagnosis
1. **Check Gmail Raw:** Log into the connected Gmail account. Search for the guest's name.
   - *If found in Gmail:* The `EmailProcessor` regex failed.
   - *If NOT found:* The issue is upstream (Airbnb didn't send email).

### Recovery (If Regex Failed)
1. Locate the `gmail_message_id`.
2. Use the "Reprocess Message" admin tool (or script).
   - This runs the parser again (useful after we deploy a regex fix).

## Level 2: Stuck Outbound
**Symptoms:** Message shows as `approved` but never switches to `sent`.

### Diagnosis
- **Queue Backup:** Check the job queue (if using one).
- **API Keys:** Did the SendGrid/Gmail token expire?

### Recovery
1. **Retry:** Button in UI to "Retry Send".
2. **Manual Override:** Host logs into Airbnb directly and replies manually. Then marks message as `sent` in Navi to clear queue.

## Level 3: Incorrect Threading
**Symptoms:** A new message started a *new* conversation instead of appending to the old one.

### Diagnosis
- The guest might have used a different email alias.
- The `external_thread_id` parsing might have changed format.

### Recovery
- **Merge Tool:** (Admin only) Merge Conversation A into Conversation B.
