module.exports = {
  // -------------------------------------------------------------------
  // TARGET CITIES — add or remove cities here freely
  // -------------------------------------------------------------------
  CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // -------------------------------------------------------------------
  // JOB TITLES — listed in priority order (Apollo searches all of them)
  // -------------------------------------------------------------------
  JOB_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // -------------------------------------------------------------------
  // INDUSTRY KEYWORDS — drives the Apollo keyword search
  // Add/remove terms to widen or narrow industry match
  // -------------------------------------------------------------------
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'heating',
    'air conditioning',
    'plumbing',
    'mechanical contracting',
    'refrigeration',
  ],

  // -------------------------------------------------------------------
  // COMPANY SIZE FILTER
  // -------------------------------------------------------------------
  MIN_EMPLOYEES: 1,
  MAX_EMPLOYEES: 25,

  // -------------------------------------------------------------------
  // SCHEDULER — runs at 7:00am Eastern every day
  // Cron format: minute hour day month weekday
  // -------------------------------------------------------------------
  LEADS_PER_RUN: 25,
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // -------------------------------------------------------------------
  // GOOGLE SHEET COLUMNS — must stay in sync with sheetsClient.js row builder
  // -------------------------------------------------------------------
  SHEET_COLUMNS: [
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

  // 0-based index of Business Name column (used for deduplication)
  BUSINESS_NAME_COLUMN_INDEX: 1,
};
