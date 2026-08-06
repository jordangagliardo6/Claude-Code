// All configurable parameters for the HVAC lead generation workflow.
// Edit this file to change cities, filters, schedule, or spreadsheet target.

module.exports = {
  // Target cities for Southwest Michigan — add or remove as needed
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Broader state filter keeps results anchored to Michigan
  organizationLocation: 'Michigan, United States',

  // Job titles to target, in priority order
  personTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company size: owner-operated small businesses only
  employeeRange: '1,25',

  // Industry keyword tags used in the Apollo search
  industryKeywords: [
    'HVAC',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'cooling',
  ],

  // Max leads to add per scheduled run — keeps the call list manageable
  maxLeadsPerRun: 25,

  // Cron expression: 7:00 AM Eastern (UTC-5 standard / UTC-4 daylight).
  // Running at 12:00 UTC covers both EST and EDT year-round without updating the cron.
  cronSchedule: '0 12 * * *',

  // The Google Sheets spreadsheet to append leads into.
  // This is the "HVAC SW Michigan Leads" sheet already in Google Drive.
  spreadsheetId: '1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk',

  // Sheet tab name (the default first tab)
  sheetName: 'Sheet1',

  // Column order must match what's in the spreadsheet header row
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

  // Column index (0-based) used for duplicate detection
  businessNameColumnIndex: 1,
};
