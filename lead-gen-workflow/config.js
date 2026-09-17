/**
 * Central config — edit city list, job titles, or column order here.
 * No code changes needed elsewhere for common adjustments.
 */
module.exports = {
  // Target cities. Apollo uses free-text; keep format as "City, Michigan".
  TARGET_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Apollo keyword tags to match against company industry
  INDUSTRY_KEYWORDS: ['HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting'],

  // Company size: owner-operated small shops only
  EMPLOYEE_RANGE: '1,25',

  // Decision-maker titles in priority order
  TARGET_TITLES: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Max new leads added per run so the call list stays manageable
  MAX_LEADS_PER_RUN: 25,

  // Google Sheets spreadsheet ID — get it from the URL after /d/ in the sheet URL
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID || '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',

  // Sheet tab name (the tab at the bottom of the spreadsheet)
  SHEET_TAB_NAME: process.env.SHEET_TAB_NAME || 'Sheet1',

  // Column order matches the spreadsheet exactly
  COLUMNS: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes'],

  // Cron schedule: 7am Eastern every morning
  // node-cron supports timezone natively in v3+
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // Notification email (set via env or hard-code your address here)
  ALERT_EMAIL: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
};
