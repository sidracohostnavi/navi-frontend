import { redirect } from 'next/navigation'

// This route has been replaced by /cohost/messaging/conversations/[id]
export default function OldMessageDetailPage() {
  redirect('/cohost/messaging/inbox')
}
