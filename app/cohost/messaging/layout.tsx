// /app/cohost/messaging/layout.tsx
'use client'

import { ProtectedRoute } from '@/lib/components/ProtectedRoute'
import { CohostHeader } from '@/lib/components/CohostHeader'

export default function MessagingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <CohostHeader />
        <main>{children}</main>
      </div>
    </ProtectedRoute>
  )
}