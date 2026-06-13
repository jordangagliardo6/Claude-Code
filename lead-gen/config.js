'use strict';
// ─── Easy-to-modify settings ──────────────────────────────────────────────────

module.exports = {
  // Cities to target — add or remove as needed
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  targetState: 'Michigan',

  // Apollo job titles in priority order (first match wins per company)
  jobTitlePriority: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Company size filter sent to Apollo
  companySizeRange: '1,25',

  // Max leads to add per scheduled run
  maxLeadsPerRun: 25,

  // SIC codes: 1711 = Plumbing/Heating/AC contractors, 7623 = AC service & repair
  sicCodes: ['1711', '7623'],

  // NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
  naicsCodes: ['238220'],

  // Extra keyword tags to broaden the Apollo search
  industryKeywords: ['hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],

  // Google Sheet tab name (the label on the tab at the bottom of the spreadsheet)
  sheetTabName: process.env.SHEET_TAB_NAME || 'Sheet1',

  // Columns — order here must match the actual sheet columns exactly
  columns: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes'],

  // Cron schedule: "0 7 * * *" = every day at 7:00 AM
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};
