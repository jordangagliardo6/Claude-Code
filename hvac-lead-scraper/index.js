/**
 * HVAC Lead Scraper
 *
 * Searches Apollo.io for HVAC owner-operators in Southwest Michigan,
 * appends new leads to a Google Sheet, and runs every morning at 7am ET.
 *
 * Usage:
 *   node index.js           — starts the scheduler (runs at 7am ET daily)
 *   node index.js --test    — runs one search immediately to verify connectivity
 */

require("dotenv").config();
const axios = require("axios");
const cron = require("node-cron");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ─── Configuration ────────────────────────────────────────────────────────────

// Cities to search — add or remove as needed
const SW_MICHIGAN_CITIES = [
  "St. Joseph",
  "Benton Harbor",
  "Kalamazoo",
  "Holland",
  "Grand Haven",
  "Muskegon",
  "South Haven",
];

// Apollo keyword terms mapped to their industries
const TARGET_INDUSTRIES = [
  "HVAC",
  "Heating and Air Conditioning",
  "Plumbing",
  "Mechanical Contracting",
];

// Decision-maker titles in priority order — Apollo will return whichever it finds first
const TARGET_TITLES = [
  "Owner",
  "President",
  "Founder",
  "Co-Founder",
  "General Manager",
];

// Spreadsheet columns in the exact order the sheet expects
const SHEET_COLUMNS = [
  "Date Added",
  "Business Name",
  "Owner First Name",
  "Owner Last Name",
  "Phone Number",
  "City",
  "Website",
  "Called",
  "Notes",
];

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = "Leads"; // tab name inside the spreadsheet

// ─── Apollo API helpers ────────────────────────────────────────────────────────

/**
 * Search Apollo for people matching title + company filters in one city.
 * Returns up to `maxResults` contacts that have a phone number.
 */
async function searchApolloLeads(city, maxResults = 25) {
  const url = "https://api.apollo.io/v1/mixed_people/search";

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    person_titles: TARGET_TITLES,
    organization_num_employees_ranges: ["1,25"], // owner-operated, 1–25 employees
    person_locations: [`${city}, Michigan, United States`],
    contact_email_status: ["verified", "unverified", "likely to engage"],
    // We require a phone number — filter handled post-fetch since Apollo
    // doesn't expose a strict "has_phone" param in v1 people search
    page: 1,
    per_page: Math.min(maxResults * 2, 100), // fetch extra to allow phone filtering
  };

  const response = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  const people = response.data?.people || [];

  // Keep only contacts that have at least one phone number
  const withPhone = people.filter((p) => {
    const direct = p.phone_numbers?.find(
      (n) => n.type === "direct" || n.type === "mobile"
    );
    return !!direct || !!p.direct_dial?.number;
  });

  return withPhone.slice(0, maxResults);
}

/**
 * Map an Apollo person record to our spreadsheet row format.
 */
function mapApolloPersonToRow(person, city) {
  // Prefer direct or mobile over other phone types
  const phone =
    person.direct_dial?.number ||
    person.phone_numbers?.find((n) => n.type === "direct" || n.type === "mobile")
      ?.sanitized_number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    "";

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return [
    today,                             // Date Added
    person.organization?.name || "",   // Business Name
    person.first_name || "",           // Owner First Name
    person.last_name || "",            // Owner Last Name
    phone,                             // Phone Number
    person.city || city,               // City
    person.organization?.website_url || "", // Website
    "",                                // Called (blank)
    "",                                // Notes (blank)
  ];
}

// ─── Google Sheets helpers ─────────────────────────────────────────────────────

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || "./token.json";
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || "./credentials.json";

/**
 * Load or create an OAuth2 client.
 * On first run this prints a URL you visit to authorize — the token is then
 * saved to TOKEN_PATH and reused automatically on future runs.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials file not found at ${CREDENTIALS_PATH}.\n` +
        "Download it from Google Cloud Console → APIs & Services → Credentials."
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time authorization flow
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\n──────────────────────────────────────────────────────");
  console.log("FIRST-TIME SETUP: Authorize Google Drive access");
  console.log("──────────────────────────────────────────────────────");
  console.log("1. Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. Sign in and click Allow.");
  console.log("3. Copy the authorization code and paste it here.\n");

  const code = await promptUser("Enter the authorization code: ");

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log(`\nToken saved to ${TOKEN_PATH} — you won't need to do this again.\n`);

  return oAuth2Client;
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Fetch all existing business names from column B (Business Name) of the sheet.
 * Used for duplicate detection.
 */
async function getExistingBusinessNames(sheets) {
  const range = `${SHEET_NAME}!B2:B`; // column B = Business Name, skip header row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  const rows = res.data.values || [];
  // Normalize to lowercase for case-insensitive dedup
  return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
}

/**
 * Ensure the sheet has a header row; create it if the sheet is empty.
 */
async function ensureHeaderRow(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });
  const existing = res.data.values?.[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_COLUMNS] },
    });
    console.log("Header row created in sheet.");
  }
}

/**
 * Append an array of rows to the sheet.
 */
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// ─── Error notifications ───────────────────────────────────────────────────────

/**
 * Log an error and optionally send an alert email via Gmail MCP.
 * Falls back to console-only if no alert email is configured.
 */
async function handleError(context, err) {
  const message = `[HVAC Lead Scraper] ERROR in "${context}": ${err.message}`;
  console.error(`\n${message}`);
  if (err.response?.data) {
    console.error("API response:", JSON.stringify(err.response.data, null, 2));
  }

  // Write to a local error log so errors survive between runs
  const logLine = `${new Date().toISOString()} | ${context} | ${err.message}\n`;
  fs.appendFileSync("error.log", logLine);

  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail) return;

  // Best-effort email — don't crash the whole run if the email also fails
  try {
    // Using Gmail API via googleapis (requires gmail scope added to SCOPES if used)
    // For now we just log a prominent notice — extend this if you add Gmail OAuth scope
    console.error(`\n>>> ALERT: Review error.log and check your sheet manually.`);
    console.error(`>>> To receive email alerts, add Gmail API scope and implement sendAlertEmail().`);
  } catch (emailErr) {
    console.error("Could not send alert email:", emailErr.message);
  }
}

// ─── Core run logic ────────────────────────────────────────────────────────────

/**
 * Main function — searches Apollo, deduplicates, and writes to the sheet.
 * Call this directly for --test mode, or let the cron schedule call it.
 */
async function runLeadScrape() {
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead scrape...`);

  // Validate required env vars before doing any work
  if (!process.env.APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY is not set in .env");
  }
  if (!SPREADSHEET_ID) {
    throw new Error("GOOGLE_SPREADSHEET_ID is not set in .env");
  }

  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || "25", 10);

  // Set up Google Sheets client
  let auth;
  try {
    auth = await getAuthClient();
  } catch (err) {
    await handleError("Google Auth", err);
    return;
  }
  const sheets = google.sheets({ version: "v4", auth });

  await ensureHeaderRow(sheets);

  // Load existing business names for dedup
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
  } catch (err) {
    await handleError("Reading existing leads", err);
    return;
  }
  console.log(`Found ${existingNames.size} existing businesses in sheet.`);

  const newRows = [];
  let totalSearched = 0;

  // Rotate through cities until we hit maxLeads
  for (const city of SW_MICHIGAN_CITIES) {
    if (newRows.length >= maxLeads) break;

    const remaining = maxLeads - newRows.length;
    console.log(`  Searching Apollo for "${city}" (need ${remaining} more leads)...`);

    let people;
    try {
      people = await searchApolloLeads(city, remaining + 5); // +5 buffer for dupes
      totalSearched += people.length;
    } catch (err) {
      await handleError(`Apollo search for ${city}`, err);
      continue; // skip this city and try the next one
    }

    if (people.length === 0) {
      console.log(`    No results for ${city}.`);
      continue;
    }

    for (const person of people) {
      if (newRows.length >= maxLeads) break;

      const bizName = (person.organization?.name || "").trim();
      if (!bizName) continue;

      // Skip duplicates
      if (existingNames.has(bizName.toLowerCase())) {
        console.log(`    Skipping duplicate: ${bizName}`);
        continue;
      }

      const row = mapApolloPersonToRow(person, city);
      newRows.push(row);
      existingNames.add(bizName.toLowerCase()); // prevent dupes within this run too
      console.log(`    + ${bizName} (${city})`);
    }
  }

  console.log(`\nSearched ${totalSearched} Apollo contacts, found ${newRows.length} new leads.`);

  if (newRows.length === 0) {
    console.log("Nothing to append — sheet is up to date.");
    return;
  }

  // Write to sheet
  try {
    await appendRows(sheets, newRows);
    console.log(`Successfully appended ${newRows.length} leads to the sheet.`);
  } catch (err) {
    await handleError("Writing to Google Sheet", err);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const isTest = process.argv.includes("--test");

if (isTest) {
  // Run once immediately so you can verify connectivity before the first scheduled run
  console.log("Running in TEST mode — executing one scrape immediately...\n");
  runLeadScrape()
    .then(() => {
      console.log("\nTest run complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
} else {
  // Scheduled mode — run at 7am Eastern every day
  // The schedule string comes from .env so you can adjust it without touching code.
  // Default: "0 12 * * *" = noon UTC = 7am EST (or use "0 11 * * *" for EDT)
  const schedule = process.env.CRON_SCHEDULE || "0 12 * * *";

  console.log(`HVAC Lead Scraper started. Cron schedule: "${schedule}"`);
  console.log(
    "Tip: If your server runs UTC, noon UTC = 7am EST. Adjust CRON_SCHEDULE in .env for EDT.\n"
  );
  console.log('Run with --test flag to execute immediately: node index.js --test\n');

  // Validate that the cron expression is valid before sitting idle
  if (!cron.validate(schedule)) {
    console.error(`Invalid CRON_SCHEDULE: "${schedule}". Check your .env file.`);
    process.exit(1);
  }

  cron.schedule(
    schedule,
    () => {
      runLeadScrape().catch((err) =>
        handleError("Scheduled run top-level", err)
      );
    },
    {
      timezone: "America/New_York", // 7am Eastern regardless of server timezone
    }
  );

  console.log("Scheduler is running. Press Ctrl+C to stop.");
}
