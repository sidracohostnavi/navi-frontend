import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import DeveloperDashboardClient from './DeveloperDashboardClient';

function getAdminEmails(): string[] {
    return (process.env.DEV_SUPPORT_EMAILS || 'sidra.navicohost@gmail.com')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export default async function DeveloperPage() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !getAdminEmails().includes(user.email?.toLowerCase() || '')) {
        redirect('/cohost/calendar');
    }

    return <DeveloperDashboardClient adminEmail={user.email!} />;
}
