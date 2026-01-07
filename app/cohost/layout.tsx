// /app/cohost/layout.tsx
import { AuthProvider } from '@/lib/contexts/AuthContext'

export default function CohostLayout({
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