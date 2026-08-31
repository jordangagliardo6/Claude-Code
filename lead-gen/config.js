/**
 * Central configuration — edit here to change cities, industries,
 * job titles, batch size, or schedule without touching business logic.
 */

module.exports = {
  // ── Apollo search filters ────────────────────────────────────────────────

  /** Cities / regions to target. Each string becomes a location filter token. */
  TARGET_LOCATIONS: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
    'Southwest Michigan, United States',
  ],

  /** Fallback state-level location added alongside city list. */
  STATE_LOCATION: 'Michigan, United States',

  /** Industry strings matched against Apollo's industry taxonomy. */
  TARGET_INDUSTRIES: [
    'HVAC',
    'Heating & Air Conditioning/HVAC',
    'Heating, Ventilation & Air Conditioning',
    'Plumbing',
    'Mechanical or Industrial Engineering',
    'Mechanical Contracting',
    'Construction',
  ],

  /**
   * Job titles to target — listed in priority order.
   * Apollo will return any contact whose title contains one of these strings.
   */
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  /**
   * Employee count range: [min, max].
   * Apollo accepts the string format "1,25".
   */
  EMPLOYEE_RANGE: '1,25',

  /** How many new leads to pull per scheduled run. */
  MAX_LEADS_PER_RUN: 25,

  // ── Google Sheets ────────────────────────────────────────────────────────

  /**
   * The ID of your Google Sheet (from its URL:
   *   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit)
   * Override via GOOGLE_SPREADSHEET_ID env var.
   */
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID || 'YOUR_SPREADSHEET_ID_HERE',

  /**
   * Name of the tab/sheet within the spreadsheet.
   * Change if your tab is named differently.
   */
  SHEET_NAME: 'Leads',

  /**
   * Column headers — order matters and must match what you have in the sheet.
   * Add or reorder here if you change the sheet structure.
   */
  SHEET_HEADERS: [
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

  // ── Scheduler ────────────────────────────────────────────────────────────

  /**
   * Cron expression for 7:00 AM Eastern Time.
   * "0 7 * * *" in America/New_York timezone.
   * node-cron supports the timezone option directly.
   */
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // ── Notifications ────────────────────────────────────────────────────────

  /** Email address to send error alerts to (console log only unless SMTP is configured). */
  ALERT_EMAIL: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
};
