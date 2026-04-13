import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const { token, markUsed, usedByEmail } = body;

    if (!token || typeof token !== 'string') {
        return NextResponse.json({ valid: false });
    }

    const service = createCohostServiceClient();
    const { data: invite, error } = await service
        .from('cohost_signup_invites')
        .select('id, revoked, used_at')
        .eq('token', token)
        .maybeSingle();

    if (error || !invite) {
        return NextResponse.json({ valid: false });
    }

    if (invite.revoked || invite.used_at) {
        return NextResponse.json({ valid: false });
    }

    // Mark as used after successful signup (email/password path)
    if (markUsed && usedByEmail && typeof usedByEmail === 'string') {
        await service
            .from('cohost_signup_invites')
            .update({
                used_at: new Date().toISOString(),
                used_by_email: usedByEmail.toLowerCase(),
            })
            .eq('id', invite.id);
    }

    return NextResponse.json({ valid: true });
}
