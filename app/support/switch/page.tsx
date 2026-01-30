
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SwitchForm } from './SwitchForm';

export const dynamic = 'force-dynamic';

export default async function SupportSwitchPage() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
        redirect('/api/auth/login');
    }

    const allowedEmails = (process.env.DEV_SUPPORT_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase());

    if (!allowedEmails.includes(user.email.toLowerCase())) {
        return (
            <div className="p-8 text-center text-red-500">
                <h1 className="text-2xl font-bold">403 Forbidden</h1>
                <p>You are not authorized to access this page.</p>
                <p className="text-sm mt-4 text-gray-500">
                    User: {user.email}
                </p>
            </div>
        );
    }

    const cookieStore = await cookies();
    const supportMode = cookieStore.get('support_mode')?.value === 'true';
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value;

    return (
        <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-black">
            <h1 className="text-xl font-bold mb-4">Support Mode: Workspace Switch</h1>

            <div className="mb-6 p-4 bg-gray-100 rounded text-sm text-black">
                <p><strong>Current Status:</strong> {supportMode ? '✅ Active' : '⚪️ Inactive'}</p>
                <p><strong>Active Workspace:</strong> {activeWorkspaceId || 'Default (User Own)'}</p>
                <p><strong>User:</strong> {user.email}</p>
            </div>

            <SwitchForm />

            <div className="mt-8 text-xs text-gray-400">
                <p>⚠️ Actions are audited.</p>
            </div>
        </div>
    );
}
