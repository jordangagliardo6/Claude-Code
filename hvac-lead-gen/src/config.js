require('dotenv').config();

const config = {
  apollo: {
    baseUrl: 'https://api.apollo.io/api/v1',
    apiKey: process.env.APOLLO_API_KEY,
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN) || 25,

    // Target cities — add or remove cities here as needed
    targetCities: [
      'St. Joseph',
      'Benton Harbor',
      'Kalamazoo',
      'Holland',
      'Grand Haven',
      'Muskegon',
      'South Haven',
    ],

    // State for location filter
    targetState: 'Michigan',
    targetCountry: 'United States',

    // Industries to search — Apollo uses keyword tags
    // Edit this list to change target industries
    industryKeywords: [
      'hvac',
      'heating and air conditioning',
      'plumbing',
      'mechanical contracting',
    ],

    // Job titles in priority order — Owner is highest value
    // Apollo will return contacts matching any of these
    jobTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Company employee range (owner-operated small businesses)
    minEmployees: 1,
    maxEmployees: 25,
  },

  sheets: {
    // Google Sheet ID from the spreadsheet URL
    // Set GOOGLE_SHEET_ID in .env or leave blank to auto-create a new sheet
    sheetId: process.env.GOOGLE_SHEET_ID || null,

    // Tab name inside the spreadsheet
    tabName: 'HVAC Leads',

    // Column order — edit to add/remove columns (keep Date Added and Business Name first)
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

    // Column index (0-based) used for duplicate detection
    businessNameColumnIndex: 1,
  },

  google: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json',
    // Scopes needed for reading and writing Sheets, and creating files in Drive
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  },

  notifications: {
    email: process.env.NOTIFICATION_EMAIL || null,
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER || null,
      pass: process.env.SMTP_PASS || null,
    },
  },
};

module.exports = config;
