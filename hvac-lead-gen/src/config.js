require('dotenv').config();

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
    // Max leads fetched per scheduled run — keep it manageable
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },

  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    // Name of the tab inside the spreadsheet
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Leads',
    // Path to service account JSON key downloaded from Google Cloud Console
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
  },

  schedule: {
    // node-cron format: minute hour day month weekday
    // "0 7 * * *" = 7:00 AM every day
    cronExpression: process.env.CRON_EXPRESSION || '0 7 * * *',
    timezone: 'America/New_York',
  },

  notification: {
    // Set EMAIL_NOTIFICATIONS=true in .env to enable email alerts on errors
    enabled: process.env.EMAIL_NOTIFICATIONS === 'true',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    alertEmail: process.env.ALERT_EMAIL,
  },

  // ── Easy-to-edit target list ────────────────────────────────────────────────
  // Add or remove cities here; use "City, Michigan" format.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Apollo keyword tags used to filter by industry
  targetIndustries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles in priority order — Owner is highest, GM is lowest
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Spreadsheet column headers — order must match the row-building logic in sheets.js
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
