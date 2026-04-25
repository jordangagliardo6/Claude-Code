require('dotenv').config();

module.exports = {
  // === TARGET CITIES ===
  // Add or remove cities here to change the search area
  cities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // === INDUSTRY FILTERS ===
  // These map to Apollo's keyword tag filters
  industries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating Ventilation Air Conditioning',
  ],

  // === JOB TITLE PRIORITY ===
  // Apollo searches all of these; we rank results by this order
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // === COMPANY SIZE ===
  // Apollo format: "min,max" — targets solo operators through small crews
  employeeRange: ['1,25'],

  // === BASE LOCATION ===
  location: 'Michigan, United States',

  // === SCHEDULER ===
  // Cron expression for 7:00 AM Eastern every day
  // Format: "minute hour day month weekday"
  scheduleTime: '0 7 * * *',
  timezone: process.env.TIMEZONE || 'America/New_York',

  // === RUN LIMITS ===
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25,

  // === SPREADSHEET COLUMNS ===
  // Change order or names here — code references by index, not by name
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

  // === COLUMN INDEXES (0-based) ===
  // Update these if you reorder columns above
  colIndex: {
    dateAdded:  0,
    bizName:    1,
    firstName:  2,
    lastName:   3,
    phone:      4,
    city:       5,
    website:    6,
    called:     7,
    notes:      8,
  },

  // === API CREDENTIALS ===
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
  },

  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
    credentialsFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './credentials.json',
  },

  alertEmail: process.env.ALERT_EMAIL,
};
