require('dotenv').config();

module.exports = {
  // ── Target geography ──────────────────────────────────────────────────────
  // Edit this list freely to add or remove cities.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Southwest Michigan zip codes — used as a tighter location signal in Apollo.
  // Add or remove zips here without touching any other file.
  swMichiganZips: [
    '49085', '49022',                         // St. Joseph / Benton Harbor area
    '49001', '49006', '49007', '49008',       // Kalamazoo
    '49423', '49424',                         // Holland
    '49417', '49460',                         // Grand Haven
    '49440', '49441', '49442', '49444', '49445', // Muskegon
    '49090', '49099',                         // South Haven
    '49103', '49104', '49106', '49107',       // Surrounding Berrien County
  ],

  // ── Apollo search filters ─────────────────────────────────────────────────
  // Job titles — Apollo matches in priority order, top of list = highest priority.
  personTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Industry keyword tags sent to Apollo.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // NAICS codes: 238220 = Plumbing, Heating & Air-Conditioning Contractors.
  naicsCodes: ['23822'],

  // Company size: 1–25 employees (owner-operated small businesses).
  employeeRange: '1,25',

  // ── Run behaviour ─────────────────────────────────────────────────────────
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // ── Scheduler ─────────────────────────────────────────────────────────────
  // Cron expression for node-cron. Timezone is hardcoded to America/New_York
  // in index.js, so "0 7 * * *" reliably fires at 7:00 AM Eastern.
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',

  // ── Google Sheets ─────────────────────────────────────────────────────────
  googleSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  googleSheetName:     process.env.GOOGLE_SHEET_NAME     || 'Untitled',
  googleKeyFile:       process.env.GOOGLE_KEY_FILE       || './credentials/google-service-account.json',

  // Column order inside the spreadsheet — must match the header row exactly.
  // Change this array if you ever restructure the sheet, then update appendLeads() too.
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

  // ── Apollo API ────────────────────────────────────────────────────────────
  apolloApiKey: process.env.APOLLO_API_KEY || '',
  apolloBaseUrl: 'https://api.apollo.io/api/v1',

  // ── Notifications ─────────────────────────────────────────────────────────
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',
};
