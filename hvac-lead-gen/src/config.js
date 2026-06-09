// Central configuration — edit this file to change cities, titles, or industries.
// No changes needed elsewhere in the codebase.

module.exports = {
  // Target cities in Southwest Michigan. Apollo accepts "City, State" format.
  targetLocations: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Job titles to target, in priority order. Apollo ranks by title match.
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Industry keyword tags used in Apollo's keyword search.
  // Apollo maps these to SIC/NAICS industry categories internally.
  targetIndustries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating, Ventilation & Air Conditioning',
  ],

  // Employee count range (inclusive). Targets owner-operated small businesses.
  employeeRange: {
    min: 1,
    max: 25,
  },

  // Spreadsheet column order — mirrors the Google Sheet headers exactly.
  // Change this array if you add/remove columns; update the sheet headers to match.
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

  // Maximum leads per scheduled run. Keeps the daily list manageable.
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
};
