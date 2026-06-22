// All the knobs you're likely to want to tweak live in this one file.
require('dotenv').config();

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/api/v1',

    // Cities to search. Add/remove freely -- each one becomes a separate
    // Apollo search biased toward that city via `person_locations`.
    cities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],

    // Broad org-location filter so results stay anchored to Michigan even
    // though we also bias per-city above.
    organizationLocations: ['Michigan, US'],

    // Keywords used to match HVAC/plumbing/mechanical contractor companies.
    industryKeywords: [
      'HVAC',
      'Heating and Air Conditioning',
      'Plumbing',
      'Mechanical Contracting',
    ],

    // Owner-operated small shops only.
    employeeRanges: ['1,25'],

    // Job titles to target, in priority order. Results are sorted so the
    // highest-priority title match for a company appears first when we
    // trim down to maxLeadsPerRun.
    titlesByPriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // How many extra candidates (beyond maxLeadsPerRun) to pull per city
    // before phone-enrichment/filtering, since some won't have a revealed
    // phone number and get dropped. Raise this if you're consistently
    // ending up with fewer than maxLeadsPerRun leads per run.
    candidateBufferMultiplier: 3,

    resultsPerCityPage: 25,
  },

  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    tabName: process.env.GOOGLE_SHEET_TAB || 'Leads',
    credentialsPath: process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './credentials.json',
    tokenPath: process.env.GOOGLE_OAUTH_TOKEN_PATH || './token.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],

    // Column order written to the sheet. Edit this (and nothing else) if
    // you want to add/remove/reorder columns -- the rest of the code reads
    // this list to build both the header row and each appended row.
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

  workflow: {
    maxNewLeadsPerRun: 25,
  },

  schedule: {
    // Every day at 7:00 AM Eastern Time.
    cronExpression: '0 7 * * *',
    timezone: 'America/New_York',
  },

  alerting: {
    user: process.env.ALERT_EMAIL_USER,
    appPassword: process.env.ALERT_EMAIL_APP_PASSWORD,
    to: process.env.ALERT_EMAIL_TO,
  },
};
