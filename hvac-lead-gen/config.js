// ─────────────────────────────────────────────────────────────────────────────
// config.js — All tunable parameters in one place.
// Modify cities, search terms, limits, or column structure here.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  // ── Target cities ──────────────────────────────────────────────────────────
  // These are appended to primarySearchTerm to build each Google Maps query.
  // Add or remove cities freely — they all run in a single Apify scrape job.
  cities: [
    'St Joseph MI',
    'Benton Harbor MI',
    'Kalamazoo MI',
    'Holland MI',
    'Grand Haven MI',
    'Muskegon MI',
    'South Haven MI',
  ],

  // ── Search term ────────────────────────────────────────────────────────────
  // Combined with each city to form Google Maps search queries.
  // e.g. "HVAC heating air conditioning contractor Kalamazoo MI"
  // Change this to target a different industry without touching anything else.
  primarySearchTerm: 'HVAC heating air conditioning plumbing contractor',

  // ── Per-city result cap ────────────────────────────────────────────────────
  // Max places Apify will scrape per city per run.
  // 5 cities × 5 places = up to 35 raw results before filtering.
  // Increase if you're consistently getting fewer than 25 usable leads.
  maxPlacesPerCity: 5,

  // ── Run limits ─────────────────────────────────────────────────────────────
  // Maximum new leads added to the sheet per scheduled run.
  maxLeadsPerRun: 25,

  // ── Google Sheets ──────────────────────────────────────────────────────────
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName    : 'Sheet1',

  // Column headers — written to row 1 on the very first run if the sheet is empty.
  // IMPORTANT: if you reorder these, also update the row array in sheets.js → appendLeads().
  columns: [
    'Date Added',       // A
    'Business Name',    // B  ← deduplication key
    'Owner First Name', // C  (leave blank — fill in when you call)
    'Owner Last Name',  // D  (leave blank — fill in when you call)
    'Phone Number',     // E
    'City',             // F
    'Website',          // G
    'Called',           // H  (leave blank for manual tracking)
    'Notes',            // I  (leave blank for manual notes)
  ],

  // ── Notifications ──────────────────────────────────────────────────────────
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',
};
