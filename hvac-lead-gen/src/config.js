/**
 * config.js — Central configuration for the HVAC lead generation workflow.
 * Edit this file to change cities, filters, schedule, or sheet structure.
 */

module.exports = {
  // ── Target Cities ─────────────────────────────────────────────────────────
  // Apollo accepts "City, State" strings for organization location filtering.
  // Add or remove cities here — no other files need to change.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // ── Decision-Maker Titles ─────────────────────────────────────────────────
  // Searched in Apollo in the order listed; Apollo will also find close variants
  // (e.g. "Co-owner", "Managing Director") unless include_similar_titles=false.
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Industry Filters ──────────────────────────────────────────────────────
  // SIC codes covering HVAC, plumbing, and mechanical contracting.
  //   1711 – Plumbing, Heating, Air-Conditioning Contractors
  //   7623 – Refrigeration & Air-Conditioning Service and Repair
  //   5075 – Warm Air Heating & AC Equipment and Supplies
  //   5074 – Plumbing and Heating Equipment and Supplies (Hydronic)
  sicCodes: ['1711', '7623', '5075', '5074'],

  // Keyword tags sent alongside SIC codes for broader Apollo matching.
  industryKeywords: ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],

  // ── Company Size ──────────────────────────────────────────────────────────
  // Apollo range format: "min,max". Targets owner-operated small businesses.
  employeeRange: '1,25',

  // ── Run Limits ────────────────────────────────────────────────────────────
  // Maximum new leads written to the sheet per daily run.
  maxLeadsPerRun: 25,

  // How many Apollo pages to scan before giving up (50 results/page).
  // Raises the candidate pool when early pages are mostly duplicates.
  maxSearchPages: 8,

  // ── Google Sheets Column Headers (in order) ───────────────────────────────
  // Change the order or names here; update appendLeads() in sheets.js to match.
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

  // Tab name inside the spreadsheet that will receive leads.
  sheetTab: 'Leads',

  // ── Schedule ──────────────────────────────────────────────────────────────
  // Cron expression: every day at 7:00am Eastern Time.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ── Phone Enrichment Polling ──────────────────────────────────────────────
  // Apollo phone enrichment is async. We poll until complete or timeout.
  phoneEnrichmentTimeoutMs: 90_000,   // 90 seconds max wait
  phoneEnrichmentPollIntervalMs: 6_000, // check every 6 seconds
};
