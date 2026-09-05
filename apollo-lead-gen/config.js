/**
 * config.js
 * Central config for the Apollo HVAC lead gen workflow.
 * Edit this file to change cities, industries, job titles, or sheet settings.
 */

module.exports = {
  // ─── SEARCH TARGETS ──────────────────────────────────────────────────────────

  // Cities to target in Southwest Michigan.
  // Each city is searched as an organization_location filter bias.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industry keyword tags — Apollo uses these to classify companies.
  // Change or add any industry terms that describe your ideal customers.
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // SIC codes for HVAC / Plumbing / Mechanical contractors.
  // 1711 = Plumbing, Heating & Air-Conditioning
  // 5075 = Warm Air Heating & AC Equipment (wholesale)
  sicCodes: ['1711', '5075'],

  // NAICS codes (prefix match, so '23822' covers all sub-codes).
  // 238220 = Plumbing, Heating & AC Contractors
  naicsCodes: ['23822'],

  // Job titles in priority order.
  // Apollo will use these as OR filters — any match qualifies.
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company size ranges — owner-operated small businesses only.
  // Format: 'min,max' strings as required by Apollo API.
  employeeRanges: ['1,10', '11,25'],

  // ─── RUN LIMITS ──────────────────────────────────────────────────────────────

  // Maximum new leads to add per scheduled run.
  maxLeadsPerRun: 25,

  // Apollo page size per API request (max 100). We paginate internally.
  apolloPageSize: 50,

  // ─── GOOGLE SHEETS ───────────────────────────────────────────────────────────

  // Google Sheets file ID from the URL:
  // https://docs.google.com/spreadsheets/d/<THIS_ID>/edit
  spreadsheetId: '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',

  // The tab name inside the spreadsheet. Change if yours is named differently.
  sheetName: 'Sheet1',

  // Column order in the sheet (must match exactly, including blanks for Called/Notes).
  // If you add or remove columns, update this array AND the buildRow() function in googleSheets.js.
  columnHeaders: [
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

  // ─── SCHEDULER ───────────────────────────────────────────────────────────────

  // Cron expression: 7:00 AM every day.
  // node-cron uses America/New_York timezone (set below), so this fires at 7am ET
  // regardless of DST. Format: second(opt) minute hour day month weekday
  cronSchedule: '0 7 * * *',

  // Timezone for the cron job. Keeps it pinned to 7am Eastern even during DST transitions.
  cronTimezone: 'America/New_York',

  // ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

  // Email to notify on error (used in log messages — wire up nodemailer if you want real email).
  notificationEmail: 'jgagliardo98@gmail.com',
};
