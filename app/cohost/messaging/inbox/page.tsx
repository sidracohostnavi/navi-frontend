// /app/cohost/messaging/inbox/page.tsx
// Server component wrapper to prevent SSG - force-dynamic works here
import InboxClient from './InboxClient'

export const dynamic = 'force-dynamic'

export default function InboxPage() {
  return <InboxClient />
}