require('dotenv').config();

const config = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
  },

  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    // Sheet name within the spreadsheet
    sheetName: process.env.SHEET_NAME || 'Leads',
    // OAuth token cache path
    tokenPath: './token.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  },

  alert: {
    emailTo: process.env.ALERT_EMAIL_TO,
    emailFrom: process.env.ALERT_EMAIL_FROM,
    emailPassword: process.env.ALERT_EMAIL_PASSWORD,
  },

  workflow: {
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN) || 25,
    // Cron: 7am Eastern = 12:00 UTC (accounts for ET = UTC-5)
    cronSchedule: process.env.CRON_SCHEDULE || '0 12 * * *',
  },

  // Target cities for Southwest Michigan
  targetCities: [
    'St. Joseph',
    'Saint Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Southwest Michigan zip codes to bias results
  targetZipCodes: [
    '49085', '49022', // St. Joseph / Benton Harbor
    '49001', '49002', '49003', '49004', '49006', '49007', '49008', '49009', // Kalamazoo
    '49423', '49424', // Holland
    '49417',          // Grand Haven
    '49440', '49441', '49442', '49443', '49444', '49445', // Muskegon
    '49090',          // South Haven
  ],

  // Apollo industry keywords
  targetIndustries: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'cooling',
    'air conditioning',
  ],

  // Job title priority order
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Spreadsheet column headers (order matters)
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

function validate() {
  const missing = [];
  if (!config.apollo.apiKey) missing.push('APOLLO_API_KEY');
  if (!config.google.spreadsheetId) missing.push('GOOGLE_SPREADSHEET_ID');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { config, validate };
