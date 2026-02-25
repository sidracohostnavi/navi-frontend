async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/cohost/calendar?start=2026-04-01T00:00:00.000Z&end=2026-05-01T00:00:00.000Z', {
      headers: {
        // Need to pass some cookie if possible... wait, API requires authenticated user.
      }
    });
    console.log(res.status);
  } catch (e) {
    console.error(e);
  }
}
run();
