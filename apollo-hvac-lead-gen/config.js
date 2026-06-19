// Central place to tweak the lead-gen target list, filters, and sheet layout.
// Edit this file to change cities, job titles, employee range, or columns —
// nothing else in the codebase should need to change.

module.exports = {
  // Cities/metro areas this workflow targets. A lead's city must start with
  // one of these (case-insensitive) to be kept. Add more here to widen the
  // "surrounding areas" net.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Optional: zip code prefixes for surrounding areas not covered by the
  // city list above. A lead matches if its zip starts with any of these.
  // Leave empty to rely on city-name matching only.
  targetZipPrefixes: [
    '490', // St. Joseph / Benton Harbor / South Haven area
    '491', // Kalamazoo area
    '494', // Muskegon area
    '495', // Holland / Grand Haven area
  ],

  // Apollo organization_locations filter — keeps the search inside Michigan
  // before the city/zip bias above narrows it further.
  stateLocation: 'Michigan, US',

  // Keyword tags used to filter companies by industry in Apollo
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Apollo employee-count bucket: owner-operated small businesses only
  employeeRange: '1,25',

  // Job titles to target, in priority order. When a company has more than
  // one matching contact, the highest-ranked title wins.
  titlePriority: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Max number of *new* leads to add to the sheet in a single run
  maxNewLeadsPerRun: 25,

  // Google Sheet column order. Edit this if you add/remove/reorder columns
  // in the actual spreadsheet — the workflow writes rows in this order.
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

  // Name of the tab inside the spreadsheet to read/write
  sheetTabName: process.env.GOOGLE_SHEET_TAB || 'Leads',
};
