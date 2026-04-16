// ─────────────────────────────────────────────────────────────────────────────
// apify.js — Apify Google Maps scraper client
// Uses the compass~crawler-google-places actor (same one in your n8n workflow)
// to search for HVAC/plumbing businesses across Southwest Michigan cities.
//
// NOTE: Google Maps does not expose owner names. The Owner First/Last Name
// columns in your sheet will be left blank — fill them in manually when you
// call a business and learn who you spoke with.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const config = require('./config');

const APIFY_BASE  = 'https://api.apify.com/v2';
const ACTOR_ID    = 'compass~crawler-google-places';
const POLL_MS     = 6000;   // check run status every 6 seconds
const TIMEOUT_MS  = 360000; // give up after 6 minutes

/**
 * Run one Apify Google Maps scrape across all configured cities in a single
 * actor run (more efficient than one run per city), then normalize and return
 * up to maxLeadsPerRun leads.
 *
 * @returns {Promise<Array>} Normalized lead objects
 */
async function searchLeads() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN is not set. Add it to your .env file.');

  // Build one search string per city — all run in a single Apify job
  const searchStrings = config.cities.map(
    (city) => `${config.primarySearchTerm} ${city}`
  );

  console.log(`  [Apify] Starting scrape across ${searchStrings.length} cities...`);
  console.log(`  [Apify] Queries: ${searchStrings.join(' | ')}`);

  // ── Start the actor run ────────────────────────────────────────────────────
  const runResponse = await axios.post(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs`,
    {
      searchStringsArray       : searchStrings,
      maxCrawledPlacesPerSearch: config.maxPlacesPerCity, // keeps one city from hogging all slots
      language                 : 'en',
      countryCode              : 'us',
      includeWebResults        : false,
    },
    {
      params : { token },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  const runId     = runResponse.data.data.id;
  const datasetId = runResponse.data.data.defaultDatasetId;
  console.log(`  [Apify] Run started (ID: ${runId}). Polling for completion...`);

  // ── Poll until SUCCEEDED (or fail fast) ───────────────────────────────────
  const rawPlaces = await pollUntilDone(runId, datasetId, token);
  console.log(`  [Apify] Scrape complete — ${rawPlaces.length} raw places returned`);

  // ── Normalize, filter, and deduplicate within this batch ──────────────────
  const leads      = [];
  const seenThisRun = new Set();

  for (const place of rawPlaces) {
    if (leads.length >= config.maxLeadsPerRun) break;

    const lead = normalizeLead(place);
    if (!lead) continue;

    const key = lead.businessName.toLowerCase();
    if (seenThisRun.has(key)) continue;

    seenThisRun.add(key);
    leads.push(lead);
  }

  return leads;
}

/**
 * Poll the Apify run status until it succeeds, fails, or times out.
 * Returns the dataset items once the run succeeds.
 *
 * @param {string} runId
 * @param {string} datasetId
 * @param {string} token
 * @returns {Promise<Array>} Raw Apify place objects
 */
async function pollUntilDone(runId, datasetId, token) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const statusRes = await axios.get(
      `${APIFY_BASE}/actor-runs/${runId}`,
      { params: { token }, timeout: 10000 }
    );

    const status = statusRes.data.data.status;
    process.stdout.write(`\r  [Apify] Run status: ${status}...          `);

    if (status === 'SUCCEEDED') {
      console.log(''); // newline after the status line
      const itemsRes = await axios.get(
        `${APIFY_BASE}/datasets/${datasetId}/items`,
        { params: { token, format: 'json', limit: 200 }, timeout: 20000 }
      );
      return Array.isArray(itemsRes.data) ? itemsRes.data : [];
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      console.log('');
      throw new Error(`Apify run ended with status: ${status}. Check your Apify dashboard for details.`);
    }
    // RUNNING or READY — keep polling
  }

  throw new Error(`Apify run timed out after ${TIMEOUT_MS / 60000} minutes. The scrape may still be running in your Apify dashboard.`);
}

/**
 * Convert a raw Apify Google Maps place object into a clean lead record.
 * Returns null if the place doesn't meet quality filters.
 *
 * @param {Object} place - Raw Apify place object
 * @returns {Object|null}
 */
function normalizeLead(place) {
  const businessName = (place.title || '').trim();
  if (!businessName) return null;

  // ── Phone ──────────────────────────────────────────────────────────────────
  const rawPhone = place.phone || place.phoneUnformatted || '';
  const digits   = rawPhone.replace(/\D/g, '');
  // Must have at least a 10-digit US number
  if (digits.length < 10) return null;
  // Store in a consistent format: (269) 555-1234
  const phone = place.phone || formatPhone(digits);

  // ── Size filter — skip obvious chains ─────────────────────────────────────
  // Businesses with 300+ reviews are almost certainly chains or large franchises.
  // Owner-operated shops in small Michigan cities rarely exceed this.
  const reviewCount = place.reviewsCount || 0;
  if (reviewCount > 300) return null;

  // ── Relevance filter — confirm it's actually HVAC/plumbing ────────────────
  const categories = (place.categories || []).join(' ').toLowerCase();
  const nameLC     = businessName.toLowerCase();
  const isRelevant =
    categories.includes('hvac')             ||
    categories.includes('heating')          ||
    categories.includes('air condition')    ||
    categories.includes('furnace')          ||
    categories.includes('plumb')            ||
    categories.includes('mechanical')       ||
    nameLC.includes('hvac')                 ||
    nameLC.includes('heat')                 ||
    nameLC.includes('air')                  ||
    nameLC.includes('plumb')                ||
    nameLC.includes('mechanical')           ||
    nameLC.includes('cooling')              ||
    nameLC.includes('furnace');

  if (!isRelevant) return null;

  // ── City — extract from address if not provided directly ──────────────────
  const city = (place.city || extractCity(place.address || '')).trim();

  return {
    businessName,
    firstName: '', // Google Maps doesn't provide owner names — fill in manually
    lastName : '',
    phone,
    city,
    website  : (place.website || '').trim(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format a 10-digit digit string into (NXX) NXX-XXXX.
 *
 * @param {string} digits
 * @returns {string}
 */
function formatPhone(digits) {
  const d = digits.slice(-10); // take last 10 if there's a leading 1
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Extract a city name from a US address string.
 * e.g. "123 Main St, Kalamazoo, MI 49001" → "Kalamazoo"
 *
 * @param {string} address
 * @returns {string}
 */
function extractCity(address) {
  const parts = address.split(',');
  // Second-to-last part is typically "City" in US addresses
  if (parts.length >= 3) return parts[parts.length - 2].trim();
  if (parts.length === 2) return parts[0].trim();
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Quick connectivity check — verifies the API token and actor exist.
 * Used by setup-check.js.
 *
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function testConnection() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return { ok: false, message: 'APIFY_API_TOKEN is not set' };

  try {
    const res  = await axios.get(`${APIFY_BASE}/acts/${ACTOR_ID}`, {
      params : { token },
      timeout: 8000,
    });
    const name = res.data.data?.name ?? ACTOR_ID;
    return { ok: true, message: `Connected to Apify actor: "${name}"` };
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.error?.message || err.message;
    if (status === 401) return { ok: false, message: 'Invalid Apify API token [401]' };
    return { ok: false, message: `[${status ?? 'network'}] ${msg}` };
  }
}

module.exports = { searchLeads, testConnection };
