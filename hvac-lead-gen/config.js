// ─── Search Configuration ────────────────────────────────────────────────────
// Edit this file to change target cities, industries, or job titles.

const config = {
  // Southwest Michigan cities — add or remove as needed
  targetCities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // Job titles — listed in priority order; all are searched simultaneously
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Industry keywords sent to Apollo's keyword search field
  // Apollo searches organization names and descriptions for these terms
  industryKeywords: 'HVAC OR "heating and air" OR "air conditioning" OR plumbing OR "mechanical contracting"',

  // Company size: 1–25 employees (owner-operated small businesses)
  employeeRanges: ['1,25'],

  // Maximum new leads to pull per run — keeps daily volume manageable
  maxLeadsPerRun: 25,

  // Cron schedule: 7:00 AM Eastern Time every day
  // node-cron uses the timezone option; this handles DST automatically
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // Google Sheet column order — must match your sheet's header row exactly
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
};

module.exports = config;
