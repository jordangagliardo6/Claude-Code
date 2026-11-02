// ============================================================
// HVAC Lead Scraper — Configuration
// Edit this file to change cities, titles, or run settings.
// ============================================================

module.exports = {
  // --- LOCATION TARGETS ---
  // Add or remove cities as needed. These are compared case-insensitively
  // against the city field returned by Apollo.
  targetCities: [
    'St. Joseph',
    'Saint Joseph',  // Apollo may return either spelling
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Broader state/region string passed to Apollo search.
  // Apollo location filter: returns contacts whose org is in this region.
  apolloLocationFilter: 'Michigan, United States',

  // --- JOB TITLES (priority order — Owner first) ---
  // Apollo will return contacts matching any of these titles.
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'Co-owner',
    'General Manager',
  ],

  // --- INDUSTRY ---
  // Apollo industry tag IDs for HVAC/plumbing.
  // To find the correct IDs: log into Apollo → Search → Filter by Industry →
  // open DevTools Network tab and look for the tag IDs in the request payload.
  // Common Apollo tag IDs for these industries:
  //   5567cd4773696439ab3e0000  → Mechanical or Industrial Engineering
  //   5567cd4773696439ab370000  → Construction
  // Leave empty to skip industry filtering (title + location alone works well).
  industryTagIds: [],

  // Keywords added to Apollo's q_keywords for extra relevance.
  // Apollo uses these to narrow results to companies in these industries.
  industryKeywords: ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical'],

  // --- COMPANY SIZE ---
  // Only target owner-operated small businesses (1–25 employees).
  employeeRange: '1,25',

  // --- RUN SETTINGS ---
  // Maximum new leads to add per scheduled run. Keeps the list manageable.
  maxLeadsPerRun: 25,

  // Cron schedule — 7:00 AM Eastern Time.
  // EST = UTC-5  → 12:00 UTC  (Nov–Mar)
  // EDT = UTC-4  → 11:00 UTC  (Mar–Nov)
  // node-cron runs on the server's local time; if the server is UTC use '0 12 * * *'.
  // If the server is already in Eastern Time, use '0 7 * * *'.
  cronSchedule: '0 12 * * *',  // Change to '0 7 * * *' if server is set to Eastern Time

  // --- GOOGLE SHEET COLUMN POSITIONS (0-indexed) ---
  // Change only if you reorder the spreadsheet columns.
  columns: {
    dateAdded:     0,   // A
    businessName:  1,   // B  ← used for duplicate detection
    firstName:     2,   // C
    lastName:      3,   // D
    phone:         4,   // E
    city:          5,   // F
    website:       6,   // G
    called:        7,   // H  (left blank by script)
    notes:         8,   // I  (left blank by script)
  },

  // Header row to create when setting up a new sheet.
  headerRow: [
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
};
