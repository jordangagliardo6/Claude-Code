// ─────────────────────────────────────────────────────────────────────────────
// config.js — All tunable parameters in one place.
// Modify cities, industries, job titles, or column structure here.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  // ── Target locations ───────────────────────────────────────────────────────
  // Apollo uses "City, State, Country" format.
  // Add or remove cities freely — the workflow cycles through each one.
  cities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // ── Industry keywords ──────────────────────────────────────────────────────
  // Apollo matches these against organization descriptions and tags.
  industries: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // ── Decision-maker job titles (priority order) ────────────────────────────
  // Apollo will return people whose titles contain any of these strings.
  jobTitles: [
    'owner',
    'president',
    'founder',
    'co-founder',
    'general manager',
  ],

  // ── Company size filter ────────────────────────────────────────────────────
  // "1,25" means 1–25 employees (owner-operated small businesses only).
  employeeRange: '1,25',

  // ── Run limits ─────────────────────────────────────────────────────────────
  // Maximum new leads to add per scheduled run. Keeps the list manageable.
  maxLeadsPerRun: 25,

  // ── Google Sheets ──────────────────────────────────────────────────────────
  // Spreadsheet ID is read from the GOOGLE_SPREADSHEET_ID env var.
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,

  // Name of the tab/sheet within the spreadsheet.
  sheetName: 'Leads',

  // Column headers written to row 1 on first run (if the sheet is empty).
  // IMPORTANT: These must stay in sync with the row-building logic in sheets.js.
  columns: [
    'Date Added',       // A
    'Business Name',    // B  ← deduplication key
    'Owner First Name', // C
    'Owner Last Name',  // D
    'Phone Number',     // E
    'City',             // F
    'Website',          // G
    'Called',           // H — left blank for you to fill in
    'Notes',            // I — left blank for you to fill in
  ],

  // ── Notifications ──────────────────────────────────────────────────────────
  // Used by workflow.js notifyError(). Set in .env or leave blank to skip.
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',
};
