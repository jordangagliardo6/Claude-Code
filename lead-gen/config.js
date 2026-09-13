// All tunable parameters — edit this file to change cities, titles, schedule, etc.

module.exports = {
  // Target cities and surrounding areas in Southwest Michigan
  SW_MICHIGAN_CITIES: [
    'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
    'Grand Haven', 'Muskegon', 'South Haven',
  ],

  // Person-level location filter for Apollo (state-level, then deduped by city post-fetch)
  PERSON_LOCATION: 'Michigan, United States',

  // Industries to target — used as keyword tags in Apollo search
  INDUSTRY_TAGS: ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],

  // SIC code 1711 = Plumbing, Heating & Air-Conditioning Contractors
  INDUSTRY_SIC_CODES: ['1711'],

  // NAICS 238220 = Plumbing, Heating & Air-Conditioning Contractors
  INDUSTRY_NAICS_CODES: ['23822'],

  // Job titles in priority order; Apollo will match any of these
  JOB_TITLES: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Apollo seniority levels that map to owner/founder/exec roles
  SENIORITIES: ['owner', 'founder', 'c_suite'],

  // Company headcount filter: 1–25 employees only
  EMPLOYEE_RANGES: ['1,10', '11,25'],

  // Max leads to pull per scheduled run
  MAX_LEADS_PER_RUN: 25,

  // node-cron expression for 7:00 AM Eastern every day
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // Column order in the Google Sheet (must match exactly)
  SHEET_COLUMNS: [
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

  // Index of "Business Name" in SHEET_COLUMNS (0-based) — used for dupe check
  BUSINESS_NAME_COL_INDEX: 1,
};
