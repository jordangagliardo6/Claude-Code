// ─── All configurable values live here — edit freely ───────────────────────

module.exports = {
  // Target spreadsheet ID (from the URL of your Google Sheet)
  SPREADSHEET_ID: '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',
  SHEET_NAME: 'Untitled', // tab name inside the spreadsheet

  // Max leads to add per run (keep this low so the list stays manageable)
  MAX_LEADS_PER_RUN: 25,

  // Cron schedule: "0 7 * * *" = every day at 7:00am
  // Change the timezone below to match yours if needed
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // Cities / regions to target in Apollo search
  SW_MICHIGAN_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Keywords used to build the Apollo.io search query
  INDUSTRY_KEYWORDS: 'HVAC heating cooling air conditioning plumbing mechanical',

  // Apollo People Search: job titles to target, in priority order
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Apollo org employee range: "1,25" = 1–25 employees
  EMPLOYEE_RANGE: '1,25',

  // Column order in the spreadsheet (do not reorder without also updating sheets.js)
  COLUMNS: [
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
