// All tunable settings live here — edit this file to change cities, titles, industries, etc.

const config = {
  apollo: {
    baseURL: 'https://api.apollo.io/api/v1',

    // Job titles to search for, in priority order.
    // Apollo will also match variations (e.g. "Co-Owner" matches "Owner").
    targetTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Southwest Michigan cities and surrounding areas.
    // Each entry is passed as a person_locations filter in Apollo.
    targetLocations: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
      'Berrien County, Michigan',
      'Van Buren County, Michigan',
      'Allegan County, Michigan',
      'Ottawa County, Michigan',
    ],

    // Industry keyword tags Apollo uses to classify companies.
    industryKeywords: [
      'HVAC',
      'Heating',
      'Air Conditioning',
      'Plumbing',
      'Mechanical Contracting',
      'Heating and Cooling',
    ],

    // NAICS code 2382 = Plumbing, Heating, and Air-Conditioning Contractors.
    // SIC 1711 = Plumbing, Heating and Air-Conditioning.
    naicsCodes: ['2382'],
    sicCodes: ['1711'],

    // Company size filter: owner-operated small businesses only.
    employeeRanges: ['1,10', '11,25'],

    // Seniority levels that map to owner/decision-maker roles in Apollo.
    seniorities: ['owner', 'founder', 'c_suite'],
  },

  // Google Sheet column order (1-indexed, A=1).
  // Change this if you restructure the sheet.
  sheet: {
    sheetName: 'Sheet1', // The tab name inside the spreadsheet
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
    // Column letters for quick reference
    columns: {
      dateAdded:      'A',
      businessName:   'B',
      firstName:      'C',
      lastName:       'D',
      phone:          'E',
      city:           'F',
      website:        'G',
      called:         'H',
      notes:          'I',
    },
    // Which column to check for duplicates (0-indexed within the row array)
    dedupeColumnIndex: 1, // "Business Name" is index 1
  },

  // How many new leads to add per scheduled run.
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
};

module.exports = config;
