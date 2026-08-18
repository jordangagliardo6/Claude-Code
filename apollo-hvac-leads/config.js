// ─── Lead Generation Configuration ───────────────────────────────────────────
// Edit this file to change search targets, sheet settings, or schedule.

module.exports = {
  // Cities to target — add or remove as needed. Apollo matches against city/region.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industry keywords sent to Apollo's keyword tag filter.
  // These match Apollo's internal company taxonomy labels.
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles to search for, in priority order.
  // Apollo searches all titles simultaneously; priority is applied during dedup/sorting.
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Seniority levels (Apollo filter — complements job title filter)
  seniorities: ['owner', 'founder', 'c_suite'],

  // Employee range: "min,max" — targets owner-operated small businesses
  employeeRange: '1,25',

  // How many new leads to pull per scheduled run (keeps the list manageable)
  maxLeadsPerRun: 25,

  // Google Sheets target
  spreadsheet: {
    // Spreadsheet ID from the URL:
    // https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
    // Pre-filled with the "SW Michigan HVAC Leads" sheet found in your Drive.
    id: process.env.GOOGLE_SHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus',

    // Name of the tab within the spreadsheet
    sheetName: process.env.GOOGLE_SHEET_TAB || 'Sheet1',

    // Column order — change values here if you rename columns in the sheet.
    // The code writes rows in this exact order.
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

    // Which column (0-indexed) holds Business Name for duplicate detection
    businessNameColumnIndex: 1,
  },

  // Cron expression — '0 7 * * *' fires at 7:00 AM.
  // Timezone is controlled by TZ env var (set to America/New_York in .env).
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
};
