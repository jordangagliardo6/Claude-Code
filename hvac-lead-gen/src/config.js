require('dotenv').config();

// Target cities and surrounding areas in Southwest Michigan
const TARGET_CITIES = [
  'St. Joseph',
  'Saint Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  // Surrounding areas
  'Portage',
  'Comstock',
  'Stevensville',
  'Bridgman',
  'Coloma',
  'Watervliet',
  'Saugatuck',
  'Douglas',
  'Zeeland',
  'Spring Lake',
  'Fruitport',
  'Norton Shores',
];

// Job titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industries to target
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Construction',
];

// Google Sheets column layout — edit here to reorder or add columns
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

// Index of the "Business Name" column (0-based) for duplicate checking
const BUSINESS_NAME_COL_INDEX = 1;

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    tokenPath: './token.json',
    // Sheet name within the spreadsheet — change if your tab is named differently
    sheetName: 'Leads',
    // Google Sheets API scopes needed
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  },
  alerts: {
    email: process.env.ALERT_EMAIL || '',
    gmailUser: process.env.GMAIL_USER || '',
    gmailPassword: process.env.GMAIL_APP_PASSWORD || '',
  },
  scheduler: {
    // Runs every day at 7:00 AM Eastern Time
    cronExpression: '0 7 * * *',
    timezone: process.env.TIMEZONE || 'America/New_York',
    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },
  TARGET_CITIES,
  TARGET_TITLES,
  TARGET_INDUSTRIES,
  SHEET_COLUMNS,
  BUSINESS_NAME_COL_INDEX,
};
