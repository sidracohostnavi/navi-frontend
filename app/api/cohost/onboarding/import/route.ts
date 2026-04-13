import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Shared property schema ─────────────────────────────────────────────────
interface ExtractedProperty {
  property_name: string | null;
  property_type: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  street_address: string | null;
  max_guests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  headline: string | null;
  description: string | null;
  amenities: string[];
  check_in_time: string | null;
  check_out_time: string | null;
  photos: string[];
  nightly_rate: number | null;
  min_nights: number | null;
}

interface FieldResult {
  value: any;
  confidence: 'high' | 'medium' | 'low' | 'needs_review';
  sources: string[];
  candidates?: any[];
  evidence?: string;
}

interface MergedPayload {
  fields: Record<string, FieldResult>;
  raw_per_source: Record<string, Partial<ExtractedProperty>>;
  conflicts: string[];
  extraction_errors: Record<string, string>;
}

// ── Fetch page with timeout ───────────────────────────────────────────────
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Extract structured data from HTML ────────────────────────────────────
function extractStructured(html: string, platform: string): { structured: Partial<ExtractedProperty>; visibleText: string } {
  const structured: Partial<ExtractedProperty> = {};

  // JSON-LD
  const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const item = Array.isArray(data) ? data[0] : data;
      if (item['@type'] === 'LodgingBusiness' || item['@type'] === 'VacationRental' || item['@type'] === 'Accommodation') {
        if (item.name) structured.property_name = item.name;
        if (item.description) structured.description = item.description;
        if (item.address) {
          structured.city = item.address.addressLocality || null;
          structured.state = item.address.addressRegion || null;
          structured.country = item.address.addressCountry || null;
          structured.street_address = item.address.streetAddress || null;
        }
        if (item.amenityFeature) {
          structured.amenities = item.amenityFeature.map((a: any) => a.name || a).filter(Boolean);
        }
        if (item.image) {
          const imgs = Array.isArray(item.image) ? item.image : [item.image];
          structured.photos = imgs.map((i: any) => (typeof i === 'string' ? i : i.url)).filter(Boolean).slice(0, 20);
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }

  // OG / meta tags
  const getMeta = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]*(?:property|name)="${prop}"[^>]*content="([^"]*)"`, 'i'))
      || html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="${prop}"`, 'i'));
    return m ? m[1] : null;
  };
  if (!structured.property_name) structured.property_name = getMeta('og:title') || getMeta('twitter:title');
  if (!structured.description) structured.description = getMeta('og:description') || getMeta('description');
  const ogImage = getMeta('og:image');
  if (ogImage && (!structured.photos || structured.photos.length === 0)) structured.photos = [ogImage];

  // Strip HTML for visible text — remove scripts, styles, nav, footer
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n')
    .trim()
    .slice(0, 12000); // cap for AI input

  return { structured, visibleText };
}

// ── AI extraction layer ───────────────────────────────────────────────────
async function aiExtract(visibleText: string, platform: string): Promise<Partial<ExtractedProperty>> {
  if (!visibleText || visibleText.length < 100) return {};

  const prompt = `You are extracting property listing data from a ${platform} listing page.
Return ONLY valid JSON. Extract ONLY facts explicitly visible in the text. Never guess. Return null for anything not clearly stated.

Text:
${visibleText}

Return this exact JSON structure (all fields required, use null if not found):
{
  "property_name": string or null,
  "property_type": string or null,
  "city": string or null,
  "state": string or null,
  "country": string or null,
  "street_address": string or null,
  "max_guests": number or null,
  "bedrooms": number or null,
  "beds": number or null,
  "bathrooms": number or null,
  "headline": string or null,
  "description": string or null (max 500 chars),
  "amenities": string[] (only clearly listed amenities),
  "check_in_time": string or null (format "HH:MM"),
  "check_out_time": string or null (format "HH:MM"),
  "nightly_rate": number or null (numeric only, no currency symbol),
  "min_nights": number or null
}`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Merge results across sources ─────────────────────────────────────────
function mergeSources(results: Record<string, Partial<ExtractedProperty>>): MergedPayload {
  const fields: Record<string, FieldResult> = {};
  const conflicts: string[] = [];
  const sources = Object.keys(results);

  const allKeys: (keyof ExtractedProperty)[] = [
    'property_name', 'property_type', 'city', 'state', 'country', 'street_address',
    'max_guests', 'bedrooms', 'beds', 'bathrooms', 'headline', 'description',
    'amenities', 'check_in_time', 'check_out_time', 'photos', 'nightly_rate', 'min_nights',
  ];

  for (const key of allKeys) {
    const sourceValues: { source: string; value: any }[] = [];
    for (const source of sources) {
      const val = results[source][key];
      if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) {
        sourceValues.push({ source, value: val });
      }
    }

    if (sourceValues.length === 0) {
      fields[key] = { value: Array.isArray(results[sources[0]]?.[key]) ? [] : null, confidence: 'low', sources: [] };
      continue;
    }

    if (sourceValues.length === 1) {
      fields[key] = { value: sourceValues[0].value, confidence: 'medium', sources: [sourceValues[0].source] };
      continue;
    }

    // Multiple sources — check agreement
    if (key === 'amenities' || key === 'photos') {
      // Merge arrays
      const merged = [...new Set(sourceValues.flatMap(s => s.value as string[]))];
      fields[key] = { value: merged, confidence: 'high', sources: sourceValues.map(s => s.source) };
      continue;
    }

    const v0 = String(sourceValues[0].value).toLowerCase().trim();
    const allAgree = sourceValues.every(s => String(s.value).toLowerCase().trim() === v0);

    if (allAgree) {
      fields[key] = { value: sourceValues[0].value, confidence: 'high', sources: sourceValues.map(s => s.source) };
    } else {
      conflicts.push(key);
      fields[key] = {
        value: sourceValues[0].value,
        confidence: 'needs_review',
        sources: sourceValues.map(s => s.source),
        candidates: sourceValues.map(s => ({ source: s.source, value: s.value })),
      };
    }
  }

  return { fields, raw_per_source: results, conflicts, extraction_errors: {} };
}

// ── Main handler ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { airbnb_url, vrbo_url, booking_url, direct_url } = await request.json();
    const urlMap: Record<string, string> = {};
    if (airbnb_url?.trim()) urlMap['Airbnb'] = airbnb_url.trim();
    if (vrbo_url?.trim()) urlMap['VRBO'] = vrbo_url.trim();
    if (booking_url?.trim()) urlMap['Booking.com'] = booking_url.trim();
    if (direct_url?.trim()) urlMap['Direct'] = direct_url.trim();

    if (Object.keys(urlMap).length === 0) {
      return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
    }

    const results: Record<string, Partial<ExtractedProperty>> = {};
    const extraction_errors: Record<string, string> = {};

    await Promise.all(
      Object.entries(urlMap).map(async ([platform, url]) => {
        const html = await fetchPage(url);
        if (!html) {
          extraction_errors[platform] = 'Could not fetch page — platform may be blocking automated access.';
          results[platform] = {};
          return;
        }
        const { structured, visibleText } = extractStructured(html, platform);
        const ai = await aiExtract(visibleText, platform);
        // Merge structured (deterministic) over AI (fills gaps)
        results[platform] = { ...ai, ...Object.fromEntries(Object.entries(structured).filter(([, v]) => v !== null && v !== undefined)) };
      })
    );

    const merged = mergeSources(results);
    merged.extraction_errors = extraction_errors;

    return NextResponse.json(merged);
  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
