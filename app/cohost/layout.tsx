// /app/cohost/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/authServer'
import { checkAppAccess } from '@/lib/apps/checkAppAccess'
import { AuthProvider } from '@/lib/contexts/AuthContext'

export default async function CohostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check authentication
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth/login?next=/cohost')
  }

  // Check app access
  const access = await checkAppAccess(user.id, 'cohost')

  if (!access.hasAccess && access.redirectUrl) {
    redirect(access.redirectUrl)
  }

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}