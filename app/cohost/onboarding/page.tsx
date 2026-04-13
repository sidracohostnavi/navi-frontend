'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

// ── Progress weights — front-loaded so early steps feel fast ───────────────
// Steps: 0=loading, 1=welcome, 2=scrape, 3=details, 4=ical, 5=connections
const STEP_PROGRESS = [0, 0, 25, 50, 75, 100];

// ── Platform email addresses for Gmail filter setup ───────────────────────
const PLATFORM_EMAILS: Record<string, { from: string; label: string }> = {
  Airbnb:          { from: '@airbnb.com',              label: 'Airbnb' },
  VRBO:            { from: '@messages.homeaway.com',   label: 'VRBO' },
  Lodgify:         { from: '@lodgify.com',             label: 'Lodgify' },
  'Booking.com':   { from: '@booking.com',             label: 'Booking.com' },
};

const AMENITIES_LIST = [
  'WiFi','Kitchen','Washer','Dryer','Air conditioning','Heating','TV','Pool',
  'Hot tub','Free parking','EV charger','Gym','BBQ grill','Patio','Backyard',
  'Fire pit','Beach access','Waterfront','Ski-in/ski-out','Smoke alarm',
  'Carbon monoxide alarm','First aid kit','Fire extinguisher','Essentials',
  'Shampoo','Conditioner','Body wash','Towels','Bed linens','Hangers',
  'Iron','Hair dryer','Workspace','Coffee maker','Dishwasher',
];

const PROPERTY_TYPES = ['House','Apartment','Condo','Townhouse','Cabin','Villa','Cottage','Bungalow','Guesthouse','Loft','Other'];

const STEPS_LIST = [
  { icon: '🏠', label: 'Direct Bookings' },
  { icon: '💳', label: 'Get paid for direct bookings' },
  { icon: '📅', label: 'Calendar Sync' },
  { icon: '✉️', label: 'Automated Messaging' },
];

// ── Tiny helpers ──────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#008080]/25 bg-white';
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const reviewCls = 'w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-[#008080]/10 text-[#008080] rounded hover:bg-[#008080]/20 transition-colors">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// ── Gmail step guide ──────────────────────────────────────────────────────
const GMAIL_STEPS = [
  {
    title: 'Open Gmail Settings',
    instruction: 'In Gmail, click the gear icon ⚙️ in the top-right corner, then click "See all settings".',
    img: '/onboarding/gmail/step-1-settings.png',
  },
  {
    title: 'Go to the Labels tab',
    instruction: 'In Settings, click the "Labels" tab. Scroll down until you see the Labels section with a "Create new label" button.',
    img: '/onboarding/gmail/step-2-labelstab.png',
  },
  {
    title: 'Create a label for each platform',
    instruction: 'Click "Create new label". Name it exactly after the platform (e.g. "Airbnb"). Click Create. Repeat for each platform you use.',
    img: '/onboarding/gmail/step-3-create-label.png',
  },
  {
    title: 'Go to Filters and Blocked Addresses',
    instruction: 'Click the "Filters and Blocked Addresses" tab. Click "Create a new filter" at the bottom.',
    img: '/onboarding/gmail/step-4-filters-tab.png',
  },
  {
    title: 'Set the From address',
    instruction: (platform: string) => `In the "From" field, type the platform email below. Leave all other fields blank. Click "Continue".`,
    img: '/onboarding/gmail/step-5-from-field.png',
    showEmail: true,
  },
  {
    title: 'Apply the filter actions',
    instruction: 'Check these boxes: ✓ Skip the Inbox (Archive it) ✓ Mark as read ✓ Apply the label (select the label you just created) ✓ Never send it to Spam. Then check "Also apply filter to matching conversations" and click "Create filter".',
    img: '/onboarding/gmail/step-6-filter-actions.png',
  },
  {
    title: 'Confirm your label appears in Gmail',
    instruction: 'Back in your Gmail inbox, look at the left sidebar under "Labels". You should see your new label listed there. You\'re all set for this platform!',
    img: '/onboarding/gmail/step-7-sideabar.png',
  },
];

// ── Field wrapper — defined outside to prevent unmount-on-rerender focus loss ─
function Field({ id, label, importedFields, children }: { id: string; label: string; importedFields: Set<string>; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {importedFields.has(id) && (
          <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Auto-filled — please review</span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────
function OnboardingWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState(0); // 0 = loading, renders nothing until load() sets the real step
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const [importedFields, setImportedFields] = useState<Set<string>>(new Set()); // which fields were auto-filled

  // Step 9: connections
  const [allConnections, setAllConnections] = useState<any[]>([]);
  const [selectedConnIds, setSelectedConnIds] = useState<string[]>([]);
  const [connSubStep, setConnSubStep] = useState<'list' | 'create_form' | 'label_select' | 'add_another'>('list');
  const [newConnName, setNewConnName] = useState('');
  const [newConnPlatform, setNewConnPlatform] = useState('airbnb');
  const [creatingConn, setCreatingConn] = useState(false);
  const [sessionConnections, setSessionConnections] = useState<{ id: string; name: string; label: string }[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [savingConnections, setSavingConnections] = useState(false);
  // Step 10: checklist — sourced from DB so they survive page reloads
  const [hasIcalFeeds, setHasIcalFeeds] = useState(false);
  const [hasGmailConnected, setHasGmailConnected] = useState(false);

  // Step 9: Gmail sub-flow (used within label_select sub-step)
  const [wizardConnectionId, setWizardConnectionId] = useState<string | null>(null);
  const [gmailAccountEmail, setGmailAccountEmail] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailLabelSaved, setGmailLabelSaved] = useState(false);
  const [gmailLabels, setGmailLabels] = useState<{ id: string; name: string }[]>([]);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailGuideOpen, setGmailGuideOpen] = useState(false);
  const [gmailStep, setGmailStep] = useState(0);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [currentPlatformIndex, setCurrentPlatformIndex] = useState(0);

  // Step 2: URLs
  const [urls, setUrls] = useState({ airbnb: '', vrbo: '', booking: '', direct: '' });

  // Step 3–6: property form
  const [form, setForm] = useState({
    name: '', property_type: 'House', street_address: '', city: '', state: '', country: 'US',
    bedrooms: 1, beds: 1, bathrooms: 1, max_guests: 2, check_in_time: '15:00', check_out_time: '11:00',
    amenities: [] as string[],
  });

  // Step 4: description
  const [desc, setDesc] = useState({ headline: '', description: '', your_property: '', guest_access: '', other_details: '' });

  // Step 6: pricing
  const [pricing, setPricing] = useState({ nightly_rate: '', cleaning_fee: '', min_nights: '1', max_nights: '30' });

  // Step 7: direct booking
  const [directBooking, setDirectBooking] = useState({ slug: '', direct_booking_enabled: false });
  const [stripeConnected, setStripeConnected] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  // Step 8: iCal feeds
  const [icalFeeds, setIcalFeeds] = useState([{ source_name: 'Airbnb', url: '' }, { source_name: 'VRBO', url: '' }]);

  const progressBarRef = useRef<HTMLDivElement>(null);

  // ── Load all connections when step 5 is reached ──────────────────────────
  useEffect(() => {
    if (step !== 5 || !workspaceId) return;
    const fetchAll = async () => {
      setLoadingConnections(true);
      const { data } = await supabase
        .from('connections')
        .select('id, name, platform, gmail_status, gmail_label_name, gmail_account_email')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      setAllConnections(data || []);
      setLoadingConnections(false);
    };
    fetchAll();
  }, [step, workspaceId]);

  // ── Load workspace + resume step ────────────────────────────────────────
  useEffect(() => {
    const isNew = searchParams.get('new') === 'true';
    const gmailSuccess = searchParams.get('gmail') === 'success';
    const gmailConnectionId = searchParams.get('connection_id');
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      const { data: workspace } = await supabase
        .from('cohost_workspaces')
        .select('id, onboarding_step, onboarding_completed')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (!workspace) { router.push('/auth/login'); return; }

      // If already completed and not explicitly adding a new property, redirect
      if (workspace.onboarding_completed && !isNew) { router.push('/cohost/calendar'); return; }
      if (workspace.onboarding_completed) setAlreadyCompleted(true);

      setWorkspaceId(workspace.id);
      const lsKey = `navi_wiz_${workspace.id}`;

      // Returning from Gmail OAuth — restore step 9 + label_select sub-step
      if (gmailSuccess && gmailConnectionId) {
        setWizardConnectionId(gmailConnectionId);
        setGmailConnected(true);
        setConnSubStep('label_select');
        const localStep = localStorage.getItem(lsKey);
        setStep(localStep ? parseInt(localStep) : 9);
        // Fetch account email + name from connection
        const { data: oauthConn } = await supabase
          .from('connections')
          .select('gmail_account_email, name')
          .eq('id', gmailConnectionId)
          .maybeSingle();
        if (oauthConn?.gmail_account_email) setGmailAccountEmail(oauthConn.gmail_account_email);
        if (oauthConn?.name) setNewConnName(oauthConn.name);
        await loadLabels(gmailConnectionId);
        // fall through to load draft
      } else if (isNew) {
        const lsStep = parseInt(localStorage.getItem(lsKey) || '0');
        if (lsStep > 1) {
          // Refresh mid-wizard — resume from where they were
          setStep(lsStep);
        } else {
          // Genuine fresh start — clear any stale state
          localStorage.removeItem(lsKey);
          const { count } = await supabase
            .from('cohost_properties')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspace.id)
            .eq('onboarding_draft', false);
          setStep((count ?? 0) > 0 ? 2 : 1);
        }
      } else if (!workspace.onboarding_completed) {
        // First-time onboarding — resume from DB
        const savedStep = workspace.onboarding_step || 1;
        if (savedStep > 1) setStep(savedStep);
      }

      // Check if property draft exists
      const { data: draft } = await supabase
        .from('cohost_properties')
        .select('id, name, property_type, street_address, city, state, country, bedrooms, beds, bathrooms, max_guests, check_in_time, check_out_time, amenities, headline, description, your_property, guest_access, other_details, nightly_rate, cleaning_fee, min_nights, max_nights, slug, direct_booking_enabled')
        .eq('workspace_id', workspace.id)
        .eq('onboarding_draft', true)
        .maybeSingle();

      if (draft) {
        setPropertyId(draft.id);
        setForm({
          name: draft.name || '',
          property_type: draft.property_type || 'House',
          street_address: draft.street_address || '',
          city: draft.city || '',
          state: draft.state || '',
          country: draft.country || 'US',
          bedrooms: draft.bedrooms || 1,
          beds: draft.beds || 1,
          bathrooms: draft.bathrooms || 1,
          max_guests: draft.max_guests || 2,
          check_in_time: draft.check_in_time || '15:00',
          check_out_time: draft.check_out_time || '11:00',
          amenities: draft.amenities || [],
        });
        setDesc({
          headline: draft.headline || '',
          description: draft.description || '',
          your_property: draft.your_property || '',
          guest_access: draft.guest_access || '',
          other_details: draft.other_details || '',
        });
        setPricing({
          nightly_rate: draft.nightly_rate ? String(draft.nightly_rate / 100) : '',
          cleaning_fee: draft.cleaning_fee ? String(draft.cleaning_fee / 100) : '',
          min_nights: String(draft.min_nights || 1),
          max_nights: String(draft.max_nights || 30),
        });
        setDirectBooking({
          slug: draft.slug || '',
          direct_booking_enabled: draft.direct_booking_enabled || false,
        });
      }

      // Check Stripe
      const { data: wsData } = await supabase
        .from('cohost_workspaces')
        .select('stripe_onboarding_complete')
        .eq('id', workspace.id)
        .maybeSingle();
      if (wsData?.stripe_onboarding_complete) setStripeConnected(true);

      // Check iCal feeds saved for this property draft
      if (draft?.id) {
        const { count } = await supabase
          .from('ical_feeds')
          .select('id', { count: 'exact', head: true })
          .eq('property_id', draft.id);
        if ((count ?? 0) > 0) setHasIcalFeeds(true);
      }

      // Check if any connection in this workspace has Gmail active with a label
      const { data: gmailConns } = await supabase
        .from('connections')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('gmail_status', 'connected')
        .not('gmail_label_name', 'is', null)
        .limit(1);
      if (gmailConns && gmailConns.length > 0) setHasGmailConnected(true);
    };
    load();
  }, []);

  // ── Save step progress to DB ─────────────────────────────────────────────
  const saveStep = async (s: number) => {
    if (!workspaceId) return;
    await supabase.from('cohost_workspaces').update({ onboarding_step: s }).eq('id', workspaceId);
  };

  const goTo = async (s: number) => {
    await saveStep(s);
    if (workspaceId) localStorage.setItem(`navi_wiz_${workspaceId}`, String(s));
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    if (step === 5 && connSubStep !== 'list') {
      if (connSubStep === 'create_form') setConnSubStep('list');
      else if (connSubStep === 'add_another') setConnSubStep('list');
      return;
    }
    if (step > 1) goTo(step - 1);
  };

  // ── Step 2: Import ───────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    setImportErrors({});
    try {
      const res = await fetch('/api/cohost/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airbnb_url: urls.airbnb, vrbo_url: urls.vrbo, booking_url: urls.booking, direct_url: urls.direct }),
      });
      const data = await res.json();
      if (!res.ok) return;

      const filled = new Set<string>();
      const f = data.fields;

      const strVal = (key: string) => f[key]?.value || null;
      const numVal = (key: string) => f[key]?.value || null;

      if (strVal('property_name')) { setForm(p => ({ ...p, name: strVal('property_name') })); filled.add('name'); }
      if (strVal('property_type')) { setForm(p => ({ ...p, property_type: strVal('property_type') })); filled.add('property_type'); }
      if (strVal('city')) { setForm(p => ({ ...p, city: strVal('city') })); filled.add('city'); }
      if (strVal('state')) { setForm(p => ({ ...p, state: strVal('state') })); filled.add('state'); }
      if (strVal('country')) { setForm(p => ({ ...p, country: strVal('country') })); filled.add('country'); }
      if (strVal('street_address')) { setForm(p => ({ ...p, street_address: strVal('street_address') })); filled.add('street_address'); }
      if (numVal('bedrooms')) { setForm(p => ({ ...p, bedrooms: numVal('bedrooms') })); filled.add('bedrooms'); }
      if (numVal('beds')) { setForm(p => ({ ...p, beds: numVal('beds') })); filled.add('beds'); }
      if (numVal('bathrooms')) { setForm(p => ({ ...p, bathrooms: numVal('bathrooms') })); filled.add('bathrooms'); }
      if (numVal('max_guests')) { setForm(p => ({ ...p, max_guests: numVal('max_guests') })); filled.add('max_guests'); }
      if (strVal('check_in_time')) { setForm(p => ({ ...p, check_in_time: strVal('check_in_time') })); filled.add('check_in_time'); }
      if (strVal('check_out_time')) { setForm(p => ({ ...p, check_out_time: strVal('check_out_time') })); filled.add('check_out_time'); }
      if (f['amenities']?.value?.length) { setForm(p => ({ ...p, amenities: f['amenities'].value })); filled.add('amenities'); }
      if (strVal('headline')) { setDesc(p => ({ ...p, headline: strVal('headline') })); filled.add('headline'); }
      if (strVal('description')) { setDesc(p => ({ ...p, description: strVal('description') })); filled.add('description'); }
      if (numVal('nightly_rate')) { setPricing(p => ({ ...p, nightly_rate: String(numVal('nightly_rate')) })); filled.add('nightly_rate'); }
      if (numVal('min_nights')) { setPricing(p => ({ ...p, min_nights: String(numVal('min_nights')) })); filled.add('min_nights'); }

      setImportedFields(filled);
      if (data.extraction_errors) setImportErrors(data.extraction_errors);
    } catch { /* silent — user can still fill manually */ }
    finally {
      setImporting(false);
      goTo(3);
    }
  };

  // ── Step 3–6: Save property to DB ────────────────────────────────────────
  const saveProperty = async () => {
    if (!workspaceId) return null;
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspaceId,
        onboarding_draft: true,
        name: form.name,
        property_type: form.property_type,
        street_address: form.street_address,
        city: form.city,
        state: form.state,
        country: form.country,
        bedrooms: form.bedrooms,
        beds: form.beds,
        bathrooms: form.bathrooms,
        max_guests: form.max_guests,
        check_in_time: form.check_in_time,
        check_out_time: form.check_out_time,
        amenities: form.amenities,
        headline: desc.headline,
        description: desc.description,
        your_property: desc.your_property,
        guest_access: desc.guest_access,
        other_details: desc.other_details,
        nightly_rate: pricing.nightly_rate ? Math.round(parseFloat(pricing.nightly_rate) * 100) : null,
        cleaning_fee: pricing.cleaning_fee ? Math.round(parseFloat(pricing.cleaning_fee) * 100) : 0,
        min_nights: parseInt(pricing.min_nights) || 1,
        max_nights: parseInt(pricing.max_nights) || 30,
        slug: directBooking.slug || null,
        direct_booking_enabled: directBooking.direct_booking_enabled,
      };

      if (propertyId) {
        await supabase.from('cohost_properties').update(payload).eq('id', propertyId);
        return propertyId;
      } else {
        const { data } = await supabase.from('cohost_properties').insert(payload).select('id').single();
        if (data) { setPropertyId(data.id); return data.id; }
      }
    } finally { setSaving(false); }
    return null;
  };

  // ── Step 8: Save iCal feeds ──────────────────────────────────────────────
  const saveIcalFeeds = async (propId: string) => {
    let saved = false;
    for (const feed of icalFeeds) {
      if (!feed.url.trim()) continue;
      // Skip if this exact URL already exists for this property (prevents duplicates on resume)
      const { count } = await supabase
        .from('ical_feeds')
        .select('id', { count: 'exact', head: true })
        .eq('property_id', propId)
        .eq('ical_url', feed.url.trim());
      if ((count ?? 0) > 0) continue;
      await supabase.from('ical_feeds').insert({
        property_id: propId,
        source_name: feed.source_name,
        ical_url: feed.url.trim(),
        source_type: 'other',
        is_active: true,
      });
      saved = true;
    }
    if (saved) setHasIcalFeeds(true);
  };

  // ── Step 9: Gmail helpers ─────────────────────────────────────────────────
  const loadLabels = async (connId: string) => {
    setLoadingLabels(true);
    setGmailError(null);
    try {
      const res = await fetch(`/api/cohost/connections/${connId}/gmail/labels`);
      const data = await res.json();
      if (res.ok) {
        setGmailLabels(data.labels || []);
      } else {
        setGmailError(data.error || 'Could not load labels from Gmail.');
      }
    } catch {
      setGmailError('Network error loading labels. Please try again.');
    }
    setLoadingLabels(false);
  };

  // ── Step 9: Create a new connection in DB ────────────────────────────────
  const createWizardConnection = async (): Promise<string | null> => {
    if (!workspaceId) return null;
    setCreatingConn(true);
    try {
      const { data } = await supabase
        .from('connections')
        .insert({ workspace_id: workspaceId, name: newConnName.trim() || 'My Connection', platform: newConnPlatform })
        .select('id')
        .single();
      if (data) { setWizardConnectionId(data.id); return data.id; }
      return null;
    } finally { setCreatingConn(false); }
  };

  // ── Step 9: Save connection → property mappings ───────────────────────────
  const saveConnectionMappings = async (propId: string) => {
    if (!propId) return;
    const allToSave = [...new Set([...selectedConnIds, ...sessionConnections.map(c => c.id)])];
    for (const connId of allToSave) {
      await supabase.from('connection_properties')
        .upsert({ connection_id: connId, property_id: propId }, { onConflict: 'connection_id,property_id' });
    }
  };

  // ── After step 5: mark property as no longer a draft, redirect to calendar ─
  const finishWizard = async () => {
    setSaving(true);
    if (propertyId) {
      await supabase.from('cohost_properties').update({ onboarding_draft: false }).eq('id', propertyId);
    }
    if (workspaceId) localStorage.removeItem(`navi_wiz_${workspaceId}`);
    setSaving(false);
    router.push('/cohost/calendar');
  };

  // ── Connect Stripe ────────────────────────────────────────────────────────
  const connectStripe = async () => {
    setConnectingStripe(true);
    try {
      const res = await fetch('/api/cohost/stripe/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally { setConnectingStripe(false); }
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progress = STEP_PROGRESS[Math.min(step, STEP_PROGRESS.length - 1)];

  // ── Field input with review highlight ────────────────────────────────────
  // ── Gmail guide current platform ─────────────────────────────────────────
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30 flex flex-col">

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 fixed top-0 left-0 right-0 z-50">
        <div
          className="h-full bg-gradient-to-r from-[#008080] to-[#00a0a0] transition-all duration-700 ease-out relative overflow-hidden"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>

      {/* Header */}
      <header className="pt-1 px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <img src="/mascots/cohost.png" alt="Navi CoHost" className="w-8 h-8 rounded-full" />
          <span className="font-bold text-[#FF5A5F] text-lg tracking-tight">Navi CoHost</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-medium">
            {step <= 1 ? 'Getting started' : `Step ${step - 1} of 4`}
          </span>
          {step > 1 && (
            <button onClick={() => goTo(1)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
              Restart
            </button>
          )}
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">

          {/* Loading — wait for load() to set real step before rendering anything */}
          {step === 0 && (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-[#008080] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── STEP 1: Welcome ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="text-center space-y-8 animate-fadeIn">

              {/* Mascot */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-[#FF5A5F]/20 blur-2xl scale-125" />
                  <Image
                    src="/mascots/cohost.png"
                    alt="Navi CoHost"
                    width={128} height={128}
                    className="relative w-32 h-32 rounded-full shadow-2xl ring-4 ring-white object-cover"
                  />
                </div>
              </div>

              {/* Heading */}
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900">Welcome to Navi CoHost!</h1>
                <p className="text-base text-gray-500">Everything you need to manage your short-term rental in one place.</p>
              </div>

              {/* Feature tags */}
              <div className="flex flex-wrap justify-center gap-2">
                {['Direct Bookings', 'Calendar Sync', 'Cleaning Schedule', 'Automated Messaging'].map(f => (
                  <span key={f} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 shadow-sm">
                    {f}
                  </span>
                ))}
              </div>

              {/* Steps away — counts down as wizard progresses */}
              <p className="text-2xl font-black text-gray-900">
                You are{' '}
                <span className="text-[#008080]">{Math.max(0, STEPS_LIST.length - (step - 1))}</span>
                {' '}{Math.max(0, STEPS_LIST.length - (step - 1)) === 1 ? 'step' : 'steps'} away
              </p>

              {/* CTA — above bars */}
              <button onClick={() => goTo(2)}
                className="px-10 py-4 bg-[#FF5A5F] text-white font-bold text-lg rounded-full shadow-lg hover:bg-[#e54e53] hover:shadow-xl transition-all hover:scale-105 active:scale-95">
                Let's go →
              </button>

              {/* Animated bars */}
              <div className="max-w-xs mx-auto space-y-4">
                {STEPS_LIST.map(({ icon, label }, idx) => (
                  <div key={label} className="text-left space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{icon}</span>
                      <span className="text-sm font-semibold text-gray-700">{label}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#008080] to-[#00b3b3] relative overflow-hidden"
                        style={{
                          width: 0,
                          animation: `barFill 0.6s cubic-bezier(0.4,0,0.2,1) ${idx * 0.65}s forwards`,
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* ── STEP 2: Import ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <button onClick={goBack} className="mb-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
                <h2 className="text-2xl font-bold text-gray-900">Import your existing listing</h2>
                <p className="text-gray-500 mt-2">Paste your listing URLs below and we'll pre-fill as much as we can. All fields are optional — you can always skip and fill manually.</p>
              </div>

              {Object.keys(importErrors).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
                  <p className="font-semibold">Some URLs couldn't be fetched:</p>
                  {Object.entries(importErrors).map(([platform, err]) => (
                    <p key={platform}>• <strong>{platform}:</strong> {err}</p>
                  ))}
                  <p className="text-xs mt-2">You can still fill in the details manually on the next screen.</p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                {[
                  { key: 'airbnb', label: 'Airbnb listing URL', placeholder: 'https://www.airbnb.com/rooms/12345678' },
                  { key: 'vrbo', label: 'VRBO listing URL', placeholder: 'https://www.vrbo.com/12345678' },
                  { key: 'booking', label: 'Booking.com URL', placeholder: 'https://www.booking.com/hotel/...' },
                  { key: 'direct', label: 'Your own website URL', placeholder: 'https://yoursite.com/my-cabin' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input type="url" value={(urls as any)[key]}
                      onChange={e => setUrls(u => ({ ...u, [key]: e.target.value }))}
                      placeholder={placeholder} className={inputCls} />
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={handleImport} disabled={importing}
                  className="flex-1 py-4 bg-[#008080] text-white font-bold rounded-full shadow-lg hover:bg-[#006666] transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2">
                  {importing ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing…</> : '✨ Import & pre-fill →'}
                </button>
                <button onClick={() => goTo(3)}
                  className="px-6 py-4 border border-gray-200 text-gray-500 font-medium rounded-full hover:bg-gray-50 transition-colors">
                  Fill manually
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Details & Settings ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <button onClick={goBack} className="mb-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
                <h2 className="text-2xl font-bold text-gray-900">Property details</h2>
                <p className="text-gray-500 mt-1">
                  {importedFields.size > 0
                    ? <span className="text-amber-600 font-medium">✓ {importedFields.size} fields pre-filled — please review each one carefully before continuing.</span>
                    : 'Tell us about your property.'}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Field id="name" label="Property name *" importedFields={importedFields}>
                      <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className={importedFields.has('name') ? reviewCls : inputCls} placeholder="e.g. Aloha Magic Cottage" />
                    </Field>
                  </div>
                  <Field id="property_type" label="Property type" importedFields={importedFields}>
                    <select value={form.property_type} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}
                      className={importedFields.has('property_type') ? reviewCls : inputCls}>
                      {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field id="max_guests" label="Max guests" importedFields={importedFields}>
                    <input type="number" min="1" value={form.max_guests} onChange={e => setForm(f => ({ ...f, max_guests: parseInt(e.target.value) }))}
                      className={importedFields.has('max_guests') ? reviewCls : inputCls} />
                  </Field>
                  <Field id="bedrooms" label="Bedrooms" importedFields={importedFields}>
                    <input type="number" min="0" value={form.bedrooms} onChange={e => setForm(f => ({ ...f, bedrooms: parseInt(e.target.value) }))}
                      className={importedFields.has('bedrooms') ? reviewCls : inputCls} />
                  </Field>
                  <Field id="beds" label="Beds" importedFields={importedFields}>
                    <input type="number" min="1" value={form.beds} onChange={e => setForm(f => ({ ...f, beds: parseInt(e.target.value) }))}
                      className={importedFields.has('beds') ? reviewCls : inputCls} />
                  </Field>
                  <Field id="bathrooms" label="Bathrooms" importedFields={importedFields}>
                    <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={e => setForm(f => ({ ...f, bathrooms: parseFloat(e.target.value) }))}
                      className={importedFields.has('bathrooms') ? reviewCls : inputCls} />
                  </Field>
                  <div className="md:col-span-2">
                    <Field id="street_address" label="Street address" importedFields={importedFields}>
                      <input type="text" value={form.street_address} onChange={e => setForm(f => ({ ...f, street_address: e.target.value }))}
                        className={importedFields.has('street_address') ? reviewCls : inputCls} placeholder="123 Main St" />
                    </Field>
                  </div>
                  <Field id="city" label="City" importedFields={importedFields}>
                    <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      className={importedFields.has('city') ? reviewCls : inputCls} placeholder="Honolulu" />
                  </Field>
                  <Field id="state" label="State / Province" importedFields={importedFields}>
                    <input type="text" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                      className={importedFields.has('state') ? reviewCls : inputCls} placeholder="HI" />
                  </Field>
                  <Field id="check_in_time" label="Check-in time" importedFields={importedFields}>
                    <input type="time" value={form.check_in_time} onChange={e => setForm(f => ({ ...f, check_in_time: e.target.value }))}
                      className={importedFields.has('check_in_time') ? reviewCls : inputCls} />
                  </Field>
                  <Field id="check_out_time" label="Check-out time" importedFields={importedFields}>
                    <input type="time" value={form.check_out_time} onChange={e => setForm(f => ({ ...f, check_out_time: e.target.value }))}
                      className={importedFields.has('check_out_time') ? reviewCls : inputCls} />
                  </Field>
                </div>

                <div>
                  <label className={labelCls}>
                    Amenities
                    {importedFields.has('amenities') && <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Auto-filled — please review</span>}
                  </label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {AMENITIES_LIST.map(a => (
                      <button key={a} type="button"
                        onClick={() => setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.amenities.includes(a) ? 'bg-[#008080] text-white border-[#008080]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={async () => { await saveProperty(); goTo(4); }} disabled={!form.name || saving}
                className="w-full py-4 bg-[#008080] text-white font-bold rounded-full shadow-lg hover:bg-[#006666] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100">
                {saving ? 'Saving…' : 'Looks good, continue →'}
              </button>
            </div>
          )}


          {/* ── STEP 4: iCal Feeds ──────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <button onClick={goBack} className="mb-3 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
                <h2 className="text-2xl font-bold text-gray-900">Sync your calendars</h2>
                <p className="text-gray-500 mt-1">Paste the iCal feed URLs from your existing platforms. This keeps your availability automatically in sync.</p>
              </div>

              <div className="bg-[#008080]/5 border border-[#008080]/15 rounded-xl p-4 text-sm text-[#008080]">
                <p className="font-semibold mb-1">Where to find your iCal URL:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Airbnb:</strong> Calendar → Availability → Export Calendar</li>
                  <li>• <strong>VRBO:</strong> Calendar → Import/Export → Export iCal</li>
                  <li>• <strong>Lodgify:</strong> Calendar → Sync → iCal Link</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                {icalFeeds.map((feed, idx) => (
                  <div key={idx} className="flex gap-3">
                    <input type="text" value={feed.source_name} placeholder="e.g. Airbnb"
                      onChange={e => setIcalFeeds(f => f.map((x, i) => i === idx ? { ...x, source_name: e.target.value } : x))}
                      className="w-36 rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#008080]/20" />
                    <input type="url" value={feed.url} placeholder="https://…ical…"
                      onChange={e => setIcalFeeds(f => f.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))}
                      className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#008080]/20" />
                    <button onClick={() => setIcalFeeds(f => f.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                <button onClick={() => setIcalFeeds(f => [...f, { source_name: '', url: '' }])}
                  className="flex items-center gap-2 text-sm text-[#008080] font-medium hover:text-[#006666]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add another feed
                </button>
              </div>

              <button onClick={async () => {
                const pid = propertyId || await saveProperty();
                if (pid) await saveIcalFeeds(pid);
                goTo(5);
              }} disabled={saving}
                className="w-full py-4 bg-[#008080] text-white font-bold rounded-full shadow-lg hover:bg-[#006666] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                {saving ? 'Saving…' : 'Continue →'}
              </button>
              <button onClick={() => goTo(5)} className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Skip — I'll add feeds later
              </button>
            </div>
          )}

          {/* ── STEP 5: Gmail connections ────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-start gap-3">
                {connSubStep !== 'label_select' && (
                  <button onClick={goBack}
                    className="mt-1 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                    ← Back
                  </button>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Connect Gmail</h2>
                  <p className="text-gray-500 mt-1 text-sm">
                    {connSubStep === 'list' && 'Associate Gmail connections with this property. Navi watches these for booking emails to auto-fill guest names and details.'}
                    {connSubStep === 'create_form' && 'Create a new Gmail connection for a platform account.'}
                    {connSubStep === 'label_select' && 'Select the Gmail label Navi should watch for booking confirmation emails.'}
                    {connSubStep === 'add_another' && 'Connection saved! Each platform account needs its own connection.'}
                  </p>
                </div>
              </div>

              {/* ── list sub-step ── */}
              {connSubStep === 'list' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                    {loadingConnections ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        Loading connections…
                      </div>
                    ) : allConnections.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500">No connections yet. Create your first one below.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your connections</p>
                        {allConnections.map(conn => (
                          <label key={conn.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedConnIds.includes(conn.id)}
                              onChange={e => setSelectedConnIds(prev =>
                                e.target.checked ? [...prev, conn.id] : prev.filter(id => id !== conn.id)
                              )}
                              className="w-4 h-4 accent-[#008080] rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{conn.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-400 capitalize">{conn.platform}</span>
                                {conn.gmail_status === 'connected' ? (
                                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">Gmail active</span>
                                ) : conn.gmail_status ? (
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Gmail inactive</span>
                                ) : null}
                                {conn.gmail_label_name && (
                                  <span className="text-[10px] font-medium text-[#008080] bg-[#008080]/10 px-1.5 py-0.5 rounded-full">
                                    {conn.gmail_label_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => setConnSubStep('create_form')}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 rounded-xl hover:border-[#008080]/40 hover:text-[#008080] transition-all">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Add new connection
                    </button>
                  </div>

                  <button
                    onClick={async () => {
                      const pid = propertyId || await saveProperty();
                      if (pid && selectedConnIds.length > 0) await saveConnectionMappings(pid);
                      finishWizard();
                    }}
                    disabled={saving}
                    className="w-full py-4 bg-[#008080] text-white font-bold rounded-full shadow-lg hover:bg-[#006666] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                    {saving ? 'Saving…' : selectedConnIds.length > 0
                      ? `Associate ${selectedConnIds.length} connection${selectedConnIds.length !== 1 ? 's' : ''} & continue →`
                      : 'Continue without associating →'}
                  </button>

                  <button onClick={() => finishWizard()} className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Skip — I'll set this up later
                  </button>
                </div>
              )}

              {/* ── create_form sub-step ── */}
              {connSubStep === 'create_form' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                    <div>
                      <label className={labelCls}>Connection name</label>
                      <input
                        type="text"
                        value={newConnName}
                        onChange={e => setNewConnName(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. Spark & Stay – Airbnb"
                        autoFocus
                      />
                      <p className="text-xs text-gray-400 mt-1.5">Name it something memorable — you may have multiple per platform.</p>
                    </div>
                    <div>
                      <label className={labelCls}>Platform</label>
                      <select value={newConnPlatform} onChange={e => setNewConnPlatform(e.target.value)} className={inputCls}>
                        <option value="airbnb">Airbnb</option>
                        <option value="vrbo">VRBO</option>
                        <option value="lodgify">Lodgify</option>
                        <option value="booking">Booking.com</option>
                        <option value="direct">Direct</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="p-3 bg-[#008080]/5 border border-[#008080]/15 rounded-xl text-sm text-gray-600">
                      <p className="font-semibold text-gray-700 mb-1">Next: Gmail authorization</p>
                      <p className="text-xs">You'll be redirected to Google to grant read-only Gmail access. After that, you'll select the label Navi should watch for booking emails from this platform.</p>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      const connId = await createWizardConnection();
                      if (connId) {
                        if (workspaceId) localStorage.setItem(`navi_wiz_${workspaceId}`, '5');
                        window.location.href = `/api/cohost/connections/${connId}/gmail/start?return_to=onboarding`;
                      }
                    }}
                    disabled={!newConnName.trim() || creatingConn}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50">
                    {creatingConn
                      ? <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />Creating…</>
                      : <>
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                          Continue to Gmail →
                        </>
                    }
                  </button>
                </div>
              )}

              {/* ── label_select sub-step ── */}
              {connSubStep === 'label_select' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                      <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className="text-sm font-semibold text-green-800">
                        Gmail authorized{gmailAccountEmail ? ` · ${gmailAccountEmail}` : ''}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className={labelCls}>Which label should Navi watch?</label>
                        <button onClick={() => wizardConnectionId && loadLabels(wizardConnectionId)}
                          className="text-xs text-[#008080] hover:text-[#006666] font-medium flex items-center gap-1">
                          <span>↻</span> Refresh
                        </button>
                      </div>

                      {gmailError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 space-y-2">
                          <p>{gmailError}</p>
                          <button onClick={() => wizardConnectionId && loadLabels(wizardConnectionId)}
                            className="text-xs font-semibold underline">Try again</button>
                        </div>
                      )}

                      {loadingLabels ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400 px-4 py-3 border border-gray-200 rounded-xl">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /> Loading labels…
                        </div>
                      ) : (
                        <select value={selectedLabel} onChange={e => setSelectedLabel(e.target.value)} className={inputCls}>
                          <option value="">— select a label —</option>
                          {gmailLabels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                        </select>
                      )}

                      {gmailLabels.length === 0 && !loadingLabels && !gmailError && (
                        <p className="text-xs text-gray-500">No labels found. <button onClick={() => setGmailGuideOpen(true)} className="text-[#008080] underline">Create one in Gmail →</button>, then hit Refresh above.</p>
                      )}

                      <button
                        onClick={async () => {
                          if (!wizardConnectionId || !selectedLabel) return;
                          setSavingLabel(true);
                          const labelObj = gmailLabels.find(l => l.name === selectedLabel);
                          const res = await fetch(`/api/cohost/connections/${wizardConnectionId}/gmail/labels`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ label_id: labelObj?.id || selectedLabel, label_name: selectedLabel }),
                          });
                          if (res.ok) {
                            setGmailLabelSaved(true);
                            setHasGmailConnected(true);
                            setSessionConnections(prev => [...prev, { id: wizardConnectionId!, name: newConnName || 'Connection', label: selectedLabel }]);
                            setConnSubStep('add_another');
                          }
                          setSavingLabel(false);
                        }}
                        disabled={!selectedLabel || savingLabel || loadingLabels}
                        className="w-full py-3.5 bg-[#008080] text-white font-bold rounded-xl hover:bg-[#006666] transition-colors disabled:opacity-40">
                        {savingLabel ? 'Saving…' : 'Save label & continue →'}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible guide */}
                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <button onClick={() => setGmailGuideOpen(o => !o)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📖</span>
                        <span className="text-sm font-semibold text-gray-700">How to create Gmail labels for booking emails</span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${gmailGuideOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {gmailGuideOpen && (
                      <div className="bg-white border-t border-gray-100 p-5 space-y-5 animate-fadeIn">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Which platform?</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(PLATFORM_EMAILS).map(p => (
                              <button key={p} onClick={() => { setSelectedPlatforms([p]); setCurrentPlatformIndex(0); setGmailStep(1); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedPlatforms[0] === p ? 'bg-[#008080] text-white border-[#008080]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        {selectedPlatforms.length > 0 && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500">Step {gmailStep} of {GMAIL_STEPS.length}</span>
                              <div className="flex gap-1">
                                {GMAIL_STEPS.map((_, i) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i + 1 === gmailStep ? 'bg-[#008080] scale-125' : i + 1 < gmailStep ? 'bg-[#008080]/40' : 'bg-gray-200'}`} />
                                ))}
                              </div>
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-gray-900">{GMAIL_STEPS[gmailStep - 1].title}</h3>
                              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                {typeof GMAIL_STEPS[gmailStep - 1].instruction === 'function'
                                  ? (GMAIL_STEPS[gmailStep - 1].instruction as Function)(selectedPlatforms[0])
                                  : GMAIL_STEPS[gmailStep - 1].instruction}
                              </p>
                              {(GMAIL_STEPS[gmailStep - 1] as any).showEmail && PLATFORM_EMAILS[selectedPlatforms[0]] && (
                                <div className="mt-2 flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                                  <code className="text-xs font-mono text-gray-800">{PLATFORM_EMAILS[selectedPlatforms[0]].from}</code>
                                  <CopyButton text={PLATFORM_EMAILS[selectedPlatforms[0]].from} />
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl overflow-hidden border border-gray-100">
                              <Image src={GMAIL_STEPS[gmailStep - 1].img} alt={GMAIL_STEPS[gmailStep - 1].title}
                                width={700} height={400} className="w-full object-contain" unoptimized />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => gmailStep > 1 ? setGmailStep(s => s - 1) : null}
                                disabled={gmailStep === 1}
                                className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors">
                                ← Back
                              </button>
                              <button onClick={() => gmailStep < GMAIL_STEPS.length ? setGmailStep(s => s + 1) : setGmailGuideOpen(false)}
                                className="flex-1 py-2.5 bg-[#008080] text-white text-sm font-bold rounded-xl hover:bg-[#006666] transition-colors">
                                {gmailStep < GMAIL_STEPS.length ? 'Next →' : 'Done — close guide ✓'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── add_another sub-step ── */}
              {connSubStep === 'add_another' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-[#008080]/5 border border-[#008080]/20 rounded-xl">
                      <span className="text-2xl">✅</span>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">
                          {sessionConnections[sessionConnections.length - 1]?.name || 'Connection'} connected
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Watching label: <strong>{sessionConnections[sessionConnections.length - 1]?.label || selectedLabel}</strong>
                        </p>
                      </div>
                    </div>

                    {sessionConnections.length > 1 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Added this session</p>
                        {sessionConnections.map(sc => (
                          <div key={sc.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            {sc.name} <span className="text-gray-400 text-xs">· {sc.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-semibold text-gray-800">Add another connection?</p>
                      <p className="text-xs text-gray-500 mt-1">Add one per platform account. Two Airbnb accounts = two connections.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setNewConnName('');
                        setNewConnPlatform('airbnb');
                        setWizardConnectionId(null);
                        setGmailConnected(false);
                        setGmailLabels([]);
                        setSelectedLabel('');
                        setGmailLabelSaved(false);
                        setGmailError(null);
                        setConnSubStep('create_form');
                      }}
                      className="flex-1 py-3.5 border-2 border-[#008080] text-[#008080] font-semibold rounded-full hover:bg-[#008080]/5 transition-colors">
                      Yes, add another
                    </button>
                    <button
                      onClick={async () => {
                        const pid = propertyId || await saveProperty();
                        if (pid) await saveConnectionMappings(pid);
                        finishWizard();
                      }}
                      disabled={saving}
                      className="flex-1 py-3.5 bg-[#008080] text-white font-bold rounded-full shadow-lg hover:bg-[#006666] transition-all active:scale-95 disabled:opacity-50">
                      {saving ? 'Saving…' : "No, I'm done →"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer { animation: shimmer 2s infinite; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.35s ease-out both; }
        @keyframes barFill {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}

export default function OnboardingWizardPage() {
  return (
    <Suspense>
      <OnboardingWizardInner />
    </Suspense>
  );
}
