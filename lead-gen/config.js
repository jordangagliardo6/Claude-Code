'use strict';

// ─── All configurable settings live here ──────────────────────
// Edit this file to change cities, industries, titles, or schedule
// without touching any of the core logic files.

module.exports = {
  // Cities to search. Apollo accepts multiple locations (OR logic).
  // Format: "City, State, Country" for best accuracy.
  targetLocations: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // Keyword search passed to Apollo to narrow results to HVAC / trades.
  // Apollo matches this against job title, company name, and bio fields.
  apolloKeywords: 'HVAC heating air conditioning plumbing mechanical contractor',

  // Job titles to target, in priority order.
  // Apollo will return contacts matching ANY of these titles.
  jobTitles: [
    'owner',
    'president',
    'founder',
    'co-founder',
    'co founder',
    'general manager',
  ],

  // Employee count range — "1,25" means 1–25 employees.
  // Change to "1,50" if you want slightly larger companies too.
  employeeRange: ['1,25'],

  // Maximum leads to add per scheduled run.
  // Keep low (25) so the call list stays manageable.
  maxLeadsPerRun: 25,

  // Cron expression for the daily run — "0 7 * * *" = 7:00am every day.
  // Uses 24-hour format. Paired with timezone below.
  cronSchedule: '0 7 * * *',
  timezone: 'America/New_York',

  // Google Sheets column order.
  // If you add or remove columns here, update the append logic in sheets.js too.
  sheetColumns: [
    'Date Added',       // A — filled automatically
    'Business Name',    // B — used for duplicate detection
    'Owner First Name', // C
    'Owner Last Name',  // D
    'Phone Number',     // E
    'City',             // F
    'Website',          // G
    'Called',           // H — leave blank for you to fill in
    'Notes',            // I — leave blank
  ],
};
