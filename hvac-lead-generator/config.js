require('dotenv').config();

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    maxLeadsPerRun: 25,

    // Cities to target — edit this list freely
    cities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
    ],

    // Southwest Michigan zip codes to bias results
    zipCodes: [
      '49085', '49022', '49024', '49001', '49006',
      '49423', '49417', '49441', '49090',
    ],

    // Industry keywords — add/remove as needed
    industryKeywords: 'HVAC OR "heating and air" OR "air conditioning" OR plumbing OR "mechanical contracting"',

    // Employee range: "min,max"
    employeeRange: '1,25',

    // Job titles in priority order
    targetTitles: ['owner', 'president', 'founder', 'co-founder', 'general manager'],
  },

  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    // The tab name inside your spreadsheet
    sheetName: process.env.SHEET_TAB_NAME || 'Leads',
    // Column order — matches the row builder in sheets.js
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
  },

  cron: {
    // 7:00 AM every day, Eastern Time
    schedule: '0 7 * * *',
    timezone: 'America/New_York',
  },

  notification: {
    // Set NOTIFICATION_EMAIL in your .env to receive error alerts
    email: process.env.NOTIFICATION_EMAIL || '',
  },
};
