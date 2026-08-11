// ─── Configuration ──────────────────────────────────────────────────────────
// Edit this file to change cities, job titles, column layout, or schedule.
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Cities to target (add/remove freely)
  cities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],
  state: 'Michigan',

  apollo: {
    // Job titles in priority order — Owner is most valuable, GM least
    jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // HVAC industry SIC code (1711 = Plumbing, Heating, Air-Conditioning Contractors)
    // Combined with keyword tags for broadest coverage
    sicCodes: ['1711'],
    keywordTags: ['HVAC', 'heating and air conditioning', 'plumbing', 'mechanical contracting'],

    // 1–25 employees only (owner-operated small businesses)
    employeeRanges: ['1,25'],

    // Max new leads to add per scheduled run
    maxLeadsPerRun: 25,
  },

  sheets: {
    // The Google Sheets spreadsheet ID from the URL:
    // https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
    spreadsheetId: process.env.SPREADSHEET_ID,

    // Sheet tab name (default is "Sheet1"; change if yours differs)
    sheetName: 'Sheet1',

    // Column headers in order — change order here to rearrange columns
    columns: [
      'Date Added',
      'Business Name',
      'Owner First Name',
      'Owner Last Name',
      'Phone Number',
      'City',
      'Website',
      'Called',  // left blank by automation
      'Notes',   // left blank by automation
    ],
  },

  // node-cron schedule: 7:00 AM Eastern every day
  // Format: second(opt) minute hour day month weekday
  schedule: '0 7 * * *',
  timezone: 'America/New_York',

  // Alert email for error notifications (used if nodemailer is configured)
  alertEmail: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
};
