require('dotenv').config();

module.exports = {
  // ── Apollo.io ────────────────────────────────────────────────────────────
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/api/v1',

    // Maximum leads to add per scheduled run — keeps the list manageable
    maxLeadsPerRun: 25,

    // Decision-maker titles in priority order.
    // To add or reorder titles, edit this array.
    targetTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Industries to target.
    // These map to Apollo organization keyword tags.
    industryTags: [
      'hvac',
      'heating and air conditioning',
      'plumbing',
      'mechanical contracting',
    ],

    // Owner-operated small businesses only (1–25 employees)
    employeeRanges: ['1,25'],

    // Southwest Michigan target cities.
    // To add a city, append to this array in "City, Michigan" format.
    targetCities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],

    // Broader state-level filter used in the Apollo API call.
    // We then city-filter client-side for precision.
    stateLocation: 'Michigan, United States',

    // How many results to request from Apollo per page before city-filtering.
    // Higher = better city coverage but slower. Max allowed by Apollo is 100.
    apolloPageSize: 100,
  },

  // ── Google Sheets ────────────────────────────────────────────────────────
  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE',
    sheetName: 'Sheet1',
  },

  // ── Email alerts ─────────────────────────────────────────────────────────
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    alertTo: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
    from: process.env.EMAIL_FROM,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  },

  // ── Scheduler ────────────────────────────────────────────────────────────
  // node-cron syntax: "minute hour dayOfMonth month dayOfWeek"
  // Default: 7:00 AM every day
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
  cronTimezone: 'America/New_York', // Covers both EST and EDT automatically
};
