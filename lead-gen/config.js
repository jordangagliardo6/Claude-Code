/**
 * Centralized config — edit cities, titles, or industries here without touching
 * the API logic in apollo.js or sheets.js.
 */

// Add or remove cities freely. These map to Apollo person_locations filters.
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Job titles ordered by priority. Apollo returns matches in result order,
// so earlier titles will appear first when results are trimmed.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keywords sent as q_organization_keyword_tags in Apollo.
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Spreadsheet column order — change names or reorder here; update COLUMN_MAP below too.
const SHEET_COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// Maps lead object keys to their 0-based column index in SHEET_COLUMNS.
const COLUMN_MAP = {
  dateAdded:    0,
  businessName: 1,
  firstName:    2,
  lastName:     3,
  phone:        4,
  city:         5,
  website:      6,
  // Called (index 7) and Notes (index 8) are always left blank on insert.
};

// Maximum leads appended per scheduled run.
const MAX_LEADS_PER_RUN = 25;

// Employee range filter (Apollo format: "min,max"). "1,25" = owner-operated.
const EMPLOYEE_RANGE = ['1,25'];

module.exports = {
  SW_MICHIGAN_CITIES,
  TARGET_TITLES,
  TARGET_INDUSTRIES,
  SHEET_COLUMNS,
  COLUMN_MAP,
  MAX_LEADS_PER_RUN,
  EMPLOYEE_RANGE,
};
