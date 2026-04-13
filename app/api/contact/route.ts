import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'unspecified');

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || !email || !message) {
        return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    const { error } = await resend.emails.send({
        from: 'Navi CoHost <hello@cohostnavi.com>',
        to: 'sidra.navicohost@gmail.com',
        replyTo: email,
        subject: `Access Request from ${name}`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #FA5A5A; font-size: 20px; margin-bottom: 16px;">New Access Request</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 80px;">Name</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px;">
                            <a href="mailto:${email}" style="color: #FA5A5A;">${email}</a>
                        </td>
                    </tr>
                </table>
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 8px;">
                    <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
                </div>
                <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
                    Sent from the Navi CoHost contact form. Reply directly to this email to respond to ${name}.
                </p>
            </div>
        `,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
