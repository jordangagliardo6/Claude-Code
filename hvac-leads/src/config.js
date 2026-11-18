require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// --- Edit these to change search targets ---

const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Apollo keyword tags map to their industry categories
const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Titles checked in priority order; Apollo returns the best match
const TARGET_JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Employee range: 1–25 (owner-operated small businesses)
const EMPLOYEE_RANGE = '1,25';

// --- Sheet column layout (order matters) ---
const SHEET_HEADERS = [
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

// Column index (0-based) used for duplicate detection
const BUSINESS_NAME_COL_INDEX = 1;

// --- Runtime config ---
const config = {
  apolloApiKey: process.env.APOLLO_API_KEY,
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/service-account.json',
  sheetTab: process.env.GOOGLE_SHEET_TAB || 'Sheet1',
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',

  targetCities: TARGET_CITIES,
  targetIndustries: TARGET_INDUSTRIES,
  targetJobTitles: TARGET_JOB_TITLES,
  employeeRange: EMPLOYEE_RANGE,
  sheetHeaders: SHEET_HEADERS,
  businessNameColIndex: BUSINESS_NAME_COL_INDEX,
};

function validateConfig() {
  const missing = [];
  if (!config.apolloApiKey) missing.push('APOLLO_API_KEY');
  if (!config.spreadsheetId) missing.push('GOOGLE_SPREADSHEET_ID');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { config, validateConfig };
