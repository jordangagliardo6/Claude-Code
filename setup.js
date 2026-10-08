/**
 * setup.js — First-time setup helper
 *
 * Run this once before your first scheduled run to:
 *   1. Verify your Apollo.io API key works
 *   2. Authorize Google Sheets (OAuth 2.0) and save a token
 *
 * Usage: node setup.js
 */

'use strict';

require('dotenv').config();

const { google }   = require('googleapis');
const axios        = require('axios');
const readline     = require('readline');
const fs           = require('fs');

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TOKEN_PATH       = process.env.GOOGLE_TOKEN_PATH       || './token.json';
const SPREADSHEET_ID   = '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';

// ─── Step 1: Verify Apollo API key ───────────────────────────────────────────

async function verifyApollo() {
  console.log('\n── Step 1: Apollo.io ─────────────────────────────────────────');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error('  ✗ APOLLO_API_KEY is not set in .env');
    console.error('    Get your key at https://app.apollo.io/#/settings/integrations/api');
    return false;
  }

  try {
    const res = await axios.get('https://api.apollo.io/v1/users/api_profile', {
      headers: { 'X-Api-Key': apiKey },
      timeout: 15_000,
    });
    const user = res.data.user || {};
    console.log(`  ✓ Connected as: ${user.name || user.email || 'authenticated user'}`);
    if (user.credits_used_this_month !== undefined) {
      console.log(`    Credits used this month: ${user.credits_used_this_month}`);
    }
    return true;
  } catch (err) {
    console.error(`  ✗ Apollo API error: ${err.response?.data?.message || err.message}`);
    console.error('    Check that APOLLO_API_KEY is correct and your plan includes API access.');
    return false;
  }
}

// ─── Step 2: Google Sheets OAuth ─────────────────────────────────────────────

async function authorizeGoogle() {
  console.log('\n── Step 2: Google Sheets Authorization ──────────────────────');

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`  ✗ credentials.json not found at ${CREDENTIALS_PATH}`);
    console.error('');
    console.error('  To get credentials.json:');
    console.error('  1. Go to https://console.cloud.google.com/');
    console.error('  2. Create a project (or use an existing one)');
    console.error('  3. Enable the Google Sheets API');
    console.error('  4. Go to APIs & Services → Credentials');
    console.error('  5. Create OAuth 2.0 Client ID (Desktop app)');
    console.error('  6. Download the JSON and save it as ./credentials.json');
    return false;
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // If token already exists, verify it works
  if (fs.existsSync(TOKEN_PATH)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')));
    try {
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Untitled!A1:A1',
      });
      console.log('  ✓ Google Sheets token is valid and spreadsheet is accessible.');
      console.log(`    Sheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
      return true;
    } catch {
      console.log('  Existing token expired or invalid — re-authorizing...');
    }
  }

  // Prompt for new authorization
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  console.log('\n  Open this URL in your browser:\n');
  console.log('  ' + authUrl);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    rl.question('  Paste the authorization code here: ', async code => {
      rl.close();
      try {
        const { tokens } = await auth.getToken(code.trim());
        auth.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log(`\n  ✓ Token saved to ${TOKEN_PATH}`);
        console.log('  ✓ Google Sheets authorization complete!');
        resolve(true);
      } catch (err) {
        console.error('  ✗ Failed to get token:', err.message);
        resolve(false);
      }
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Workflow — First-Time Setup');
  console.log('════════════════════════════════════════════════════════');

  const apolloOk  = await verifyApollo();
  const googleOk  = await authorizeGoogle();

  console.log('\n── Summary ───────────────────────────────────────────────');
  console.log(`  Apollo.io    : ${apolloOk ? '✓ Ready' : '✗ Needs attention'}`);
  console.log(`  Google Sheets: ${googleOk ? '✓ Ready' : '✗ Needs attention'}`);

  if (apolloOk && googleOk) {
    console.log('\n  Everything looks good!');
    console.log('  Test the full workflow now:');
    console.log('    node hvac-lead-workflow.js --run-now');
    console.log('');
    console.log('  Start the daily scheduler:');
    console.log('    node hvac-lead-workflow.js');
    console.log('');
  } else {
    console.log('\n  Fix the issues above, then re-run: node setup.js');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
