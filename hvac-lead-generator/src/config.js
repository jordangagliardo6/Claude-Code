'use strict';
require('dotenv').config();

// ─── EDIT THESE TO CUSTOMIZE YOUR SEARCH ────────────────────────────────────

// Cities to target. Apollo accepts "City, State, Country" format.
// Add or remove entries here without touching any other file.
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles to target, listed in priority order.
// Apollo returns results sorted by title match weight.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Keywords fed to Apollo's q_keywords field.
// Controls which industry types surface in results.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating',
  'air conditioning',
  'cooling',
  'plumbing',
  'mechanical contractor',
  'furnace',
  'ductwork',
];

// Spreadsheet column headers — order here must match the append logic in sheetsService.js.
// Add a column here AND update buildRow() in workflow.js if you ever change this.
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

// ─── RUNTIME SETTINGS (can also be overridden by .env) ──────────────────────

module.exports = {
  // Apollo.io
  apolloApiKey: process.env.APOLLO_API_KEY,
  apolloBaseUrl: 'https://api.apollo.io/v1',
  employeeRange: '1,25',   // "min,max" — owner-operated small businesses only
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // Google Sheets
  googleServiceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json',
  spreadsheetId: process.env.SPREADSHEET_ID,
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Scheduler — node-cron format with IANA timezone
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',  // 7:00 AM daily
  cronTimezone: process.env.CRON_TIMEZONE || 'America/New_York',

  // Notifications
  notificationEmail: process.env.NOTIFICATION_EMAIL || null,
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || null,
  smtpPass: process.env.SMTP_PASS || null,

  // Exported lists (referenced across modules)
  targetCities: TARGET_CITIES,
  targetTitles: TARGET_TITLES,
  industryKeywords: INDUSTRY_KEYWORDS,
  sheetColumns: SHEET_COLUMNS,
};
