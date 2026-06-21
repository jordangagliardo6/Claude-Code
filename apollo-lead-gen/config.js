// ---------------------------------------------------------------------------
// Single source of truth for "what to search for" and "where it goes".
// Edit this file to change cities, industries, titles, or sheet columns.
// Nothing else in the codebase should need to change for those tweaks.
// ---------------------------------------------------------------------------
require('dotenv').config();

module.exports = {
  // Apollo's organization_locations filter accepts "City, ST" style strings.
  // Add/remove cities here to change targeting. Keep ", MI" on each one.
  cities: [
    'St. Joseph, MI',
    'Benton Harbor, MI',
    'Kalamazoo, MI',
    'Holland, MI',
    'Grand Haven, MI',
    'Muskegon, MI',
    'South Haven, MI',
  ],

  // Broad state-level fallback used as organization_locations bias alongside
  // the city list above (Apollo treats this as an OR with the cities).
  state: 'Michigan, United States',

  // Matched against each company's industry/keyword tags in Apollo.
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Apollo employee-count bucket format: "min,max".
  employeeRange: '1,25',

  // Searched in this exact order. The workflow queries title-by-title so
  // that an "Owner" at a company is always found before a "General Manager"
  // at the same company would be considered.
  titlesByPriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Hard cap on how many *new* (non-duplicate, phone-having) leads get
  // appended in a single run.
  maxNewLeadsPerRun: 25,

  // How many Apollo search results to pull per API call. Kept small since we
  // stop as soon as maxNewLeadsPerRun is satisfied.
  resultsPerPage: 10,

  sheet: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    tabName: process.env.GOOGLE_SHEET_TAB_NAME || 'Leads',
    // Order here = column order in the sheet (A, B, C, ...).
    // "Called" and "Notes" are always left blank on insert for manual use.
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
  },

  schedule: {
    // 7:00 AM every day, interpreted in the timezone below (handles EST/EDT
    // automatically — no manual DST adjustment needed).
    cronExpression: '0 7 * * *',
    timezone: 'America/New_York',
  },

  alerting: {
    to: process.env.ALERT_EMAIL_TO,
    smtpHost: process.env.ALERT_EMAIL_SMTP_HOST,
    smtpPort: Number(process.env.ALERT_EMAIL_SMTP_PORT) || 465,
    smtpUser: process.env.ALERT_EMAIL_SMTP_USER,
    smtpPass: process.env.ALERT_EMAIL_SMTP_PASS,
  },
};
