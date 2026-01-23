
import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// -- Types --
type ImportReport = {
    source: string;
    fieldsFound: string[];
    rawCounts: Record<string, any>;
};

// -- Constants --
const AMENITY_MAP: Record<string, string> = {
    'Wifi': 'Wifi',
    'Wireless Internet': 'Wifi',
    'Pool': 'Pool',
    'Hot tub': 'Hot Tub',
    'Kitchen': 'Kitchen',
    'Air conditioning': 'Air conditioning',
    'Washer': 'Washer',
    'Dryer': 'Dryer',
    'TV': 'TV',
    'Heating': 'Heating',
    'Smoke alarm': 'Smoke alarm',
    'Carbon monoxide alarm': 'Carbon monoxide alarm',
    'Fire extinguisher': 'Fire extinguisher',
    'First aid kit': 'First aid kit',
    'Self check-in': 'Self check-in',
    'Free parking on premises': 'Free parking',
    'Free street parking': 'Street parking',
};

// -- Helpers --

// Deep search for a key in a large JSON object (for Next.js props)
function findKey(obj: any, key: string): any {
    if (!obj || typeof obj !== 'object') return null;
    if (key in obj) return obj[key];

    for (const k in obj) {
        if (obj[k] && typeof obj[k] === 'object') {
            const result = findKey(obj[k], key);
            if (result) return result;
        }
    }
    return null;
}

// Extract amenities from text
function extractAmenities(text: string): string[] {
    const found: string[] = [];
    const lowerText = text.toLowerCase();
    for (const [key, val] of Object.entries(AMENITY_MAP)) {
        if (lowerText.includes(key.toLowerCase())) {
            found.push(val);
        }
    }
    return Array.from(new Set(found));
}

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

        console.log(`[Import] Processing ${url}...`);

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });

        if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html);

        let data: any = {};
        const report: ImportReport = {
            source: 'Text Fallback',
            fieldsFound: [],
            rawCounts: {}
        };

        // --- Strategy 1: JSON-LD (Standard) ---
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const json = JSON.parse($(el).html() || '{}');
                // Handle array of JSON-LD objects
                const items = Array.isArray(json) ? json : [json];

                for (const item of items) {
                    if (['Accommodation', 'VacationRental', 'Hotel', 'Apartment', 'LodgingBusiness'].includes(item['@type'])) {
                        console.log('[Import] Found JSON-LD Accommodation');
                        report.source = 'JSON-LD (Structured Data)';

                        // Basic Fields
                        if (item.name) data.name = item.name;
                        if (item.description) data.description = item.description;
                        if (item.image) {
                            data.image_url = Array.isArray(item.image) ? item.image[0] : (item.image.url || item.image);
                        }

                        // Address
                        if (item.address) {
                            data.streetAddress = item.address.streetAddress;
                            data.city = item.address.addressLocality;
                            data.state = item.address.addressRegion;
                            data.country = item.address.addressCountry;
                        }

                        // Capacity (Schema.org 'amenityFeature' or specific extensions?)
                        // Usually schema.org doesn't enforce bedrooms explicitly in valid JSON-LD for generic Accommodation 
                        // as strictly as we want, but looks for specific prop extensions.
                        // We check for Occupancy if present:
                        if (item.occupancy && item.occupancy.quantitativeValue) {
                            data.maxGuests = item.occupancy.quantitativeValue.value;
                        }
                    }
                }
            } catch (e) { console.error('JSON-LD Parse Error', e); }
        });


        // --- Strategy 2: Next.js Data / Airbnb Redux (Deep Extraction) ---
        // This is often more reliable for Bedrooms/Bathrooms than JSON-LD on Airbnb
        if (!data.bedrooms || !data.maxGuests) {
            const nextDataScript = $('#__NEXT_DATA__').html();
            const airbnbDataScript = $('script[id="data-deferred-state"]').html(); // Airbnb explicit

            let deepData: any = null;

            if (nextDataScript) {
                try {
                    const json = JSON.parse(nextDataScript);
                    deepData = json; // Traverse this
                    report.source = 'Next.js Hydration Data';
                } catch (e) { }
            } else if (airbnbDataScript) {
                try {
                    const json = JSON.parse(airbnbDataScript);
                    deepData = json;
                    report.source = 'Airbnb Internal State';
                } catch (e) { }
            }

            if (deepData) {
                // Heuristic search for keys usually found in Airbnb/VRBO state objects
                // "guestLabel", "bedroomLabel", "bathroomLabel" often appear in display sections
                // Or "listing" object

                const listing = findKey(deepData, 'listing') || findKey(deepData, 'pdp_listing_detail'); // Airbnb common keys

                if (listing) {
                    // Airbnb Listing Object
                    if (listing.name) data.name = listing.name;
                    if (listing.person_capacity) data.maxGuests = listing.person_capacity;
                    if (listing.bedroom_label) {
                        // "2 bedrooms"
                        const match = listing.bedroom_label.match(/(\d+)/);
                        if (match) data.bedrooms = parseInt(match[1]);
                    }
                    if (listing.bathroom_label) {
                        const match = listing.bathroom_label.match(/([\d.]+)/);
                        if (match) data.bathrooms = parseFloat(match[1]);
                    }
                    if (listing.bed_label) {
                        const match = listing.bed_label.match(/(\d+)/);
                        if (match) data.beds = parseInt(match[1]);
                    }

                    if (listing.guest_controls) {
                        data.maxGuests = listing.guest_controls.person_capacity;
                    }
                }
            }
        }

        // --- Strategy 3: Text Fallback (Cheerio) ---
        // If still missing core capacity data
        if (!data.maxGuests || !data.bedrooms) {
            // "X guests . Y bedrooms" string is usually visible in top section
            const bodyText = $('body').text();

            // Regex for common "hosted by" or overview lines
            // "4 guests · 2 bedrooms · 2 beds · 1 bath"
            // We search for a reliable sequence
            const overviewRegex = /(\d+)\s+guests?.*?(\d+)\s+bedrooms?.*?(\d+)\s+beds?.*?([\d.]+)\s+bath/;
            const match = bodyText.match(overviewRegex);

            if (match) {
                report.source = report.source === 'Text Fallback' ? 'Regex Scraper' : report.source + ' + Regex';
                if (!data.maxGuests) data.maxGuests = parseInt(match[1]);
                if (!data.bedrooms) data.bedrooms = parseInt(match[2]);
                if (!data.beds) data.beds = parseInt(match[3]);
                if (!data.bathrooms) data.bathrooms = parseFloat(match[4]);
            }
        }

        // --- Cleanup & Amenities ---
        if (!data.name) {
            data.name = $('meta[property="og:title"]').attr('content') || $('title').text();
        }
        if (!data.description) {
            data.description = $('meta[name="description"]').attr('content');
        }
        if (!data.streetAddress && data.name) {
            // Heuristic: Airbnb titles often "Name - City"
            // Not robust but helpful
        }

        // Amenities are hard to find in specific JSON keys without massive mapping
        // Use text scraper fallback for amenities list
        data.amenities = extractAmenities($('body').text());

        // Report population
        if (data.name) report.fieldsFound.push('name');
        if (data.description) report.fieldsFound.push('description');
        if (data.streetAddress) report.fieldsFound.push('address');
        if (data.maxGuests) report.fieldsFound.push('guests');
        if (data.bedrooms) report.fieldsFound.push('bedrooms');
        if (data.amenities.length > 0) report.fieldsFound.push(`amenities (${data.amenities.length})`);

        report.rawCounts = {
            guests: data.maxGuests,
            bedrooms: data.bedrooms,
            beds: data.beds,
            baths: data.bathrooms
        };

        // Final Cleanup
        if (data.name) data.name = data.name.split(' - Airbnb')[0].split(' - Vrbo')[0].trim();

        return NextResponse.json({ success: true, data, report });

    } catch (error: any) {
        console.error('[Import Error]', error);
        return NextResponse.json({ error: error.message || 'Failed to import' }, { status: 500 });
    }
}
