// Central config — edit cities, job titles, industries, or column layout here
// without touching any other file.

const config = {
  apollo: {
    baseUrl: 'https://api.apollo.io/api/v1',

    // Target cities in Southwest Michigan — extend this array freely
    targetCities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],

    // Job titles searched in priority order (Apollo ranks by first match)
    jobTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Industries to target
    industries: [
      'HVAC',
      'Heating and Air Conditioning',
      'Plumbing',
      'Mechanical Contracting',
    ],

    // Employee range: 1–25 (owner-operated small businesses)
    // Apollo format: "min,max"
    employeeRanges: ['1,25'],

    // Broad state fallback so Apollo doesn't reject location-only city queries
    stateLocation: 'Michigan, United States',

    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },

  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Leads',
    credentialsPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './google-credentials.json',

    // Column headers — order here matches the order written to the sheet.
    // If you add a column, add it here AND update the rowBuilder in sheets.js.
    headers: [
      'Date Added',
      'Business Name',
      'Owner First Name',
      'Owner Last Name',
      'Phone Number',
      'City',
      'Website',
      'Called',   // left blank intentionally
      'Notes',    // left blank intentionally
    ],

    // Which column (0-indexed) is used for duplicate detection
    dedupeColumnIndex: 1, // "Business Name"
  },

  scheduler: {
    // 7:00 AM Eastern Time every day
    cronExpression: '0 7 * * *',
    timezone: 'America/New_York',
  },
};

module.exports = config;
