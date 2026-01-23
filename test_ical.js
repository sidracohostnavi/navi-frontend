const ical = require('node-ical');

async function test() {
    console.log('Testing node-ical...');
    try {
        console.log('Import successful.');
        // Just check if async exists
        if (ical.async && ical.async.fromURL) {
            console.log('ical.async.fromURL exists.');
        } else {
            console.error('ical.async.fromURL is MISSING.');
            console.log('Keys:', Object.keys(ical));
            // Check if it's the sync version only?
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
