// app/momassist/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/authServer'
import { checkAppAccess } from '@/lib/apps/checkAppAccess'

export default async function MomAssistLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Check authentication
    const user = await getCurrentUser()

    if (!user) {
        redirect('/auth/login?next=/momassist')
    }

    // Check app access
    const access = await checkAppAccess(user.id, 'momassist')

    if (!access.hasAccess && access.redirectUrl) {
        redirect(access.redirectUrl)
    }

    return <>{children}</>
}
