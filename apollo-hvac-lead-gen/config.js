// Everything you're likely to want to tweak lives in this one file.

require('dotenv').config();

module.exports = {
  // --- Where to look ---
  // Apollo location strings of the form "City, ST". Add/remove cities here to
  // change the search area. Order doesn't matter.
  targetCities: [
    'St. Joseph, MI',
    'Benton Harbor, MI',
    'Kalamazoo, MI',
    'Holland, MI',
    'Grand Haven, MI',
    'Muskegon, MI',
    'South Haven, MI',
  ],

  // Broader state-level location used only if you set searchStatewideFallback
  // to true below. Useful if a city search comes up dry.
  stateFallbackLocation: 'Michigan, US',
  searchStatewideFallback: false,

  // --- What to look for ---
  // NAICS 238220 = "Plumbing, Heating, and Air-Conditioning Contractors", which
  // covers HVAC, heating/AC, plumbing, and mechanical contracting in one code.
  organizationNaicsCodes: ['238220'],

  // Keyword tags as a secondary/backup signal alongside the NAICS filter.
  organizationKeywordTags: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Apollo employee-count bucket: "min,max"
  organizationEmployeeRange: '1,25',

  // Job titles to search for, IN PRIORITY ORDER. When a company has more than
  // one matching contact, the highest-priority title wins.
  jobTitlesByPriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // --- Output ---
  // Column order written to the Google Sheet. Change this (and the matching
  // row-building logic in src/runWorkflow.js) if you need different columns.
  sheetColumns: [
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

  // --- Limits ---
  maxNewLeadsPerRun: parseInt(process.env.MAX_NEW_LEADS_PER_RUN, 10) || 25,
  // How many raw Apollo people-search results to pull per city before
  // filtering/dedupe/enrichment. Higher = more API/credit usage per run.
  searchResultsPerCity: 25,

  // --- Apollo ---
  apolloApiKey: process.env.APOLLO_API_KEY,
  apolloPhoneWebhookUrl: process.env.APOLLO_PHONE_WEBHOOK_URL || undefined,
  apolloBaseUrl: 'https://api.apollo.io/api/v1',

  // --- Google Sheets ---
  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleSheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || 'Leads',
  googleOauthCredentialsPath: process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './credentials.json',
  googleOauthTokenPath: process.env.GOOGLE_OAUTH_TOKEN_PATH || './token.json',
  googleScopes: ['https://www.googleapis.com/auth/spreadsheets'],

  // --- Schedule ---
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
  cronTimezone: 'America/New_York',

  // --- Alerts ---
  alert: {
    to: process.env.ALERT_EMAIL_TO,
    from: process.env.ALERT_EMAIL_FROM,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 465,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  },
};
