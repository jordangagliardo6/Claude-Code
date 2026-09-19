// ─────────────────────────────────────────────────────────────────────────────
// config.js — Easily modify cities, job titles, industries, and run settings
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // ── Target locations (modify to add/remove cities) ──────────────────────────
  // Apollo matches these against where the PERSON is located, not company HQ.
  // Add nearby cities/zip-level phrases if you want wider coverage.
  TARGET_LOCATIONS: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    'Stevensville, Michigan',
    'Coloma, Michigan',
    'Paw Paw, Michigan',
    'Watervliet, Michigan',
    'Three Rivers, Michigan',
    'Mattawan, Michigan',
    'Lawton, Michigan',
  ],

  // Fallback: company HQ must be in Michigan (catches people not exactly matched)
  ORGANIZATION_STATE: 'Michigan, United States',

  // ── Industries / keyword tags ────────────────────────────────────────────────
  // Apollo matches these against company keyword tags. Add synonyms if needed.
  INDUSTRY_KEYWORDS: [
    'hvac',
    'heating and air conditioning',
    'heating & cooling',
    'plumbing',
    'mechanical contracting',
    'refrigeration',
    'air conditioning',
    'furnace',
  ],

  // ── Job titles to target (in priority order) ────────────────────────────────
  // Apollo's include_similar_titles:false enforces strict matching.
  // Set to true if you want to catch "Co-Owner", "Managing Partner", etc.
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],
  INCLUDE_SIMILAR_TITLES: true,

  // ── Company size: 1–25 employees ────────────────────────────────────────────
  EMPLOYEE_RANGES: ['1,10', '11,25'],

  // ── Run settings ────────────────────────────────────────────────────────────
  MAX_LEADS_PER_RUN: 25,

  // Cron schedule: "0 7 * * *" = every day at 7:00 AM
  // node-cron uses local server time, so ensure the server is in Eastern Time
  // OR deploy to a server set to America/New_York.
  CRON_SCHEDULE: '0 7 * * *',

  // ── Google Sheets column order (do NOT reorder without updating sheetsService) ──
  COLUMNS: [
    'Date Added',        // A
    'Business Name',     // B  ← duplicate-check column
    'Owner First Name',  // C
    'Owner Last Name',   // D
    'Phone Number',      // E
    'City',              // F
    'Website',           // G
    'Called',            // H  (left blank for you to fill)
    'Notes',             // I  (left blank for you to fill)
  ],
};
