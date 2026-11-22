// ─── Easily modify these values to change targets or behavior ───────────────

module.exports = {
  // SW Michigan cities — add or remove freely
  cities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // Decision-maker titles in priority order — Apollo matches any of these
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Industry keywords mapped to Apollo's keyword tag filter
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating',
    'Cooling',
    'Air Conditioning',
  ],

  // Employee count range: "min,max" — covers owner-operated small businesses
  employeeRange: '1,25',

  // Max leads pulled per scheduled run
  maxLeadsPerRun: 25,

  // Google Sheet config — set via .env
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Column order in the spreadsheet (zero-indexed, A=0)
  columns: {
    DATE_ADDED:    0,  // A
    BUSINESS_NAME: 1,  // B
    FIRST_NAME:    2,  // C
    LAST_NAME:     3,  // D
    PHONE:         4,  // E
    CITY:          5,  // F
    WEBSITE:       6,  // G
    CALLED:        7,  // H — left blank, filled manually
    NOTES:         8,  // I — left blank, filled manually
  },
};
