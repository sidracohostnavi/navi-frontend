import { headers } from 'next/headers';
import CalendarClient from './CalendarClient';

export default async function CalendarPage() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  return <CalendarClient apiBase={base} />;
}
