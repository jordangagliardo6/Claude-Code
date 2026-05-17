/**
 * Central configuration — edit cities, titles, columns, or filters here
 * without touching any other file.
 */

module.exports = {
  // Target cities for Southwest Michigan. Add or remove cities freely.
  TARGET_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Short city names used for dedup display and Sheet "City" column
  CITY_NAMES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Industries to target in Apollo's keyword search
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles in priority order — Apollo scores matches from the top down
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Company employee range Apollo accepts as "1,25"
  EMPLOYEE_RANGE: '1,25',

  // Google Sheets column header order — must match what's in your sheet row 1
  SHEET_COLUMNS: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',   // left blank — filled in by hand
    'Notes',    // left blank — filled in by hand
  ],

  // Which column index (0-based) holds Business Name for dedup checks
  DEDUP_COLUMN_INDEX: 1,

  // Maximum leads per scheduled run
  MAX_LEADS: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
};
