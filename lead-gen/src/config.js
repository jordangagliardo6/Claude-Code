require('dotenv').config();

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
  },

  search: {
    // Edit this list to add or remove target cities
    cities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],

    // Keywords Apollo uses to match company industry tags
    industryKeywords: ['hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical'],

    // Job titles in priority order — Owner is checked first, GM last
    jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // Filters for owner-operated small businesses
    employeeRange: '1,25',

    // Maximum new leads appended per scheduled run
    maxLeadsPerRun: 25,
  },

  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    // Edit SHEET_NAME in .env if your tab has a different name
    sheetName: process.env.SHEET_NAME || 'Leads',

    // Column headers — edit here if you want to change the structure
    headers: [
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

    // Zero-based index of the Business Name column (B = 1)
    businessNameColIndex: 1,
  },

  scheduler: {
    // node-cron expression: 7:00 AM every day
    cronExpression: '0 7 * * *',
    timezone: 'America/New_York',
  },

  notifications: {
    email: process.env.NOTIFICATION_EMAIL,
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  // Path to Google OAuth2 files (relative to project root)
  googleCredentialsPath: './credentials.json',
  googleTokenPath: './token.json',
};
