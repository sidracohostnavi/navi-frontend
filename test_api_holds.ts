import { GET } from './app/api/cohost/calendar/route';

async function run() {
  const req = new Request('http://localhost:3000/api/cohost/calendar?start=2026-03-10&end=2026-03-26', {
    method: 'GET',
    headers: {
      'cookie': 'sb-axwepnpgkfodkyjtownf-auth-token=dummy'
    }
  });

  // Oh, wait, HTTP GET will fail with 401 locally because cookie is invalid.
  // Instead, let's just write the exact logic.
}
run();
