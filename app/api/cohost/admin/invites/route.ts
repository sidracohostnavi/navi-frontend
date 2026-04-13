import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { Resend } from 'resend';

function getResend() {
    return new Resend(process.env.RESEND_API_KEY || 'unspecified');
}

function getAdminEmails(): string[] {
    return (process.env.DEV_SUPPORT_EMAILS || 'sidra.navicohost@gmail.com')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

async function getAdminUser() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !getAdminEmails().includes(user.email?.toLowerCase() || '')) return null;
    return user;
}

function buildInviteUrl(request: NextRequest, token: string): string {
    const host = request.headers.get('host') || 'cohostnavi.com';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    return `${protocol}://${host}/auth/signup?invite=${token}`;
}

export async function GET(request: NextRequest) {
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const service = createCohostServiceClient();
    const { data: invites, error } = await service
        .from('cohost_signup_invites')
        .select('id, token, note, created_at, used_at, used_by_email, revoked')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const host = request.headers.get('host') || 'cohostnavi.com';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const origin = `${protocol}://${host}`;

    return NextResponse.json({
        invites: (invites || []).map(inv => ({
            ...inv,
            invite_url: `${origin}/auth/signup?invite=${inv.token}`,
        })),
    });
}

export async function POST(request: NextRequest) {
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const note = typeof body.note === 'string' ? body.note.trim() || null : null;

    const service = createCohostServiceClient();
    const { data: invite, error } = await service
        .from('cohost_signup_invites')
        .insert({ note })
        .select('id, token, note, created_at, used_at, used_by_email, revoked')
        .single();

    if (error || !invite) {
        return NextResponse.json({ error: error?.message || 'Failed to create invite' }, { status: 500 });
    }

    return NextResponse.json({
        invite: {
            ...invite,
            invite_url: buildInviteUrl(request, invite.token),
        },
    });
}

export async function PATCH(request: NextRequest) {
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const service = createCohostServiceClient();

    // Only allow revoking unused invites
    const { data: existing } = await service
        .from('cohost_signup_invites')
        .select('id, used_at')
        .eq('id', id)
        .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.used_at) return NextResponse.json({ error: 'Cannot revoke a used invite' }, { status: 400 });

    // Resend invite email action
    if (body.action === 'resend_email') {
        const recipientEmail = typeof body.email === 'string' ? body.email.trim() : null;
        if (!recipientEmail) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

        const { data: invite } = await service
            .from('cohost_signup_invites')
            .select('id, token, note, used_at, revoked')
            .eq('id', id)
            .maybeSingle();

        if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        if (invite.revoked) return NextResponse.json({ error: 'Invite is revoked' }, { status: 400 });
        if (invite.used_at) return NextResponse.json({ error: 'Invite already used' }, { status: 400 });

        const host = request.headers.get('host') || 'cohostnavi.com';
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const inviteUrl = `${protocol}://${host}/auth/signup?invite=${invite.token}`;

        const { error: emailError } = await getResend().emails.send({
            from: 'Navi CoHost <hello@cohostnavi.com>',
            to: recipientEmail,
            subject: "You're invited to Navi CoHost",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                    <h1 style="color: #FA5A5A; font-size: 24px; margin-bottom: 8px;">You're invited to Navi CoHost</h1>
                    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                        You've been personally invited to join Navi CoHost — smart property management for short-term rental hosts.
                    </p>
                    ${invite.note ? `<p style="color: #6b7280; font-size: 13px; background: #f9fafb; padding: 12px 16px; border-radius: 8px; margin: 16px 0;">Note: ${invite.note}</p>` : ''}
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${inviteUrl}" style="display: inline-block; background: #FA5A5A; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                            Accept Invitation
                        </a>
                    </div>
                    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                        This link is unique to you. If you weren't expecting this, you can ignore it.
                    </p>
                </div>
            `,
        });

        if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    // Default PATCH action: revoke
    const { error } = await service
        .from('cohost_signup_invites')
        .update({ revoked: true })
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
