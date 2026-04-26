/**
 * config.js — Central configuration for the lead generation workflow.
 * Modify this file to change target cities, industries, job titles,
 * column structure, or run limits without touching the core logic.
 */

module.exports = {
  // ── Target geography ──────────────────────────────────────────────
  // Southwest Michigan cities to filter results down to.
  // Apollo searches at the state level; we city-filter after the fact.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // ── Apollo search filters ─────────────────────────────────────────
  // Industries passed as keywords in the Apollo search query.
  industries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles Apollo will match against — listed in descending priority.
  // When multiple contacts exist at the same company, the one with the
  // lowest index here wins.
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Employee count range. Apollo accepts "min,max" strings.
  // To target 1–25 employees, keep as-is.
  employeeRange: ['1,25'],

  // Maximum new leads written to the spreadsheet per scheduled run.
  maxLeadsPerRun: 25,

  // Maximum Apollo result pages to fetch per run (safety cap).
  // Each page is 100 candidates before city filtering.
  maxApolloPages: 5,

  // ── Google Spreadsheet structure ──────────────────────────────────
  spreadsheet: {
    // Column headers written to row 1 on the first run.
    // Must stay in sync with the column index map below.
    headers: [
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
    // Zero-based column indices — update if you reorder headers above.
    columns: {
      dateAdded:      0,
      businessName:   1,
      ownerFirstName: 2,
      ownerLastName:  3,
      phoneNumber:    4,
      city:           5,
      website:        6,
      called:         7,
      notes:          8,
    },
  },
};
