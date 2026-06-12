/**
 * config.js — All user-configurable settings in one place.
 * Edit this file to change cities, filters, column layout, or schedule.
 */

const config = {
  // ── Location ──────────────────────────────────────────────────────────────
  // Add or remove cities here. Apollo accepts "City, State, Country" format.
  targetCities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // ── Job Titles ────────────────────────────────────────────────────────────
  // Listed in priority order — Owner is most desirable, GM is last resort.
  // Apollo will also include similar titles by default (e.g. "Co-Owner").
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Company Size ──────────────────────────────────────────────────────────
  // Format: ['min,max'] — owner-operated small businesses only
  companySizeRanges: ['1,25'],

  // ── Industry Codes ────────────────────────────────────────────────────────
  // SIC 1711 = Plumbing, Heating & Air-Conditioning Contractors
  sicCodes: ['1711'],
  // NAICS 238220 = Plumbing, Heating, Air-Conditioning Contractors
  naicsCodes: ['238220'],

  // Additional keyword tags to widen the net (Apollo matches against company tags)
  industryKeywords: [
    'HVAC',
    'Heating',
    'Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // ── Run Limits ────────────────────────────────────────────────────────────
  // Maximum new leads to add per scheduled run
  maxLeadsPerRun: 25,

  // ── Schedule ──────────────────────────────────────────────────────────────
  // Cron expression: "0 7 * * *" = 7:00am every day
  // See https://crontab.guru for help editing this
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ── Google Sheet Layout ───────────────────────────────────────────────────
  // Tab name inside your spreadsheet
  sheetName: 'Sheet1',

  // Column headers in the exact order they appear (or should appear) in your sheet.
  // If you add/remove columns here, also update the row-builder in sheets.js.
  columns: [
    'Date Added',        // A
    'Business Name',     // B — used for duplicate detection
    'Owner First Name',  // C
    'Owner Last Name',   // D
    'Phone Number',      // E
    'City',              // F
    'Website',           // G
    'Called',            // H — left blank; you fill this in
    'Notes',             // I — left blank; you fill this in
  ],

  // ── Notifications ─────────────────────────────────────────────────────────
  // Override with NOTIFICATION_EMAIL env var if you prefer not to hard-code it
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',
};

module.exports = config;
