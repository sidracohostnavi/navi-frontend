/**
 * OTA platform sender definitions.
 *
 * Each entry maps an OTA key (stored in connections.ota_platforms[]) to the
 * sender domains/addresses used for Gmail and Microsoft Graph queries.
 *
 * Strategy: match by @domain rather than specific addresses so we catch all
 * notification types from each platform (confirmations, messages, updates).
 * The email classifier already rejects non-reservation emails downstream.
 */

export type OtaPlatform =
  | 'airbnb'
  | 'vrbo'
  | 'booking_com'
  | 'lodgify'
  | 'hipcamp'
  | 'furnished_finder'
  | 'tripadvisor'
  | 'other';

export interface OtaConfig {
  /** Display label shown in UI */
  label: string;
  /** Gmail API q= fragment — combined with OR when multiple OTAs on one connection */
  gmailQuery: string;
  /** Sender domains for Microsoft Graph $filter (contains match) */
  senderDomains: string[];
}

export const OTA_CONFIGS: Record<OtaPlatform, OtaConfig> = {
  airbnb: {
    label: 'Airbnb',
    gmailQuery: 'from:(@airbnb.com)',
    senderDomains: ['airbnb.com'],
  },
  vrbo: {
    label: 'VRBO',
    // VRBO operates under HomeAway — both domains are active
    gmailQuery: 'from:(@vrbo.com OR @homeaway.com)',
    senderDomains: ['vrbo.com', 'homeaway.com'],
  },
  booking_com: {
    label: 'Booking.com',
    gmailQuery: 'from:(@booking.com)',
    senderDomains: ['booking.com'],
  },
  lodgify: {
    label: 'Lodgify',
    gmailQuery: 'from:(@lodgify.com)',
    senderDomains: ['lodgify.com'],
  },
  hipcamp: {
    label: 'Hipcamp',
    gmailQuery: 'from:(@hipcamp.com)',
    senderDomains: ['hipcamp.com'],
  },
  furnished_finder: {
    label: 'Furnished Finder',
    gmailQuery: 'from:(@furnishedfinder.com)',
    senderDomains: ['furnishedfinder.com'],
  },
  tripadvisor: {
    label: 'Tripadvisor / FlipKey',
    gmailQuery: 'from:(@tripadvisor.com OR @flipkey.com)',
    senderDomains: ['tripadvisor.com', 'flipkey.com'],
  },
  other: {
    // No built-in query — relies on connection.custom_sender_query
    label: 'Other',
    gmailQuery: '',
    senderDomains: [],
  },
};

/**
 * Build a Gmail API q= query string for the given OTA platforms.
 * Falls back to customSenderQuery for 'other' or when ota_platforms is empty.
 *
 * Returns null if no query can be built (connection has neither platforms nor
 * a custom query — fall back to reservation_label in the processor).
 */
export function buildGmailQuery(
  platforms: OtaPlatform[],
  customSenderQuery?: string | null,
): string | null {
  const parts: string[] = platforms
    .filter(p => p !== 'other')
    .map(p => OTA_CONFIGS[p].gmailQuery)
    .filter(Boolean);

  if (customSenderQuery?.trim()) {
    parts.push(customSenderQuery.trim());
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return parts.map(q => `(${q})`).join(' OR ');
}

/**
 * Build a KQL search string for Microsoft Graph $search on the messages endpoint.
 *
 * Graph $filter doesn't support contains() on sender address for domain-level
 * matching — $search with KQL is the correct approach.
 *
 * Returns a string like: from:airbnb.com OR from:vrbo.com
 * Caller wraps it in quotes: ?$search="from:airbnb.com OR from:vrbo.com"
 *
 * Note: custom_sender_query is Gmail syntax and is silently ignored for
 * Microsoft connections — only the known OTA domains are used.
 */
export function buildMicrosoftSearchQuery(
  platforms: OtaPlatform[],
): string | null {
  const domains: string[] = platforms
    .filter(p => p !== 'other')
    .flatMap(p => OTA_CONFIGS[p].senderDomains);

  if (domains.length === 0) return null;
  return domains.map(d => `from:${d}`).join(' OR ');
}

/**
 * Detect which OTA sent an email by matching the sender's address against
 * known OTA domains for the connection's configured platforms.
 *
 * fromEmail — the raw From header value, e.g. "Airbnb <automated@airbnb.com>"
 * platforms — the connection's ota_platforms[] value
 *
 * Returns the matching OtaPlatform key, or null if no domain matches.
 */
export function detectOtaFromSender(
  fromEmail: string,
  platforms: OtaPlatform[],
): OtaPlatform | null {
  if (!fromEmail) return null;
  const lower = fromEmail.toLowerCase();

  for (const platform of platforms) {
    if (platform === 'other') continue;
    const config = OTA_CONFIGS[platform];
    if (config.senderDomains.some(domain => lower.includes(domain))) {
      return platform;
    }
  }
  return null;
}

/** Ordered list for the onboarding UI checkboxes */
export const OTA_PLATFORM_LIST: { value: OtaPlatform; label: string }[] = [
  { value: 'airbnb',          label: 'Airbnb' },
  { value: 'vrbo',            label: 'VRBO' },
  { value: 'booking_com',     label: 'Booking.com' },
  { value: 'lodgify',         label: 'Lodgify' },
  { value: 'hipcamp',         label: 'Hipcamp' },
  { value: 'furnished_finder',label: 'Furnished Finder' },
  { value: 'tripadvisor',     label: 'Tripadvisor / FlipKey' },
  { value: 'other',           label: 'Other (specify below)' },
];
