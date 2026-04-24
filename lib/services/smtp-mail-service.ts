// SMTP Mail Service — send replies via any SMTP provider
//
// Supports: Yahoo, iCloud, Zoho, or any custom SMTP host.
// The host's SMTP password is stored AES-256-GCM encrypted in connections.smtp_password_encrypted.
//
// Note: SMTP is SEND-ONLY. Ingest (reading incoming relay emails) for SMTP-only
// connections requires IMAP, which is built in the next phase. Until then, SMTP
// connections can reply to messages that were matched/ingested through a second
// Gmail or Microsoft connection, OR the host manually starts a direct_email thread.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { decryptSmtpPassword } from '@/lib/services/email-crypto';
import { createCohostClient } from '@/lib/supabase/cohostServer';

// Known provider SMTP settings for auto-configuration
export const SMTP_PROVIDERS: Record<string, SmtpProviderDefaults> = {
    yahoo: {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false, // STARTTLS on 587
    },
    icloud: {
        host: 'smtp.mail.me.com',
        port: 587,
        secure: false,
    },
    zoho: {
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
    },
    gmail_smtp: {
        // Fallback for Gmail hosts who prefer app password over OAuth
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
    },
    custom: {
        host: '',
        port: 587,
        secure: false,
    },
};

export type SmtpProviderDefaults = {
    host: string;
    port: number;
    secure: boolean; // true = TLS on 465, false = STARTTLS on 587
};

type SmtpConnectionConfig = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromName?: string;
};

export class SmtpMailService {
    /**
     * Build a nodemailer transporter from a connection's SMTP credentials.
     * Decrypts the stored password automatically.
     */
    private static async createTransporter(
        connectionId: string,
        supabase?: any
    ): Promise<{ transporter: Transporter | null; config: SmtpConnectionConfig | null; error?: string }> {
        const db = supabase || createCohostClient();

        const { data: conn } = await db
            .from('connections')
            .select('smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_from_name')
            .eq('id', connectionId)
            .single();

        if (!conn?.smtp_host || !conn?.smtp_user || !conn?.smtp_password_encrypted) {
            return { transporter: null, config: null, error: 'SMTP not configured on this connection' };
        }

        let password: string;
        try {
            password = decryptSmtpPassword(conn.smtp_password_encrypted);
        } catch (e: any) {
            return { transporter: null, config: null, error: `Failed to decrypt SMTP password: ${e.message}` };
        }

        const config: SmtpConnectionConfig = {
            host: conn.smtp_host,
            port: conn.smtp_port || 587,
            secure: conn.smtp_secure ?? true,
            user: conn.smtp_user,
            password,
            fromName: conn.smtp_from_name || conn.smtp_user,
        };

        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.password,
            },
        });

        return { transporter, config };
    }

    /**
     * Test SMTP credentials by attempting a connection verify.
     * Used when the host saves their SMTP settings in the UI.
     */
    static async testConnection(
        connectionId: string,
        supabase?: any
    ): Promise<{ success: boolean; error?: string }> {
        const db = supabase || createCohostClient();
        const { transporter, error } = await this.createTransporter(connectionId, db);

        if (!transporter) {
            return { success: false, error };
        }

        try {
            await transporter.verify();
            await db.from('connections').update({ smtp_status: 'connected' }).eq('id', connectionId);
            console.log(`[SmtpMail.testConnection] ✅ SMTP verified for ${connectionId}`);
            return { success: true };
        } catch (err: any) {
            await db.from('connections').update({ smtp_status: 'error' }).eq('id', connectionId);
            console.error(`[SmtpMail.testConnection] ❌ SMTP verify failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Send a reply email via SMTP.
     *
     * For gmail_relay channel, replyToAddress is the relay address
     * (from the Reply-To header of the original inbound email).
     * replyToMsgId is the RFC 2822 Message-ID for proper In-Reply-To threading.
     */
    static async sendReply(
        connectionId: string,
        options: {
            replyToAddress: string;      // To: header (relay address or guest email)
            subject: string;             // Subject line (will be prefixed Re: if needed)
            body: string;                // Plain text body
            inReplyToMsgId?: string;     // RFC 2822 Message-ID of original (for threading)
            references?: string;         // References header chain
        },
        supabase?: any
    ): Promise<{ success: boolean; error?: string }> {
        const db = supabase || createCohostClient();
        const { transporter, config, error } = await this.createTransporter(connectionId, db);

        if (!transporter || !config) {
            return { success: false, error };
        }

        const subject = options.subject.startsWith('Re:')
            ? options.subject
            : `Re: ${options.subject}`;

        const mailOptions: any = {
            from: `"${config.fromName}" <${config.user}>`,
            to: options.replyToAddress,
            subject,
            text: options.body,
        };

        if (options.inReplyToMsgId) {
            mailOptions.inReplyTo = options.inReplyToMsgId;
            const refsChain = [options.references, options.inReplyToMsgId]
                .filter(Boolean)
                .join(' ');
            mailOptions.references = refsChain;
        }

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[SmtpMail.sendReply] ✅ Sent via SMTP, messageId: ${info.messageId}`);

            // Update status on success
            await db.from('connections').update({ smtp_status: 'connected' }).eq('id', connectionId);

            return { success: true };
        } catch (err: any) {
            console.error('[SmtpMail.sendReply] ❌ Send failed:', err.message);
            await db.from('connections').update({ smtp_status: 'error' }).eq('id', connectionId);
            return { success: false, error: err.message };
        }
    }
}
