import { GET } from './app/api/cohost/calendar/route';

async function run() {
  const req = new Request('http://localhost:3000/api/cohost/calendar?start=2026-03-31&end=2026-04-10', {
    method: 'GET',
    headers: {
      'cookie': 'sb-axwepnpgkfodkyjtownf-auth-token=dummy' 
    }
  });

  const res = await GET(req as any);
  const data = await res.json();
  
  const kiaBooking = data.bookings.find((b: any) => b.check_in === '2026-04-04T00:00:00.000Z' || b.guest_name === 'Kia');
  console.log("calendar /api/cohost/calendar returned:");
  console.dir(kiaBooking);
}
run();
