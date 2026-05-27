// Central configuration — edit cities, titles, or columns here without touching business logic.

module.exports = {
  // Southwest Michigan cities to target (Apollo location strings)
  TARGET_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Decision-maker titles in descending priority — Owner ranks first
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Title priority map for sorting results (lower = higher priority)
  TITLE_PRIORITY: {
    owner: 0,
    president: 1,
    founder: 2,
    'co-founder': 3,
    'general manager': 4,
  },

  // Apollo keyword tags that map to the target industries
  INDUSTRY_KEYWORDS: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'air conditioning',
    'hvac contractor',
    'hvac services',
  ],

  // Company size: 1–25 employees (owner-operated small businesses)
  EMPLOYEE_RANGE: '1,25',

  // Maximum leads appended per scheduled run
  MAX_LEADS_PER_RUN: 25,

  // Spreadsheet column headers in order (must match COLUMNS index below)
  HEADERS: [
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

  // Column indices (0-based) — update if you reorder HEADERS above
  COLUMNS: {
    DATE_ADDED: 0,
    BUSINESS_NAME: 1,
    FIRST_NAME: 2,
    LAST_NAME: 3,
    PHONE: 4,
    CITY: 5,
    WEBSITE: 6,
    CALLED: 7,
    NOTES: 8,
  },

  // Alert recipient — overridable via ALERT_EMAIL env var
  get ALERT_EMAIL() {
    return process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com';
  },
};
