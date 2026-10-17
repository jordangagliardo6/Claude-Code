/**
 * Connection test — run this BEFORE the first scheduled run.
 *
 *   node test-connection.js
 *
 * Tests:
 *   1. Apollo.io API key is valid and returns contacts
 *   2. Google Sheets API can read the target spreadsheet
 *   3. Google Sheets API can append a test row (then deletes it)
 */

require("dotenv").config();
const axios = require("axios");
const { google } = require("googleapis");
const path = require("path");

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  ✗  ${label}`);
  console.error(`     ${err.message || err}`);
  failed++;
}

// ── 1. Validate env vars ─────────────────────────────────────────────────────
console.log("\n── Environment variables ───────────────────────────────");
const required = [
  "APOLLO_API_KEY",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_KEY_FILE",
];
for (const key of required) {
  process.env[key]
    ? pass(`${key} is set`)
    : fail(key, new Error(`${key} is missing from .env`));
}

// ── 2. Apollo.io connectivity ─────────────────────────────────────────────────
console.log("\n── Apollo.io API ───────────────────────────────────────");
async function testApollo() {
  try {
    const res = await axios.post(
      "https://api.apollo.io/api/v1/mixed_people/search",
      {
        api_key: process.env.APOLLO_API_KEY,
        per_page: 1,
        person_locations: ["Kalamazoo, Michigan, United States"],
        person_titles: ["owner"],
        organization_keyword_tags: ["hvac"],
        organization_num_employees_ranges: ["1,25"],
        contact_phone_number_status: ["verified"],
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      }
    );

    const count = (res.data.people || []).length;
    pass(`Apollo API responded — returned ${count} contact(s) for test query`);

    if (res.data.pagination) {
      const total = res.data.pagination.total_entries || "unknown";
      pass(`Pagination visible — total matching records: ${total}`);
    }
  } catch (err) {
    const status = err.response ? err.response.status : "network error";
    fail(
      `Apollo API call failed (HTTP ${status})`,
      err.response ? new Error(JSON.stringify(err.response.data)) : err
    );
  }
}

// ── 3. Google Sheets connectivity ─────────────────────────────────────────────
console.log("\n── Google Sheets API ───────────────────────────────────");
async function testSheets() {
  const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  let sheets;

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheets = google.sheets({ version: "v4", auth });
    pass("Service account credentials loaded");
  } catch (err) {
    fail("Failed to load service account credentials", err);
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";

  // Read test
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A1:I1`,
    });
    const rows = res.data.values || [];
    pass(`Read access confirmed — row 1: ${rows[0] ? rows[0].join(" | ") : "(empty)"}`);
  } catch (err) {
    fail("Read failed — check sheet ID and service account permissions", err);
    return;
  }

  // Append test row
  try {
    const testRow = [
      "TEST-DELETE-ME",
      "Test Business",
      "Test",
      "User",
      "555-000-0000",
      "Kalamazoo",
      "https://example.com",
      "",
      "automated connection test — safe to delete",
    ];
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:I`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [testRow] },
    });
    const updatedRange = appendRes.data.updates.updatedRange;
    pass(`Write access confirmed — appended test row at ${updatedRange}`);

    // Delete the test row
    // Find its row number from the range string (e.g. "Sheet1!A5:I5" → row 5)
    const match = updatedRange.match(/!A(\d+)/);
    if (match) {
      const rowIndex = parseInt(match[1], 10) - 1; // 0-based
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetMeta = spreadsheet.data.sheets.find(
        (s) => s.properties.title === tab
      );
      if (sheetMeta) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: sheetMeta.properties.sheetId,
                    dimension: "ROWS",
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1,
                  },
                },
              },
            ],
          },
        });
        pass("Test row deleted — sheet is clean");
      }
    }
  } catch (err) {
    fail("Write test failed — check service account has Editor permission on the sheet", err);
  }
}

// ── Run all tests ─────────────────────────────────────────────────────────────
(async () => {
  await testApollo();
  await testSheets();

  console.log(`\n── Result ──────────────────────────────────────────────`);
  console.log(`   Passed: ${passed}   Failed: ${failed}`);

  if (failed === 0) {
    console.log(`\n   All checks passed. You're ready to run the scheduler.`);
    console.log(`   Start with:  npm start`);
    console.log(`   Or run once: npm run run-once\n`);
  } else {
    console.log(`\n   Fix the ${failed} issue(s) above before starting the scheduler.\n`);
    process.exit(1);
  }
})();
