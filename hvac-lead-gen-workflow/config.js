// Central place for everything you're likely to want to tweak.
// Edit this file to change cities, industries, job title priority, or sheet columns.
require('dotenv').config();

module.exports = {
  // Cities to search around. Apollo matches on "City, State" strings.
  // Add/remove cities here - no other code changes needed.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Fallback/bias location passed alongside the cities above.
  state: 'Michigan, United States',

  // Apollo doesn't expose a clean "industry" filter on this endpoint, so we match
  // against organization keyword tags instead - this is the closest equivalent.
  industries: ['HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting'],

  // Apollo's employee-count bucket format is "min,max".
  employeeRange: '1,25',

  // Order matters: candidates are sorted so Owner > President > Founder > ... appear first.
  titlesByPriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Hard cap on how many *new* (non-duplicate) leads get written per run.
  maxNewLeadsPerRun: 25,

  // How many raw candidates to pull from Apollo search before enrichment/filtering.
  // Larger pool = better odds of hitting maxNewLeadsPerRun after phone/dedupe filtering,
  // at the cost of more enrichment API credits per run.
  searchCandidatePoolSize: 100,

  // Google Sheet tab name and column order. If you change this, the header row
  // in the sheet will be rewritten to match on the next run (only when the sheet is empty).
  sheetName: process.env.SHEET_NAME || 'Leads',
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

  // When the scheduler runs the workflow automatically.
  schedule: {
    cronExpression: '0 7 * * *', // 7:00 AM every day
    timezone: 'America/New_York',
  },
};
