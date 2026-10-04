require('dotenv').config();

const config = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/api/v1',
    // SW Michigan cities — edit this list to add/remove cities
    cities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],
    // Additional broader region fallback
    regionKeywords: ['Southwest Michigan', 'Berrien County Michigan', 'Kalamazoo County Michigan'],
    // Job titles in priority order — Apollo searches these as OR
    targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
    // Industry keywords for org tags
    industryTags: [
      'HVAC',
      'heating and air conditioning',
      'plumbing',
      'mechanical contracting',
      'heating cooling',
    ],
    // Company size: 1–25 employees (owner-operated)
    employeeRanges: ['1,10', '11,25'],
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Untitled',
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './credentials/google-service-account.json',
    // Column order must match the spreadsheet headers exactly
    columns: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes'],
  },
  notification: {
    email: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
    gmailUser: process.env.GMAIL_USER,
    gmailPassword: process.env.GMAIL_APP_PASSWORD,
  },
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 7 * * *',
    timezone: 'America/New_York',
  },
};

function validate() {
  const missing = [];
  if (!config.apollo.apiKey) missing.push('APOLLO_API_KEY');
  if (!config.sheets.spreadsheetId) missing.push('GOOGLE_SPREADSHEET_ID');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nCopy .env.example to .env and fill in the values.`);
  }
}

module.exports = { config, validate };
