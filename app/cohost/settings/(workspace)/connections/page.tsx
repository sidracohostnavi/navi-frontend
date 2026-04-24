'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OTA_PLATFORM_LIST, OTA_CONFIGS, type OtaPlatform } from '@/lib/services/ota-senders';

type Property = {
    id: string;
    name: string;
    image_url?: string;
};

type EmailProvider = 'gmail' | 'microsoft' | 'smtp';

type Connection = {
    id: string;
    platform?: 'airbnb' | 'vrbo' | 'booking' | 'pms' | null;  // legacy, being phased out
    name?: string;
    display_email: string;
    reservation_label?: string;   // legacy — kept for backwards compat
    message_label?: string;
    ota_platforms?: OtaPlatform[];
    ota_labels?: Record<string, string>;  // user's custom label per OTA
    custom_sender_query?: string | null;
    notes: string;
    created_at: string;
    mapped_properties_count?: number;
    mapped_property_ids?: string[];
    // Gmail
    email_provider?: EmailProvider | null;
    gmail_connected_at?: string | null;
    gmail_account_email?: string | null;
    gmail_status?: 'connected' | 'error' | 'pending' | 'needs_reconnect' | 'disconnected' | null;
    gmail_last_error_code?: string | null;
    gmail_last_error_message?: string | null;
    gmail_last_verified_at?: string | null;
    last_synced_at?: string | null;
    color?: string | null;
    // Microsoft
    microsoft_account_email?: string | null;
    microsoft_status?: 'connected' | 'error' | 'needs_reconnect' | null;
    // SMTP
    smtp_user?: string | null;
    smtp_provider?: string | null;
    smtp_status?: 'connected' | 'error' | null;
    last_enrichment?: {
        created_at: string;
        status: string;
        emails_processed: number;
    } | null;
};

function ConnectionsSettingsPageInner() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const router = useRouter();

    // State
    const [loading, setLoading] = useState(true);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [emailConfirmed, setEmailConfirmed] = useState(true);
    // Track connection to auto-open after OAuth redirect
    const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);

    // Action State
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string; details?: string } | null>(null);

    // SMTP setup form state
    const [smtpForm, setSmtpForm] = useState({
        provider: 'custom',
        host: '',
        port: '587',
        secure: false,
        user: '',
        password: '',
        from_name: '',
    });
    const [smtpSaving, setSmtpSaving] = useState(false);
    const [smtpError, setSmtpError] = useState<string | null>(null);

    // Auto-dismiss toast after 6 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const handleSync = async (connectionId: string) => {
        setSyncingIds(prev => {
            const next = new Set(prev);
            next.add(connectionId);
            return next;
        });

        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/sync`, {
                method: 'POST'
            });
            const data = await res.json();

            if (res.ok && data.success) {
                const stats = data.stats || {};
                const emailsProcessed = stats.emails_scanned || 0;
                const bookingsEnriched = stats.bookings_enriched || 0;
                const reviewItems = stats.review_items_created || 0;

                // Show detailed sync results
                if (emailsProcessed === 0 && bookingsEnriched === 0) {
                    setToast({
                        type: 'info',
                        message: 'Sync complete - no new emails',
                        details: 'All emails are already processed. No updates needed.'
                    });
                } else {
                    setToast({
                        type: 'success',
                        message: `Sync complete: ${emailsProcessed} emails processed`,
                        details: `${bookingsEnriched} bookings enriched${reviewItems > 0 ? `, ${reviewItems} review items created` : ''}`
                    });
                }
                fetchData();
            } else {
                // Check for specific error types
                const errorCode = data.code || '';
                const isRateLimit = errorCode === 'RATE_LIMITED' || data.error?.includes('rate') || data.error?.includes('quota');
                const isNeedsReconnect = errorCode === 'NEEDS_RECONNECT' || data.error?.includes('token') || data.error?.includes('expired');

                if (isRateLimit) {
                    setToast({
                        type: 'warning',
                        message: '⚠️ Rate limit reached',
                        details: 'Gmail API quota exceeded. Please wait a few minutes and try again.'
                    });
                } else if (isNeedsReconnect) {
                    setToast({
                        type: 'error',
                        message: '🔄 Gmail reconnection required',
                        details: 'Your Gmail access has expired. Click Reconnect to restore sync.'
                    });
                    // Update local state to show needs_reconnect
                    setConnections(prev => prev.map(c =>
                        c.id === connectionId
                            ? { ...c, gmail_status: 'needs_reconnect' as const }
                            : c
                    ));
                } else {
                    setToast({
                        type: 'error',
                        message: 'Sync failed',
                        details: data.error || data.message || 'Unknown error'
                    });
                }
            }
        } catch (err: any) {
            setToast({
                type: 'error',
                message: 'Sync error',
                details: err.message || 'Network error occurred'
            });
        } finally {
            setSyncingIds(prev => {
                const next = new Set(prev);
                next.delete(connectionId);
                return next;
            });
        }
    };

    const handleConnectGmail = (connectionId: string) => {
        window.location.href = `/api/cohost/connections/${connectionId}/gmail/start`;
    };

    const handleConnectMicrosoft = (connectionId: string) => {
        window.location.href = `/api/cohost/connections/${connectionId}/microsoft/start`;
    };

    const handleSwitchToSmtp = async (connectionId: string) => {
        await supabase.from('connections').update({ email_provider: 'smtp' }).eq('id', connectionId);
        await fetchData();
        // Reopen modal so SMTP section is visible
        const updated = connections.find(c => c.id === connectionId);
        if (updated) handleOpenModal({ ...updated, email_provider: 'smtp' });
    };

    const handleSaveSmtp = async (connectionId: string) => {
        setSmtpSaving(true);
        setSmtpError(null);
        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/smtp/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: smtpForm.provider,
                    host: smtpForm.host || undefined,
                    port: smtpForm.port ? parseInt(smtpForm.port) : undefined,
                    secure: smtpForm.secure,
                    user: smtpForm.user,
                    password: smtpForm.password,
                    from_name: smtpForm.from_name || undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setToast({ type: 'success', message: 'SMTP configured and verified successfully' });
                setSmtpForm({ provider: 'custom', host: '', port: '587', secure: false, user: '', password: '', from_name: '' });
                fetchData();
                setIsModalOpen(false);
            } else {
                setSmtpError(data.error || 'Failed to configure SMTP');
            }
        } catch (err: any) {
            setSmtpError(err.message);
        } finally {
            setSmtpSaving(false);
        }
    };

    // Auto-fill SMTP host/port when a known provider is selected
    const SMTP_PRESETS: Record<string, { host: string; port: string; secure: boolean }> = {
        yahoo:  { host: 'smtp.mail.yahoo.com', port: '587', secure: false },
        icloud: { host: 'smtp.mail.me.com',    port: '587', secure: false },
        zoho:   { host: 'smtp.zoho.com',       port: '587', secure: false },
        custom: { host: '',                    port: '587', secure: false },
    };

    const handleSmtpProviderChange = (provider: string) => {
        const preset = SMTP_PRESETS[provider] || SMTP_PRESETS.custom;
        setSmtpForm(prev => ({
            ...prev,
            provider,
            host: preset.host,
            port: preset.port,
            secure: preset.secure,
        }));
    };

    // Auto-colors assigned when creating a new connection (based on first OTA selected)
    const OTA_AUTO_COLORS: Partial<Record<OtaPlatform, string>> = {
        airbnb:           '#FF5A5F',
        vrbo:             '#3B82F6',
        booking_com:      '#003580',
        lodgify:          '#7C3AED',
        hipcamp:          '#16A34A',
        furnished_finder: '#D97706',
        tripadvisor:      '#34A853',
    };
    const getAutoColor = (platforms: OtaPlatform[]): string => {
        const first = platforms.find(p => p !== 'other');
        return (first && OTA_AUTO_COLORS[first]) ? OTA_AUTO_COLORS[first]! : '#008080';
    };

    // Track whether the new-connection wizard is in SMTP credential entry mode
    const [smtpCreationMode, setSmtpCreationMode] = useState(false);
    // Track whether we're saving the new-connection record before OAuth redirect
    const [creatingConnection, setCreatingConnection] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    // Provider choice for custom domains that can't be auto-detected
    const [providerChoice, setProviderChoice] = useState<'gmail' | 'microsoft' | null>(null);
    // Show full success screen after OAuth redirect completes
    const [showSuccessScreen, setShowSuccessScreen] = useState(false);

    const toggleOtaPlatform = (platform: OtaPlatform) => {
        const isChecked = formData.ota_platforms.includes(platform);
        setFormData(prev => {
            const newPlatforms = isChecked
                ? prev.ota_platforms.filter(p => p !== platform)
                : [...prev.ota_platforms, platform];

            const newLabels = { ...prev.ota_labels };
            if (isChecked) {
                delete newLabels[platform];
            } else if (!newLabels[platform]) {
                // Pre-fill with the OTA display name
                newLabels[platform] = OTA_CONFIGS[platform]?.label || platform;
            }

            return { ...prev, ota_platforms: newPlatforms, ota_labels: newLabels };
        });
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        display_email: string;
        notes: string;
        ota_platforms: OtaPlatform[];
        ota_labels: Record<string, string>;
        custom_sender_query: string;
        selected_property_ids: string[];
        color: string;
    }>({
        name: '',
        display_email: '',
        notes: '',
        ota_platforms: [],
        ota_labels: {},
        custom_sender_query: '',
        selected_property_ids: [],
        color: ''
    });

    // Fetch Initial Data
    useEffect(() => {
        const checkEmail = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && !user.email_confirmed_at) setEmailConfirmed(false);
        };
        checkEmail();
        fetchData();
    }, []);

    const RECONNECT_QUEUE_KEY = 'navi_reconnect_queue';

    // Reconnect All — one OAuth per unique Gmail account; callback auto-propagates
    // tokens to all sibling connections that share the same Gmail address.
    const handleReconnectAll = () => {
        const toReconnect = connections.filter(cx => cx.gmail_status !== 'connected');
        if (toReconnect.length === 0) {
            setToast({ type: 'info', message: 'All connections are already active.' });
            return;
        }
        // Deduplicate: only one connection per unique gmail_account_email.
        // The callback will propagate the new tokens to all others with that email.
        const seenEmails = new Set<string>();
        const uniqueToReconnect = toReconnect.filter(cx => {
            const key = cx.gmail_account_email || cx.id; // fall back to id if no email stored
            if (seenEmails.has(key)) return false;
            seenEmails.add(key);
            return true;
        });
        const [first, ...rest] = uniqueToReconnect;
        if (rest.length > 0) {
            localStorage.setItem(RECONNECT_QUEUE_KEY, JSON.stringify(rest.map(c => c.id)));
        } else {
            localStorage.removeItem(RECONNECT_QUEUE_KEY);
        }
        window.location.href = `/api/cohost/connections/${first.id}/gmail/start`;
    };

    // Handle OAuth redirect — drain reconnect queue if running, otherwise show success toast
    useEffect(() => {
        const result = searchParams.get('result');
        const connectionId = searchParams.get('connection_id');

        if (result === 'success' && connectionId) {
            // Check if there's a reconnect queue to continue
            const queueRaw = localStorage.getItem(RECONNECT_QUEUE_KEY);
            if (queueRaw) {
                const queue: string[] = JSON.parse(queueRaw);
                if (queue.length > 0) {
                    const [next, ...remaining] = queue;
                    localStorage.setItem(RECONNECT_QUEUE_KEY, JSON.stringify(remaining));
                    setToast({ type: 'success', message: `✓ Connected. Moving to next (${queue.length} remaining)…` });
                    setTimeout(() => {
                        window.location.href = `/api/cohost/connections/${next}/gmail/start`;
                    }, 1200);
                    return;
                } else {
                    localStorage.removeItem(RECONNECT_QUEUE_KEY);
                    setToast({ type: 'success', message: '✅ All connections reconnected!' });
                }
            } else {
                // New connection just created — show full success screen
                setShowSuccessScreen(true);
                fetchData();
            }
            router.replace('/cohost/settings/connections', { scroll: false });
        }
    }, [searchParams, router]);


    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Connections (exclude archived)
            const { data: cxData, error: cxError } = await supabase
                .from('connections')
                .select('*')
                .is('archived_at', null)  // Exclude soft-deleted connections
                .order('created_at', { ascending: false });

            if (cxError) throw cxError;

            // 2. Fetch Mappings
            const { data: mapData, error: mapError } = await supabase
                .from('connection_properties')
                .select('connection_id, property_id');

            if (mapError) throw mapError;

            // 3. Fetch Properties
            const { data: propData, error: propError } = await supabase
                .from('cohost_properties')
                .select('id, name, image_url')
                .order('name');

            if (propError) throw propError;
            setProperties(propData || []);

            // 4. Fetch Last Logs (Separate query for simplicity)
            // Ideally use a lateral join or separate aggregated view
            const { data: logData, error: logError } = await supabase
                .from('enrichment_logs')
                .select('connection_id, created_at, status, emails_processed')
                .order('created_at', { ascending: false });

            // 5. Merge Data
            const mergedConnections = (cxData || []).map(cx => {
                const mappings = (mapData || []).filter(m => m.connection_id === cx.id);
                // Find latest log for this connection
                const lastLog = logData?.find(l => l.connection_id === cx.id) || null;

                return {
                    ...cx,
                    mapped_properties_count: mappings.length,
                    mapped_property_ids: mappings.map(m => m.property_id),
                    last_enrichment: lastLog,
                    last_synced_at: cx.gmail_last_verified_at || lastLog?.created_at || null
                };
            });

            setConnections(mergedConnections);

            // Proactively verify all 'connected' connections
            healthCheckConnections(mergedConnections);

        } catch (error: any) {
            console.error('Error fetching connections:', error);
            // Don't alert on log fetch fail, just degrade gracefully
        } finally {
            setLoading(false);
        }
    };

    // Health check: verify each 'connected' connection actually works
    const healthCheckConnections = async (connectionsToCheck: Connection[]) => {
        const connectedConnections = connectionsToCheck.filter(
            cx => cx.gmail_status === 'connected'
        );

        if (connectedConnections.length === 0) return;

        // Mark all as verifying
        setVerifyingIds(new Set(connectedConnections.map(cx => cx.id)));

        // Check each connection in parallel (but update UI as each completes)
        for (const cx of connectedConnections) {
            try {
                const res = await fetch(`/api/cohost/connections/${cx.id}/gmail/labels`);
                const data = await res.json();

                // If connection needs reconnect, update local state immediately
                if (!res.ok && (data.needsReconnect || data.code === 'NEEDS_RECONNECT')) {
                    setConnections(prev => prev.map(c =>
                        c.id === cx.id
                            ? { ...c, gmail_status: 'needs_reconnect' as const }
                            : c
                    ));
                }
            } catch (err) {
                console.error(`[HealthCheck] Failed for ${cx.name}:`, err);
            } finally {
                // Remove from verifying set
                setVerifyingIds(prev => {
                    const next = new Set(prev);
                    next.delete(cx.id);
                    return next;
                });
            }
        }
    };

    // Detect provider from email domain so the host never has to choose
    const detectEmailProvider = (email: string): 'gmail' | 'microsoft' | 'smtp_yahoo' | 'smtp_icloud' | 'smtp_zoho' | 'unknown' => {
        const domain = email.split('@')[1]?.toLowerCase() || '';
        if (!domain) return 'unknown';
        if (['gmail.com', 'googlemail.com'].includes(domain)) return 'gmail';
        if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'live.co.uk', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es'].includes(domain)) return 'microsoft';
        if (domain.startsWith('yahoo.') || domain === 'ymail.com') return 'smtp_yahoo';
        if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'smtp_icloud';
        if (domain.includes('zohomail') || domain === 'zoho.com') return 'smtp_zoho';
        return 'unknown'; // custom/work domain — host must choose Google Workspace or Microsoft 365
    };

    // Single connect handler — auto-routes to the right provider
    const handleConnect = async () => {
        if (!formData.display_email) {
            setCreateError('Please enter the email address for this connection.');
            return;
        }
        if (formData.ota_platforms.length === 0) {
            setCreateError('Select at least one platform so Navi knows which emails to sync.');
            return;
        }
        const detected = detectEmailProvider(formData.display_email);
        if (detected === 'gmail') {
            await handleCreateAndConnect('gmail');
        } else if (detected === 'microsoft') {
            await handleCreateAndConnect('microsoft');
        } else if (detected.startsWith('smtp_')) {
            const smtpProvider = detected.replace('smtp_', ''); // 'yahoo', 'icloud', 'zoho'
            handleSmtpProviderChange(smtpProvider);
            setSmtpForm(prev => ({ ...prev, user: formData.display_email }));
            setSmtpCreationMode(true);
        } else {
            // Custom domain — providerChoice must be set by the host
            if (!providerChoice) {
                setCreateError('Please select your email provider above.');
                return;
            }
            await handleCreateAndConnect(providerChoice);
        }
    };

    const handleOpenModal = (cx?: Connection) => {
        setSmtpCreationMode(false);
        setCreateError(null);
        setProviderChoice(null);
        if (cx) {
            setEditingId(cx.id);
            setEditingConnection(cx);
            // Build default ota_labels: use stored labels, fall back to OTA display names
            const storedLabels = cx.ota_labels || {};
            const defaultLabels: Record<string, string> = {};
            for (const p of (cx.ota_platforms || []) as OtaPlatform[]) {
                defaultLabels[p] = storedLabels[p] || OTA_CONFIGS[p]?.label || p;
            }
            setFormData({
                name: cx.name || '',
                display_email: cx.display_email || '',
                notes: cx.notes || '',
                ota_platforms: (cx.ota_platforms || []) as OtaPlatform[],
                ota_labels: defaultLabels,
                custom_sender_query: cx.custom_sender_query || '',
                selected_property_ids: cx.mapped_property_ids || [],
                color: cx.color || ''
            });
        } else {
            setEditingId(null);
            setEditingConnection(null);
            setFormData({
                name: '',
                display_email: '',
                notes: '',
                ota_platforms: [],
                ota_labels: {},
                custom_sender_query: '',
                selected_property_ids: [],
                color: ''
            });
        }
        setIsModalOpen(true);
    };

    // Creates the connection record then immediately redirects to OAuth.
    // Called from the new-connection wizard when the host clicks "Connect Gmail"
    // or "Connect Outlook". All config (email, OTAs, properties) is captured in
    // formData before calling this.
    const handleCreateAndConnect = async (provider: 'gmail' | 'microsoft') => {
        if (!formData.display_email) {
            setCreateError('Please enter the email address for this connection.');
            return;
        }
        if (formData.ota_platforms.length === 0) {
            setCreateError('Select at least one platform so Navi knows which emails to sync.');
            return;
        }
        setCreatingConnection(true);
        setCreateError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Auto-name from email, auto-color from first OTA
            const autoName = formData.display_email.split('@')[0] || formData.display_email;
            const autoColor = getAutoColor(formData.ota_platforms);

            const { data, error } = await supabase
                .from('connections')
                .insert({
                    user_id: user.id,
                    display_email: formData.display_email,
                    name: autoName,
                    color: autoColor,
                    ota_platforms: formData.ota_platforms,
                    ota_labels: formData.ota_labels,
                    custom_sender_query: formData.custom_sender_query || null,
                    email_provider: provider,
                })
                .select()
                .single();

            if (error) throw error;

            // Save property mappings
            if (formData.selected_property_ids.length > 0) {
                await supabase.from('connection_properties').insert(
                    formData.selected_property_ids.map(pid => ({
                        connection_id: data.id,
                        property_id: pid
                    }))
                );
            }

            setIsModalOpen(false);
            // Redirect to OAuth — callback will return to this page with result=success
            window.location.href = `/api/cohost/connections/${data.id}/${provider}/start`;
        } catch (err: any) {
            setCreateError(err.message || 'Failed to create connection');
        } finally {
            setCreatingConnection(false);
        }
    };

    // Creates a connection record then saves SMTP credentials — all within the wizard.
    const handleCreateAndConnectSmtp = async () => {
        if (!formData.display_email) {
            setCreateError('Please enter the email address for this connection.');
            return;
        }
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const autoName = formData.display_email.split('@')[0] || formData.display_email;
            const autoColor = getAutoColor(formData.ota_platforms);

            const { data, error } = await supabase
                .from('connections')
                .insert({
                    user_id: user.id,
                    display_email: formData.display_email,
                    name: autoName,
                    color: autoColor,
                    ota_platforms: formData.ota_platforms,
                    ota_labels: formData.ota_labels,
                    custom_sender_query: formData.custom_sender_query || null,
                    email_provider: 'smtp',
                })
                .select()
                .single();

            if (error) throw error;

            if (formData.selected_property_ids.length > 0) {
                await supabase.from('connection_properties').insert(
                    formData.selected_property_ids.map(pid => ({
                        connection_id: data.id,
                        property_id: pid
                    }))
                );
            }

            // Hand off to the existing SMTP save handler with the new connection ID
            await handleSaveSmtp(data.id);
        } catch (err: any) {
            setSmtpError(err.message || 'Failed to create connection');
        }
    };

    const handleSave = async () => {
        if (!formData.display_email) {
            alert('Please enter an email or username.');
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            let connectionId = editingId;

            if (editingId) {
                const { error } = await supabase
                    .from('connections')
                    .update({
                        name: formData.name,
                        display_email: formData.display_email,
                        notes: formData.notes,
                        color: formData.color || null,
                        ota_platforms: formData.ota_platforms,
                        ota_labels: formData.ota_labels,
                        custom_sender_query: formData.custom_sender_query || null,
                    })
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                // INSERT
                const { data, error } = await supabase
                    .from('connections')
                    .insert({
                        user_id: user.id,
                        name: formData.name,
                        display_email: formData.display_email,
                        notes: formData.notes,
                        color: formData.color || null,
                        ota_platforms: formData.ota_platforms,
                        ota_labels: formData.ota_labels,
                        custom_sender_query: formData.custom_sender_query || null,
                    })
                    .select()
                    .single();
                if (error) throw error;
                connectionId = data.id;
            }

            // UPDATE MAPPINGS
            if (connectionId) {
                await supabase
                    .from('connection_properties')
                    .delete()
                    .eq('connection_id', connectionId);

                if (formData.selected_property_ids.length > 0) {
                    const inserts = formData.selected_property_ids.map(pid => ({
                        connection_id: connectionId,
                        property_id: pid
                    }));

                    const { error: mapError } = await supabase
                        .from('connection_properties')
                        .insert(inserts);

                    if (mapError) throw mapError;
                }
            }

            // Refresh UI
            await fetchData();
            setIsModalOpen(false);

        } catch (error: any) {
            console.error('Error saving connection:', error);
            alert('Failed to save connection: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Archive this connection? Your synced emails and data will be preserved.')) return;
        try {
            // Soft-delete: set archived_at, clear tokens, mark disconnected
            const { error } = await supabase
                .from('connections')
                .update({
                    archived_at: new Date().toISOString(),
                    gmail_status: 'disconnected',
                    gmail_access_token: null,
                    gmail_refresh_token: null
                })
                .eq('id', id);

            if (error) throw error;
            fetchData();
        } catch (error: any) {
            alert('Failed to archive: ' + error.message);
        }
    };

    const togglePropertySelection = (pid: string) => {
        const current = formData.selected_property_ids;
        if (current.includes(pid)) {
            setFormData({ ...formData, selected_property_ids: current.filter(id => id !== pid) });
        } else {
            setFormData({ ...formData, selected_property_ids: [...current, pid] });
        }
    };

    return (
        <>
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 max-w-md">
                    <div className={`rounded-lg shadow-lg border px-4 py-3 flex items-start gap-3 ${toast.type === 'success' ? 'bg-green-50 border-green-200' :
                        toast.type === 'error' ? 'bg-red-50 border-red-200' :
                            toast.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                                'bg-blue-50 border-blue-200'
                        }`}>
                        <div className={`flex-shrink-0 text-lg ${toast.type === 'success' ? 'text-green-600' :
                            toast.type === 'error' ? 'text-red-600' :
                                toast.type === 'warning' ? 'text-amber-600' :
                                    'text-blue-600'
                            }`}>
                            {toast.type === 'success' ? '✓' :
                                toast.type === 'error' ? '✕' :
                                    toast.type === 'warning' ? '⚠' : 'ℹ'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm ${toast.type === 'success' ? 'text-green-800' :
                                toast.type === 'error' ? 'text-red-800' :
                                    toast.type === 'warning' ? 'text-amber-800' :
                                        'text-blue-800'
                                }`}>
                                {toast.message}
                            </p>
                            {toast.details && (
                                <p className={`mt-0.5 text-xs ${toast.type === 'success' ? 'text-green-600' :
                                    toast.type === 'error' ? 'text-red-600' :
                                        toast.type === 'warning' ? 'text-amber-600' :
                                            'text-blue-600'
                                    }`}>
                                    {toast.details}
                                </p>
                            )}
                            {/* After OAuth success, offer to add another email */}
                            {toast.type === 'success' && toast.message.includes('connected successfully') && (
                                <button
                                    onClick={() => { setToast(null); handleOpenModal(); }}
                                    className="mt-1.5 text-xs font-medium text-green-700 underline hover:text-green-900"
                                >
                                    + Add another email
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setToast(null)}
                            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Email Connections</h1>
                        <p className="text-gray-500 mt-1">Connect the emails you use for OTA bookings. Navi reads them to populate your calendar and inbox.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {connections.some(cx => cx.gmail_status !== 'connected') && (
                            <button
                                onClick={handleReconnectAll}
                                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 shadow-sm flex items-center gap-2"
                                title="Re-authorize Gmail for all disconnected connections in sequence"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Reconnect All
                            </button>
                        )}
                        <button
                            onClick={() => handleOpenModal()}
                            className="px-4 py-2 bg-[#008080] text-white rounded-lg text-sm font-medium hover:bg-teal-700 shadow-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Email
                        </button>
                    </div>
                </header>

                {/* Success Screen — shown after OAuth redirect completes */}
                {showSuccessScreen && (
                    <div className="bg-white rounded-xl border-2 border-green-200 shadow-lg p-10 text-center animate-in fade-in">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Email Connected!</h2>
                        <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
                            Navi will start pulling your booking notifications from this inbox. First sync may take a minute or two.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => { setShowSuccessScreen(false); handleOpenModal(); }}
                                className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 shadow-sm"
                            >
                                + Add Another Email
                            </button>
                            <button
                                onClick={() => setShowSuccessScreen(false)}
                                className="px-5 py-2.5 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-teal-700 shadow-sm"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}

                {/* Email Warning */}
                {!emailConfirmed && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                        <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <p className="font-medium text-yellow-800">Email not verified</p>
                            <p className="text-sm text-yellow-700 mt-1">
                                You must verify your email address to connect external accounts.
                            </p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="p-12 text-center text-gray-400">Loading...</div>
                ) : connections.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No connections yet</h3>
                        <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                            Add your Airbnb, VRBO, or other accounts to link them with your properties.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {connections.map(cx => (
                            <div key={cx.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between hover:border-blue-200 transition-colors">
                                <div className="flex items-start gap-4 basis-full sm:basis-auto mb-4 sm:mb-0">
                                    {/* Color swatch */}
                                    <div
                                        className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0 mt-3"
                                        style={{ backgroundColor: cx.color || '#e5e7eb' }}
                                        title={cx.color ? `Color: ${cx.color}` : 'No color set'}
                                    />
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-1">
                                            {cx.name || cx.display_email}
                                        </h3>
                                        {cx.name && (
                                            <p className="text-gray-500 font-mono text-xs mb-1">{cx.display_email}</p>
                                        )}
                                        {/* OTA platform pills */}
                                        <div className="flex flex-wrap gap-1.5">
                                            {(cx.ota_platforms || []).length > 0 ? (
                                                (cx.ota_platforms as OtaPlatform[]).map(p => (
                                                    <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                                                        {(cx.ota_labels?.[p]) || OTA_CONFIGS[p]?.label || p}
                                                    </span>
                                                ))
                                            ) : cx.reservation_label ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                    {cx.reservation_label}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">No platforms configured</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Status & Actions */}
                                <div className="flex items-center gap-6 pl-4 border-l border-gray-100 basis-full sm:basis-auto justify-end sm:justify-start mt-4 sm:mt-0">

                                    <div className="flex flex-col items-end min-w-[100px]">
                                        {/* Status Chip */}
                                        {(() => {
                                            const provider = cx.email_provider || 'gmail';
                                            const isConnected =
                                                (provider === 'gmail' && cx.gmail_status === 'connected') ||
                                                (provider === 'microsoft' && cx.microsoft_status === 'connected') ||
                                                (provider === 'smtp' && cx.smtp_status === 'connected');
                                            const needsReconnect =
                                                (provider === 'gmail' && (cx.gmail_status === 'needs_reconnect' || cx.gmail_status === 'error')) ||
                                                (provider === 'microsoft' && cx.microsoft_status === 'needs_reconnect');
                                            // Setup needed when connected but no OTA platforms AND no legacy label
                                            const hasEmailSetup = (cx.ota_platforms?.length ?? 0) > 0 || !!cx.reservation_label;
                                            const needsSetup = isConnected && provider !== 'smtp' && !hasEmailSetup;

                                            const providerLabel = provider === 'microsoft' ? 'Outlook' : provider === 'smtp' ? 'SMTP' : 'Gmail';

                                            if (verifyingIds.has(cx.id)) {
                                                return (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 rounded-full border border-blue-100">
                                                        <svg className="w-3 h-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        <span className="text-xs font-medium text-blue-700">Verifying...</span>
                                                    </div>
                                                );
                                            }
                                            if (isConnected && !needsSetup) return (
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 rounded-full border border-green-100">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                        <span className="text-xs font-medium text-green-700">Connected</span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400">{providerLabel}</span>
                                                </div>
                                            );
                                            if (needsSetup) return (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 rounded-full border border-amber-100">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    <span className="text-xs font-medium text-amber-700">Needs Setup</span>
                                                </div>
                                            );
                                            if (needsReconnect) return (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-orange-50 rounded-full border border-orange-200">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                    <span className="text-xs font-medium text-orange-700">Needs Reconnect</span>
                                                </div>
                                            );
                                            return (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-50 rounded-full border border-gray-200">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                                    <span className="text-xs font-medium text-gray-600">Not Linked</span>
                                                </div>
                                            );
                                        })()}

                                        {/* Last Synced Text */}
                                        {cx.last_synced_at && cx.gmail_status === 'connected' && (
                                            <span className="text-[10px] text-gray-400 mt-1">
                                                Synced {new Date(cx.last_synced_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(cx.last_synced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 items-center">
                                        {(() => {
                                            const provider = cx.email_provider || 'gmail';
                                            const isConnected =
                                                (provider === 'gmail' && cx.gmail_status === 'connected') ||
                                                (provider === 'microsoft' && cx.microsoft_status === 'connected') ||
                                                (provider === 'smtp' && cx.smtp_status === 'connected');
                                            const needsReconnect =
                                                (provider === 'gmail' && (cx.gmail_status === 'needs_reconnect' || cx.gmail_status === 'error' || cx.gmail_status === 'disconnected')) ||
                                                (provider === 'microsoft' && cx.microsoft_status === 'needs_reconnect');

                                            if (!isConnected) {
                                                return (
                                                    <button
                                                        onClick={() => handleOpenModal(cx)}
                                                        disabled={!emailConfirmed}
                                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 shadow-sm transition-colors whitespace-nowrap disabled:opacity-50"
                                                    >
                                                        {needsReconnect ? 'Reconnect' : 'Connect Email'}
                                                    </button>
                                                );
                                            }
                                            return null;
                                        })()}
                                        {(
                                            // Gmail: connected + has OTA platforms or legacy label
                                            ((cx.email_provider === 'gmail' || !cx.email_provider) && cx.gmail_status === 'connected' && ((cx.ota_platforms?.length ?? 0) > 0 || cx.reservation_label)) ||
                                            // Microsoft: connected (OTA mode or legacy folder)
                                            (cx.email_provider === 'microsoft' && cx.microsoft_status === 'connected') ||
                                            // SMTP: connected (send-only)
                                            (cx.email_provider === 'smtp' && cx.smtp_status === 'connected')
                                        ) && (
                                            <button
                                                onClick={() => handleSync(cx.id)}
                                                disabled={!!cx.email_provider && cx.email_provider !== 'gmail' || syncingIds.has(cx.id)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
                                                title={cx.email_provider === 'smtp' ? 'SMTP: send only, no ingest' : cx.email_provider === 'microsoft' ? 'Sync from Outlook' : 'Sync from Gmail'}
                                            >
                                                <svg className={`w-3.5 h-3.5 text-gray-400 ${syncingIds.has(cx.id) ? 'animate-spin text-blue-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                {syncingIds.has(cx.id) ? 'Syncing...' : 'Sync Now'}
                                            </button>
                                        )}

                                        <div className="h-4 w-px bg-gray-200 mx-1"></div>

                                        {/* Edit */}
                                        <button
                                            onClick={() => handleOpenModal(cx)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="Edit Connection"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => handleDelete(cx.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Delete Connection"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {editingId ? 'Edit Connection' : smtpCreationMode ? 'Set Up SMTP' : 'Connect an Email'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* ── NEW CONNECTION WIZARD ───────────────────────────────────── */}
                        {!editingId && (
                            <div className="p-6 space-y-6 overflow-y-auto">
                                {/* Step 1: Email */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">
                                        Email address <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.display_email}
                                        onChange={e => setFormData({ ...formData, display_email: e.target.value })}
                                        placeholder="host@gmail.com"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-400 mt-1">The inbox that receives your booking notifications.</p>
                                </div>

                                {/* Step 2: OTA platforms */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">
                                        Which platforms send to this email? <span className="text-red-500">*</span>
                                    </label>
                                    <p className="text-xs text-gray-400 mb-3">Navi only reads emails from these platforms — nothing else.</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {OTA_PLATFORM_LIST.map(({ value, label }) => (
                                            <label key={value} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${formData.ota_platforms.includes(value) ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white hover:border-teal-300'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.ota_platforms.includes(value)}
                                                    onChange={() => toggleOtaPlatform(value)}
                                                    className="w-4 h-4 rounded border-gray-300 accent-teal-600"
                                                />
                                                <span className="text-sm text-gray-700">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {formData.ota_platforms.includes('other') && (
                                        <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Custom sender filter <span className="font-normal text-gray-400">(Gmail q= syntax)</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.custom_sender_query}
                                                onChange={e => setFormData(prev => ({ ...prev, custom_sender_query: e.target.value }))}
                                                placeholder="e.g. from:@guesty.com"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Step 3: Properties */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">Properties <span className="text-gray-400 font-normal">(optional)</span></label>
                                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
                                        {properties.length === 0 ? (
                                            <p className="p-4 text-xs text-gray-400 text-center">No properties yet.</p>
                                        ) : (
                                            properties.map(p => (
                                                <label key={p.id} className="flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.selected_property_ids.includes(p.id)}
                                                        onChange={() => togglePropertySelection(p.id)}
                                                        className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                                                    />
                                                    <span className="ml-3 text-sm text-gray-700">{p.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* SMTP credentials — shown when host clicks "Use SMTP" */}
                                {smtpCreationMode && (
                                    <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50 space-y-3">
                                        <p className="text-sm text-gray-600">Configure your Yahoo, iCloud, Zoho, or custom SMTP server.</p>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                                            <select
                                                value={smtpForm.provider}
                                                onChange={e => handleSmtpProviderChange(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                                            >
                                                <option value="yahoo">Yahoo Mail</option>
                                                <option value="icloud">iCloud Mail</option>
                                                <option value="zoho">Zoho Mail</option>
                                                <option value="custom">Custom / Other</option>
                                            </select>
                                        </div>
                                        {(smtpForm.provider === 'custom' || smtpForm.host) && (
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">SMTP Host</label>
                                                    <input type="text" value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.example.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                                                    <input type="number" value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
                                            <input type="email" value={smtpForm.user} onChange={e => setSmtpForm(p => ({ ...p, user: e.target.value }))} placeholder="you@yahoo.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">App password</label>
                                            <input type="password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} placeholder="App-specific password (not your login password)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                        </div>
                                        {smtpError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {smtpError}</div>}
                                    </div>
                                )}

                                {createError && (
                                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
                                )}
                            </div>
                        )}

                        {/* ── EDIT CONNECTION (existing) ──────────────────────────────── */}
                        {editingId && (
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Connection Name Field */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. My Primary Airbnb"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">A friendly nickname for this account (optional).</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Account Email / Username</label>
                                <input
                                    type="text"
                                    value={formData.display_email}
                                    onChange={e => setFormData({ ...formData, display_email: e.target.value })}
                                    placeholder="e.g. host@example.com"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>

                            {/* Email Provider Configuration - Only show for existing connections */}
                            {editingId && (
                                <div className="space-y-4">

                                {/* Gmail connect / reconnect */}
                                {(editingConnection?.email_provider === 'gmail' || !editingConnection?.email_provider) && (
                                <div className={`p-4 rounded-lg border-2 ${
                                    editingConnection?.gmail_status === 'connected'
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-gray-50 border-gray-200'
                                }`}>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        📧 Gmail Account
                                        {editingConnection?.gmail_status === 'connected' && (
                                            <span className="ml-2 text-xs font-normal text-green-700">✓ Connected</span>
                                        )}
                                    </label>
                                    {editingConnection?.gmail_status === 'connected' ? (
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-green-700">
                                                {editingConnection.gmail_account_email || 'Gmail connected'}
                                            </p>
                                            <button type="button" onClick={() => handleConnectGmail(editingId!)}
                                                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                                                🔄 Reconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {editingConnection?.gmail_status === 'needs_reconnect' && (
                                                <p className="text-xs text-red-600">Your Gmail access has expired. Please reconnect.</p>
                                            )}
                                            <div className="flex gap-2 flex-wrap">
                                                <button type="button" onClick={() => handleConnectGmail(editingId!)}
                                                    className="px-4 py-2 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                                                    {editingConnection?.gmail_status === 'needs_reconnect' ? '🔄 Reconnect Gmail' : '🔗 Connect Gmail'}
                                                </button>
                                                <button type="button" onClick={() => handleConnectMicrosoft(editingId!)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                                                    Use Outlook instead
                                                </button>
                                                <button type="button" onClick={() => handleSwitchToSmtp(editingId!)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                                                    Use SMTP (Yahoo / iCloud)
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}

                                {/* Microsoft / Outlook connect */}
                                {editingConnection?.email_provider === 'microsoft' && (
                                <div className={`p-4 rounded-lg border-2 ${editingConnection.microsoft_status === 'connected' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        📨 Outlook / Microsoft Account
                                    </label>
                                    {editingConnection.microsoft_status === 'connected' ? (
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-green-700">
                                                ✓ {editingConnection.microsoft_account_email}
                                            </p>
                                            <button type="button" onClick={() => handleConnectMicrosoft(editingId!)}
                                                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                                                🔄 Reconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-sm text-gray-700">
                                                Connect your Outlook, Hotmail, or Office 365 account.
                                            </p>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleConnectMicrosoft(editingId!)}
                                                    className="px-4 py-2 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                                                    🔗 Connect Outlook
                                                </button>
                                                <button type="button" onClick={() => handleConnectGmail(editingId!)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                                                    Use Gmail instead
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}

                                {/* OTA Platforms — shown for Gmail + Microsoft (not SMTP) */}
                                {editingConnection?.email_provider !== 'smtp' && (
                                <div className={`p-4 rounded-lg border-2 ${
                                    formData.ota_platforms.length > 0
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-amber-50 border-amber-200'
                                }`}>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">
                                        Which platforms send emails to this account?
                                        {formData.ota_platforms.length > 0 && (
                                            <span className="ml-2 text-xs font-normal text-green-700">✓ Configured</span>
                                        )}
                                    </label>
                                    <p className="text-xs text-gray-500 mb-3">
                                        Navi pulls only emails from these platforms. No Gmail labels or folder setup needed.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {OTA_PLATFORM_LIST.map(({ value, label }) => (
                                            <label key={value} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 bg-white hover:border-teal-300 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.ota_platforms.includes(value)}
                                                    onChange={() => toggleOtaPlatform(value)}
                                                    className="w-4 h-4 rounded border-gray-300 accent-teal-600"
                                                />
                                                <span className="text-sm text-gray-700">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {formData.ota_platforms.includes('other') && (
                                        <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Custom sender filter <span className="font-normal text-gray-400">(Gmail q= syntax)</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.custom_sender_query}
                                                onChange={e => setFormData(prev => ({ ...prev, custom_sender_query: e.target.value }))}
                                                placeholder="e.g. from:@guesty.com"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                            />
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Enter a Gmail search fragment for any unlisted platform.
                                            </p>
                                        </div>
                                    )}

                                    {formData.ota_platforms.length === 0 && (
                                        <p className="mt-2 text-xs text-amber-700">
                                            Select at least one platform so Navi knows which emails to sync.
                                        </p>
                                    )}
                                </div>
                                )}

                                {/* SMTP config */}
                                {editingConnection?.email_provider === 'smtp' && (
                                <div className={`p-4 rounded-lg border-2 ${editingConnection.smtp_status === 'connected' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">
                                        ⚙️ SMTP / App Password
                                    </label>
                                    {editingConnection.smtp_status === 'connected' ? (
                                        <p className="text-sm text-green-700 mb-3">✓ SMTP connected as <strong>{editingConnection.smtp_user}</strong></p>
                                    ) : (
                                        <p className="text-sm text-gray-600 mb-3">Configure your Yahoo, iCloud, Zoho, or custom SMTP server.</p>
                                    )}
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                                            <select
                                                value={smtpForm.provider}
                                                onChange={e => handleSmtpProviderChange(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="yahoo">Yahoo Mail</option>
                                                <option value="icloud">iCloud Mail</option>
                                                <option value="zoho">Zoho Mail</option>
                                                <option value="custom">Custom / Other</option>
                                            </select>
                                        </div>
                                        {(smtpForm.provider === 'custom' || smtpForm.host) && (
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">SMTP Host</label>
                                                    <input
                                                        type="text"
                                                        value={smtpForm.host}
                                                        onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))}
                                                        placeholder="smtp.example.com"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                                                    <input
                                                        type="number"
                                                        value={smtpForm.port}
                                                        onChange={e => setSmtpForm(p => ({ ...p, port: e.target.value }))}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
                                            <input
                                                type="email"
                                                value={smtpForm.user}
                                                onChange={e => setSmtpForm(p => ({ ...p, user: e.target.value }))}
                                                placeholder="you@yahoo.com"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">App password</label>
                                            <input
                                                type="password"
                                                value={smtpForm.password}
                                                onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))}
                                                placeholder="App-specific password (not your login password)"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Use an app-specific password, not your account password.
                                                {smtpForm.provider === 'yahoo' && <> Generate at <span className="font-medium">Account Security → App passwords</span> in Yahoo.</>}
                                                {smtpForm.provider === 'icloud' && <> Generate at <span className="font-medium">appleid.apple.com → Sign-In & Security → App-specific passwords</span>.</>}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Display name (optional)</label>
                                            <input
                                                type="text"
                                                value={smtpForm.from_name}
                                                onChange={e => setSmtpForm(p => ({ ...p, from_name: e.target.value }))}
                                                placeholder="e.g. Aloha Magic Cottage Host"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        {smtpError && (
                                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {smtpError}</div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleSaveSmtp(editingId!)}
                                            disabled={smtpSaving || !smtpForm.user || !smtpForm.password}
                                            className="w-full px-4 py-2 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
                                        >
                                            {smtpSaving ? 'Verifying & Saving...' : '✓ Save & Test SMTP Connection'}
                                        </button>
                                    </div>
                                    {/* Switch to OAuth provider */}
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p className="text-xs text-gray-500 mb-2">Switch to a different provider:</p>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleConnectGmail(editingId!)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Use Gmail</button>
                                            <button type="button" onClick={() => handleConnectMicrosoft(editingId!)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Use Outlook</button>
                                        </div>
                                    </div>
                                </div>
                                )}


                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Map to Properties</label>
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                    {properties.length === 0 ? (
                                        <p className="p-4 text-xs text-gray-400 text-center">No properties found.</p>
                                    ) : (
                                        properties.map(p => (
                                            <label key={p.id} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.selected_property_ids.includes(p.id)}
                                                    onChange={() => togglePropertySelection(p.id)}
                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <span className="ml-3 text-sm text-gray-700">{p.name}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                        )} {/* end editingId block */}

                        {/* ── FOOTER ──────────────────────────────────────────────────── */}
                        {/* New connection: single Connect button — auto-detects provider */}
                        {!editingId && !smtpCreationMode && (
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                                {/* Custom domain: host must pick Google Workspace or Microsoft 365 */}
                                {formData.display_email && detectEmailProvider(formData.display_email) === 'unknown' && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-2 text-center">We couldn't auto-detect your provider — is this a work email?</p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setProviderChoice('gmail')}
                                                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${providerChoice === 'gmail' ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                                            >
                                                Google Workspace
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setProviderChoice('microsoft')}
                                                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${providerChoice === 'microsoft' ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                                            >
                                                Microsoft 365
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={handleConnect}
                                    disabled={creatingConnection || !emailConfirmed || !formData.display_email || (detectEmailProvider(formData.display_email) === 'unknown' && !providerChoice)}
                                    className="w-full px-4 py-3 bg-[#008080] text-white text-sm font-semibold rounded-lg hover:bg-teal-700 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creatingConnection ? (
                                        <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saving…</>
                                    ) : '🔗 Connect'}
                                </button>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-sm text-gray-400 hover:text-gray-600 text-center"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                        {/* New connection: SMTP save button */}
                        {!editingId && smtpCreationMode && (
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                                <button
                                    onClick={() => setSmtpCreationMode(false)}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={handleCreateAndConnectSmtp}
                                    disabled={smtpSaving || !smtpForm.user || !smtpForm.password}
                                    className="flex-1 px-4 py-2 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
                                >
                                    {smtpSaving ? 'Verifying & Saving...' : '✓ Save & Test SMTP'}
                                </button>
                            </div>
                        )}
                        {/* Edit connection: save button */}
                        {editingId && (
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm"
                                >
                                    Save Changes
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default function ConnectionsSettingsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
            <ConnectionsSettingsPageInner />
        </Suspense>
    );
}
