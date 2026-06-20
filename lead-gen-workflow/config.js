// config.js
//
// Single place to tweak the lead-gen workflow without touching any logic
// files. Edit the arrays/values below and the rest of the code picks them
// up automatically.

module.exports = {
  // Cities to search, in priority order. Add/remove entries freely -- each
  // one becomes a separate Apollo organization_locations search.
  targetCities: [
    { city: 'St. Joseph', state: 'MI' },
    { city: 'Benton Harbor', state: 'MI' },
    { city: 'Kalamazoo', state: 'MI' },
    { city: 'Holland', state: 'MI' },
    { city: 'Grand Haven', state: 'MI' },
    { city: 'Muskegon', state: 'MI' },
    { city: 'South Haven', state: 'MI' },
  ],

  // Apollo only supports city/state-level location filtering for this
  // endpoint, not zip codes. To still "bias toward Southwest Michigan zip
  // codes" as requested, leads whose organization postal code starts with
  // one of these prefixes are sorted to the front before the maxLeadsPerRun
  // cap is applied. SW Michigan zips run 490xx-494xx.
  swMichiganZipPrefixes: ['490', '491', '492', '493', '494'],

  // Apollo organization keyword tags used to identify the right industries.
  // These are matched as OR (any one tag matching is enough).
  industryKeywords: ['HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting'],

  // Apollo's employee-count bucket format is "min,max".
  employeeRange: '1,25',

  // Job titles to target, in priority order. When a company has multiple
  // matching contacts, the one with the highest-priority title wins.
  jobTitlePriority: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Hard cap on new leads appended to the sheet per run.
  maxLeadsPerRun: 25,

  // How many phone-enrichment poll attempts to make per lead before giving
  // up on finding a number for them (Apollo's phone reveal is async).
  phoneEnrichMaxAttempts: 4,
  phoneEnrichPollDelayMs: 8000,

  // Google Sheet column order -- keep this in sync with row 1 of the sheet.
  // Reorder/rename here and the append + dedupe logic follow automatically.
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

  // Name of the sheet/tab to read from and append to.
  sheetTabName: 'Leads',

  // Cron schedule: every day at 7:00 AM Eastern Time (cron-side timezone
  // handling is done via cronTimezone below, so this stays "0 7 * * *"
  // year-round across EST/EDT).
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};
