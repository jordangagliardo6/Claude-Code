require('dotenv').config();

const config = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/api/v1',
    maxLeadsPerRun: 25,

    // Priority order matches the job title priority the user requested.
    // Apollo returns results ranked by how well they match, so listing
    // Owner first gives it the highest weight in the query.
    targetTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Keyword tags used to filter companies in Apollo's database.
    targetIndustryKeywords: [
      'hvac',
      'heating and air conditioning',
      'plumbing',
      'mechanical contracting',
    ],

    // SIC code 1711 = Plumbing, Heating, Air-Conditioning Contractors —
    // combined with keyword tags this gives tighter industry targeting.
    targetSicCodes: ['1711'],

    // Southwest Michigan cities the user specified, formatted for Apollo's
    // organization_locations filter.
    targetCities: [
      'St. Joseph, Michigan, United States',
      'Benton Harbor, Michigan, United States',
      'Kalamazoo, Michigan, United States',
      'Holland, Michigan, United States',
      'Grand Haven, Michigan, United States',
      'Muskegon, Michigan, United States',
      'South Haven, Michigan, United States',
    ],

    // 1–25 employees split into two Apollo-accepted ranges.
    employeeRanges: ['1,10', '11,25'],
  },

  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json',
    sheetName: process.env.SHEET_NAME || 'Sheet1',

    // Column order that must match the spreadsheet exactly.
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
  },

  notification: {
    email: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  },

  schedule: {
    // 7:00 AM Eastern every day.
    cron: '0 7 * * *',
    timezone: 'America/New_York',
  },
};

module.exports = config;
