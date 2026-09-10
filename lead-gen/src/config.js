// ─── Configuration ────────────────────────────────────────────────────────────
// Edit this file to change cities, job titles, industries, or run limits.
// ──────────────────────────────────────────────────────────────────────────────

const config = {
  apollo: {
    // Max leads to add per scheduled run (keeps list manageable)
    maxLeadsPerRun: 25,

    // Southwest Michigan cities and surrounding areas.
    // Apollo accepts "City, State, Country" strings.
    locations: [
      'St. Joseph, Michigan, United States',
      'Benton Harbor, Michigan, United States',
      'Kalamazoo, Michigan, United States',
      'Holland, Michigan, United States',
      'Grand Haven, Michigan, United States',
      'Muskegon, Michigan, United States',
      'South Haven, Michigan, United States',
    ],

    // Job titles to target, searched in priority order.
    jobTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Company employee count range. "1,25" = 1 to 25 employees.
    employeeRanges: ['1,25'],

    // Industry keywords used to scope the organization search.
    industryKeywords: [
      'HVAC',
      'Heating and Air Conditioning',
      'Plumbing',
      'Mechanical Contracting',
    ],
  },

  // Cron expression for the scheduled run.
  // node-cron uses the timezone option so this stays "0 7 * * *" (7:00 AM).
  cronExpression: '0 7 * * *',
  timezone: 'America/New_York',

  // Notification email — used when SMTP is configured.
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
};

module.exports = { config };
