const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/cohost/calendar?start=2026-04-01T00:00:00.000Z&end=2026-05-01T00:00:00.000Z',
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
