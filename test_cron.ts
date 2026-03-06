import { GET } from './app/api/cron/refresh/route';

async function test() {
  const req = new Request('http://localhost:3000/api/cron/refresh', {
    headers: { 'authorization': 'Bearer cohost-cron-secret-2024-xyz' }
  });
  try {
    const res = await GET(req as any);
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  } catch (err) {
    console.error("Test Error:", err);
  }
}
test();
