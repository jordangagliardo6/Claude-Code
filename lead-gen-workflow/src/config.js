/**
 * config.js
 * All tuneable parameters live here. Edit this file to change target cities,
 * job titles, industries, employee limits, or column layout without touching
 * the core workflow logic.
 */

module.exports = {
  // ── Apollo search filters ────────────────────────────────────────────────

  // Cities to target. Apollo matches these against company HQ addresses.
  // Add or remove entries freely; the workflow loops over all of them.
  targetLocations: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
    // Broader fallback so Apollo has more to work with
    'Southwest Michigan, United States',
    'Berrien County, Michigan, United States',
    'Van Buren County, Michigan, United States',
    'Ottawa County, Michigan, United States',
    'Allegan County, Michigan, United States',
    'Kalamazoo County, Michigan, United States',
    'Muskegon County, Michigan, United States',
  ],

  // Decision-maker titles in priority order (Owner first, GM last).
  // Apollo's title matching is fuzzy, so "Owner" also catches "Co-Owner" etc.
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Company size: owner-operated small businesses only (1–25 employees).
  employeeRanges: ['1,25'],

  // Industry keyword tags sent to Apollo.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'air conditioning',
    'heating',
    'plumbing',
    'mechanical contracting',
    'mechanical contractor',
    'HVAC contractor',
    'furnace repair',
    'air conditioning repair',
  ],

  // SIC codes that map to the target trades.
  // 1711 = Plumbing, Heating, Air-Conditioning contractors
  // 5075 = Warm Air Heating & Air-Conditioning equipment/supplies
  sicCodes: ['1711', '5075'],

  // ── Google Sheets layout ─────────────────────────────────────────────────

  // Exact name of the sheet tab inside the spreadsheet.
  sheetTabName: 'Leads',

  // Column headers in the order they appear (A through I).
  // If you add/remove columns here, also update the rowBuilder in workflow.js.
  columnHeaders: [
    'Date Added',       // A
    'Business Name',    // B  ← used for deduplication
    'Owner First Name', // C
    'Owner Last Name',  // D
    'Phone Number',     // E
    'City',             // F
    'Website',          // G
    'Called',           // H  (left blank — you fill in)
    'Notes',            // I  (left blank — you fill in)
  ],

  // Zero-based index of the "Business Name" column used for dedup checks.
  businessNameColumnIndex: 1,

  // ── Run limits ────────────────────────────────────────────────────────────

  // Hard cap on new leads added per scheduled run.
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // Results to fetch per Apollo request page (max 100).
  apolloPageSize: 50,
};
