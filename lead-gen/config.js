// ─── Lead Generation Configuration ───────────────────────────────────────────
// Edit this file to change cities, filters, or column structure.

module.exports = {

  // Target cities in Southwest Michigan. Add or remove freely.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  apollo: {
    // Job titles, searched in this priority order.
    personTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // Industry keywords matched against Apollo's company tags.
    industryKeywords: [
      'HVAC',
      'Heating and Air Conditioning',
      'Heating and Cooling',
      'Plumbing',
      'Mechanical Contracting',
    ],

    // Company size: owner-operated small businesses only (1–25 employees).
    employeeRanges: ['1,10', '11,25'],

    // Max new leads to pull per scheduled run.
    maxLeadsPerRun: 25,

    // Results per Apollo API page (max 100; keep ≤25 for faster first-page pulls).
    pageSize: 25,
  },

  sheets: {
    // The Google Sheets spreadsheet to append leads into.
    // This is the "HVAC Leads — SW Michigan (Master)" sheet.
    spreadsheetId: '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',

    // The tab name inside the spreadsheet. Update if the tab is renamed.
    sheetName: 'Untitled',

    // Column order — must match the actual spreadsheet headers exactly.
    columns: [
      'Date Added',       // A
      'Business Name',    // B  ← duplicate-check column
      'Owner First Name', // C
      'Owner Last Name',  // D
      'Phone Number',     // E
      'City',             // F
      'Website',          // G
      'Called',           // H  (left blank by this script)
      'Notes',            // I  (left blank by this script)
    ],
  },

  // Your email address — used for error notification emails via Gmail MCP.
  notificationEmail: 'jgagliardo98@gmail.com',

  // Cron schedule: run at 7:00 AM Eastern Time every day.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};
