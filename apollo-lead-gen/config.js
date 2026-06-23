// ---------------------------------------------------------------------------
// Central configuration for the Apollo -> Google Sheets lead gen workflow.
// Edit the values below to change cities, industries, titles, or columns —
// nothing else in the codebase needs to change for those kinds of tweaks.
// ---------------------------------------------------------------------------

require('dotenv').config();

module.exports = {
  // -------------------------------------------------------------------
  // Geography
  // -------------------------------------------------------------------
  // Cities used to bias the Apollo person-location filter. Apollo matches
  // these as free-text "City, State, Country" strings. If a city stops
  // returning results, search it manually in the Apollo UI first and copy
  // the exact location string it suggests — Apollo's location matching is
  // dataset-driven and occasionally differs from plain city names.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],
  state: 'Michigan',
  country: 'US',

  // -------------------------------------------------------------------
  // Industry / company filters
  // -------------------------------------------------------------------
  // Apollo keyword tags for organization industry. Verify these against
  // Apollo's UI (Search > Companies > Industry filter) if results look thin —
  // Apollo's exact tag vocabulary can drift from these labels.
  industries: ['HVAC', 'Heating & Air Conditioning', 'Plumbing', 'Mechanical Contracting'],

  // Apollo expects employee-count ranges as "min,max" strings.
  companySizeRange: '1,25',

  // Job titles to target, in priority order. Apollo's search itself is an
  // OR-match across all titles — the priority order is enforced afterward in
  // src/workflow.js, which sorts results so the highest-priority titles
  // (Owner, President, ...) are kept first when trimming to maxLeadsPerRun.
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // -------------------------------------------------------------------
  // Run limits
  // -------------------------------------------------------------------
  maxLeadsPerRun: 25,

  // How many raw Apollo results to pull per page while searching. Apollo
  // caps per_page at 100; we request more than maxLeadsPerRun because some
  // candidates will be filtered out for missing phone numbers or duplicates.
  apolloResultsPerPage: 50,
  apolloMaxPages: 3,

  // -------------------------------------------------------------------
  // Phone reveal (see src/apolloClient.js for full explanation)
  // -------------------------------------------------------------------
  // Apollo will not return mobile/direct-dial numbers in search results.
  // Revealing a number requires a People Enrichment call with
  // reveal_phone_number: true, and Apollo delivers the actual digits
  // asynchronously to a webhook URL you control (TCPA compliance).
  //
  // Set PHONE_REVEAL_WEBHOOK_URL in .env to a publicly reachable URL that
  // routes to this app's webhook server (src/phoneWebhookServer.js), e.g.
  // an ngrok tunnel during testing or a small deployed instance in
  // production. If left unset, the workflow falls back to using only
  // phone numbers Apollo already exposes directly on the org/person record
  // (fewer matches, but zero extra infrastructure).
  phoneRevealWebhookUrl: process.env.PHONE_REVEAL_WEBHOOK_URL || null,
  phoneRevealTimeoutMs: 45_000,
  webhookServerPort: process.env.WEBHOOK_PORT || 3300,

  // -------------------------------------------------------------------
  // Google Sheet layout
  // -------------------------------------------------------------------
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  sheetTabName: process.env.GOOGLE_SHEET_TAB || 'Leads',

  // Column order written to the sheet. "Called" and "Notes" are always left
  // blank by the workflow — they're for you to fill in by hand.
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
  // Index (0-based) of the "Business Name" column above — used for the
  // duplicate check. Keep this in sync if you reorder `columns`.
  businessNameColumnIndex: 1,

  // -------------------------------------------------------------------
  // Schedule
  // -------------------------------------------------------------------
  cronExpression: '0 7 * * *', // 7:00 AM every day
  timezone: 'America/New_York', // node-cron + Eastern Time, handles EST/EDT automatically

  // -------------------------------------------------------------------
  // Alerting
  // -------------------------------------------------------------------
  alertEmailTo: process.env.ALERT_EMAIL_TO,
};
