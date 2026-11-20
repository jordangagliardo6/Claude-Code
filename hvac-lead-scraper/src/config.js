require('dotenv').config();

// Southwest Michigan target cities
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  // Surrounding area coverage
  'St Joseph',
  'Stevensville',
  'Bridgman',
  'Niles',
  'Portage',
  'Battle Creek',
  'Zeeland',
  'Hudsonville',
  'Grandville',
  'Wyoming',
  'Norton Shores',
  'Muskegon Heights',
  'Spring Lake',
  'Fennville',
  'Saugatuck',
  'Douglas',
];

// Apollo.io job title priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industries to target
const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating, ventilation & air conditioning',
  'hvac services',
];

// Google Sheet column order (1-indexed, A=1)
const SHEET_COLUMNS = {
  DATE_ADDED: 0,
  BUSINESS_NAME: 1,
  OWNER_FIRST: 2,
  OWNER_LAST: 3,
  PHONE: 4,
  CITY: 5,
  WEBSITE: 6,
  CALLED: 7,
  NOTES: 8,
};

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

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH,
    sheetName: 'Leads',
  },
  notify: {
    to: process.env.ALERT_EMAIL_TO,
    from: process.env.ALERT_EMAIL_FROM,
    password: process.env.ALERT_EMAIL_PASSWORD,
  },
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  swMichiganCities: SW_MICHIGAN_CITIES,
  targetTitles: TARGET_TITLES,
  targetIndustries: TARGET_INDUSTRIES,
  sheetColumns: SHEET_COLUMNS,
  sheetHeaders: SHEET_HEADERS,
};
