import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  // Strip .ics extension if present (some OTAs append it to the URL)
  const propertyId = (await params).propertyId.replace(/\.ics$/i, '');

  if (!propertyId) {
    return new NextResponse('Missing propertyId', { status: 400 });
  }

  // Get property info
  const { data: property, error: propError } = await supabase
    .from('cohost_properties')
    .select('id, name, workspace_id')
    .eq('id', propertyId)
    .single();

  if (propError || !property) {
    return new NextResponse('Property not found', { status: 404 });
  }

  // Get all active bookings for this property
  // We only include future bookings or those that ended recently
  const { data: bookings, error: bookError } = await supabase
    .from('bookings')
    .select('id, check_in, check_out, guest_name, status, source, external_uid')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .gte('check_out', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Include last 30 days

  if (bookError) {
    console.error('[iCalExport] Error fetching bookings:', bookError);
  }

  // Generate iCal content
  const icalContent = generateICal(property, bookings || []);

  return new NextResponse(icalContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function generateICal(property: any, bookings: any[]): string {
  const lines: string[] = [];

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Navi CoHost//Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeIcal(property.name)}`);
  lines.push('X-WR-TIMEZONE:UTC');

  for (const booking of bookings) {
    // Use a stable UID — prefer external_uid so round-tripped events stay deduped
    const uid = booking.external_uid || `navi-${booking.id}@navicohost.com`;
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
    lines.push(`DTSTART;VALUE=DATE:${formatICalDateOnly(checkIn)}`);
    lines.push(`DTEND;VALUE=DATE:${formatICalDateOnly(checkOut)}`);
    // Use "Blocked" — this is the standard summary for blocking dates on other OTAs
    lines.push('SUMMARY:Blocked');
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // RFC 5545: fold lines longer than 75 octets with CRLF + single space
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** RFC 5545 §3.1 — fold lines at 75 octets */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  let result = '';
  let current = '';
  for (const char of line) {
    const next = current + char;
    if (encoder.encode(next).length > 75) {
      result += current + '\r\n ';
      current = char;
    } else {
      current = next;
    }
  }
  return result + current;
}

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatICalDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function escapeIcal(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
