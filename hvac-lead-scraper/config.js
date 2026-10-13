/**
 * config.js — All search parameters in one place.
 * Edit this file to change cities, industries, job titles, or run limits.
 */

module.exports = {
  // ─── Target Geography ─────────────────────────────────────────────────────
  // Add or remove cities here. Apollo matches against the person's location.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    // Surrounding areas
    'Stevensville, Michigan',
    'Portage, Michigan',
    'Coloma, Michigan',
    'Watervliet, Michigan',
    'Paw Paw, Michigan',
    'Mattawan, Michigan',
    'Zeeland, Michigan',
    'Three Rivers, Michigan',
    'Plainwell, Michigan',
  ],

  // Filter companies headquartered in Michigan
  organizationLocations: ['Michigan, United States'],

  // ─── Industry Keywords ────────────────────────────────────────────────────
  // Apollo matches these against company keyword tags
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Heating & Cooling',
    'Plumbing',
    'Mechanical Contracting',
    'Air Conditioning',
  ],

  // ─── SIC Codes for HVAC / Plumbing / Mechanical ───────────────────────────
  // 1711 = Plumbing, Heating, Air-Conditioning
  // 5075 = Warm Air Heating / AC Equipment
  sicCodes: ['1711', '5075'],

  // ─── Decision-Maker Titles (in priority order) ────────────────────────────
  // Apollo will also surface similar titles unless include_similar_titles=false
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ─── Company Size ─────────────────────────────────────────────────────────
  // "1,25" captures 1–25 employees (owner-operated small businesses)
  employeeRanges: ['1,10', '11,25'],

  // ─── Run Limits ───────────────────────────────────────────────────────────
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // Results to fetch from Apollo per search request (max 100)
  apolloPageSize: 100,

  // ─── Spreadsheet Columns ──────────────────────────────────────────────────
  // Matches the exact column order in the master sheet.
  // Change column letters here if you restructure the sheet.
  sheetRange: 'A:I',
  columns: {
    dateAdded:      'A',
    businessName:   'B',
    ownerFirstName: 'C',
    ownerLastName:  'D',
    phoneNumber:    'E',
    city:           'F',
    website:        'G',
    called:         'H',  // left blank on insert
    notes:          'I',  // left blank on insert
  },
};
