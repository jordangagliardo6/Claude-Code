/**
 * Central configuration for the Apollo -> Google Sheets lead gen workflow.
 * Edit this file to change cities, industries, titles, or sheet columns —
 * nothing else in the codebase needs to change for those kinds of tweaks.
 */

module.exports = {
  // Cities to search (Southwest Michigan). Apollo matches on "City, State, Country".
  // Add/remove cities here to change targeting.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // State-level fallback used alongside the cities above so Apollo's location
  // matching (which is fuzzy) still biases toward Southwest Michigan even when
  // a contact's listed city doesn't exactly match one of the names above.
  state: 'Michigan, United States',

  // Industry / keyword tags used to filter companies. These map to Apollo's
  // q_organization_keyword_tags search param.
  industryKeywords: ['HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting'],

  // Apollo's organization_num_employees_ranges expects "min,max" strings.
  employeeRanges: ['1,25'],

  // Job titles to target, IN PRIORITY ORDER. When more matching leads are found
  // than maxLeadsPerRun allows, contacts with earlier titles in this list are
  // kept first.
  titlesByPriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Hard cap on how many *new* leads get written to the sheet in a single run.
  maxLeadsPerRun: 25,

  // How many results to request from Apollo per page (per search request).
  // Kept generous relative to maxLeadsPerRun so there's enough headroom for
  // leads to be dropped for missing phone numbers or duplicates.
  apolloResultsPerPage: 50,

  // Google Sheet layout. Columns must stay in this order — "Called" and
  // "Notes" are intentionally left blank for manual follow-up.
  sheet: {
    tabName: process.env.GOOGLE_SHEET_TAB_NAME || 'Leads',
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

  // Cron schedule: every day at 7:00 AM America/New_York (handles EST/EDT
  // automatically via the timezone option in node-cron).
  schedule: {
    cronExpression: '0 7 * * *',
    timezone: 'America/New_York',
  },
};
