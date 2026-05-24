require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Southwest Michigan target cities with their approximate zip codes
const TARGET_LOCATIONS = [
  { city: 'St. Joseph',   state: 'Michigan', zips: ['49085', '49022'] },
  { city: 'Benton Harbor', state: 'Michigan', zips: ['49022', '49023'] },
  { city: 'Kalamazoo',    state: 'Michigan', zips: ['49001', '49002', '49003', '49004', '49006', '49007', '49008', '49009', '49048'] },
  { city: 'Holland',      state: 'Michigan', zips: ['49422', '49423', '49424'] },
  { city: 'Grand Haven',  state: 'Michigan', zips: ['49417'] },
  { city: 'Muskegon',     state: 'Michigan', zips: ['49440', '49441', '49442', '49443', '49444', '49445', '49451'] },
  { city: 'South Haven',  state: 'Michigan', zips: ['49090'] },
];

// Apollo industry keywords to target
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Plumbing and Heating',
];

// Job titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Google Sheets column order (must match the sheet header row exactly)
const SHEET_COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },
  google: {
    keyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/google-service-account.json',
    keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null,
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Leads',
  },
  email: {
    from: process.env.ALERT_EMAIL_FROM || '',
    to: process.env.ALERT_EMAIL_TO || '',
    gmailPassword: process.env.GMAIL_APP_PASSWORD || '',
  },
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 11 * * *',
  },
  TARGET_LOCATIONS,
  TARGET_INDUSTRIES,
  TARGET_TITLES,
  SHEET_COLUMNS,
};
