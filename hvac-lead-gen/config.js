/**
 * config.js
 * Central place for all search parameters.
 * Edit this file to change cities, industries, job titles, or limits.
 */

module.exports = {

  // ── Target cities in Southwest Michigan ─────────────────────────────────────
  // Format: "City, Michigan"  — add or remove cities freely.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    'Stevensville, Michigan',
    'Paw Paw, Michigan',
    'Three Rivers, Michigan',
    'Watervliet, Michigan',
    'Berrien Springs, Michigan',
    'Niles, Michigan',
  ],

  // ── Industry keywords matched against Apollo company tags ───────────────────
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Air Conditioning',
    'Heating',
    'Cooling',
  ],

  // ── Job titles to target, in priority order ─────────────────────────────────
  // Apollo will search for exact matches (include_similar_titles=false in index.js).
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Company size: 1–25 employees (owner-operated small businesses) ───────────
  employeeRange: '1,25',

  // ── Max leads to add per daily run ──────────────────────────────────────────
  maxLeadsPerRun: 25,

  // ── Google Sheet column order (must match your spreadsheet exactly) ──────────
  columns: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ],
};
