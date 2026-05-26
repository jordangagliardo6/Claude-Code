require('dotenv').config();

module.exports = {
  // ── Apollo ──────────────────────────────────────────────────────────────
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io',

    // How many leads to pull per scheduled run
    leadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

    // If true, a second API call is made for each prospect to reveal their
    // phone number. Costs 1 Apollo export credit per person. Set false if
    // your plan already returns phones in search results.
    enrichForPhones: process.env.ENRICH_FOR_PHONES === 'true',
  },

  // ── Target geography ─────────────────────────────────────────────────
  // Add or remove cities here at any time.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // ── Industry filters ──────────────────────────────────────────────────
  // Apollo keyword tags used to narrow results to HVAC / mechanical trades.
  industryKeywords: [
    'hvac',
    'heating and cooling',
    'air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating and air conditioning',
  ],

  // ── Decision-maker titles ─────────────────────────────────────────────
  // Apollo matches these against current job title. Priority order matters
  // because results are re-sorted by title rank before writing to the sheet.
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Company size ──────────────────────────────────────────────────────
  // "1,25" means 1–25 employees.  Add more ranges if you want larger cos.
  employeeRanges: ['1,25'],

  // ── Google Sheets ─────────────────────────────────────────────────────
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID || '1rJsYIBDjJT-df54VoWAsCC2Fq_UN6zc3XFVqqX8sun8',
    sheetName: 'Sheet1',
    credentialsPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json',

    // Column letters in the spreadsheet — change these if you restructure columns.
    columns: { A: 'Date Added', B: 'Business Name', C: 'Owner First Name', D: 'Owner Last Name', E: 'Phone Number', F: 'City', G: 'Website', H: 'Called', I: 'Notes' },
  },

  // ── Scheduler ─────────────────────────────────────────────────────────
  // Default: 7:00 AM Eastern Standard Time (UTC-5 → 12:00 UTC).
  // Change to "0 11 * * *" during daylight saving time (UTC-4 → 11:00 UTC).
  cronSchedule: process.env.CRON_SCHEDULE || '0 12 * * *',

  // ── Alert emails ──────────────────────────────────────────────────────
  alerts: {
    toEmail: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
    fromEmail: process.env.SMTP_USER || process.env.ALERT_EMAIL,
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
};
