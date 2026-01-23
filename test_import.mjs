import * as ical from 'node-ical';

async function test() {
    console.log('Testing node-ical import * ...');
    try {
        console.log('Import successful.');
        console.log('ical keys:', Object.keys(ical));

        // Check content
        if (ical.async && ical.async.fromURL) {
            console.log('ical.async.fromURL exists.');
        } else if (ical.default && ical.default.async && ical.default.async.fromURL) {
            console.log('ical.default.async.fromURL exists.');
        } else {
            console.error('ical.async is MISSING on the imported object.');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
