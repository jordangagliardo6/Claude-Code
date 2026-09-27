/**
 * Google Sheets client for the HVAC lead workflow.
 *
 * Sheet columns (A–I):
 *   A: Date Added   B: Business Name   C: Owner First Name
 *   D: Owner Last Name   E: Phone Number   F: City
 *   G: Website   H: Called   I: Notes
 *
 * Authentication: OAuth2 using a credentials.json downloaded from Google Cloud
 * Console. On the first run, a browser opens for consent; the token is then
 * saved to token.json for all future headless runs.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_TAB = 'Untitled'; // The tab name inside the spreadsheet

/**
 * Load or refresh the OAuth2 client.
 * On first run: opens a browser for user consent and saves token.json.
 * On subsequent runs: reads token.json silently.
 *
 * @param {string} credentialsPath  Path to credentials.json
 * @param {string} tokenPath        Path to token.json (created on first run)
 * @returns {google.auth.OAuth2}
 */
async function getAuthClient(credentialsPath, tokenPath) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokenPath)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
    return auth;
  }

  // First-run interactive consent flow
  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n--- FIRST-TIME GOOGLE AUTHORIZATION REQUIRED ---');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter granting access, paste the authorization code below:');

  const code = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter code: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log('Token saved to', tokenPath);
  return auth;
}

/**
 * Read all existing business names from column B of the sheet.
 * Used for deduplication before appending.
 *
 * @param {object} sheetsClient  googleapis sheets instance
 * @param {string} spreadsheetId
 * @returns {Set<string>}  Lowercase business names already in the sheet
 */
async function getExistingBusinessNames(sheetsClient, spreadsheetId) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.flat().map((name) => name.toLowerCase().trim()));
}

/**
 * Append new lead rows to the sheet.
 * Each lead must already be deduped before calling this.
 *
 * @param {object} sheetsClient
 * @param {string} spreadsheetId
 * @param {Array<{ businessName, ownerFirstName, ownerLastName, phone, city, website }>} leads
 * @returns {number}  Number of rows appended
 */
async function appendLeads(sheetsClient, spreadsheetId, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    '', // Notes — left blank
  ]);

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Build and return an authenticated Google Sheets client.
 *
 * @param {string} credentialsPath
 * @param {string} tokenPath
 */
async function getSheetsClient(credentialsPath, tokenPath) {
  const auth = await getAuthClient(credentialsPath, tokenPath);
  return google.sheets({ version: 'v4', auth }).spreadsheets;
}

module.exports = { getSheetsClient, getExistingBusinessNames, appendLeads };
