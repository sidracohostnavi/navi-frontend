// /app/cohost/messaging/layout.tsx
// Provides AuthProvider context for useAuth() calls in messaging page components.
// Auth protection and the header are handled by the parent app/cohost/layout.tsx.
'use client'

import { AuthProvider } from '@/lib/contexts/AuthContext'

export const dynamic = 'force-dynamic'

export default function MessagingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}
