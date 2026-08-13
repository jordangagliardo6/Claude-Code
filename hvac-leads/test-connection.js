/**
 * test-connection.js
 * Pre-flight check — run this BEFORE starting the scheduler for the first time.
 *
 * Usage:
 *   npm run test-connection
 *   node test-connection.js
 *
 * What it checks:
 *   1. Apollo.io API key  — calls /users/me (0 credits consumed)
 *   2. Google Sheets      — reads spreadsheet metadata (confirms auth + sheet ID)
 *   3. SMTP (optional)    — sends a test email if SMTP_HOST is configured
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection: testSheets } = require('./sheets');
const nodemailer = require('nodemailer');

let allPassed = true;

async function run() {
  console.log('\n🔍  HVAC Lead Generator — Connection Test\n');

  await checkApollo();
  await checkSheets();
  await checkSmtp();

  console.log('\n' + '─'.repeat(50));
  if (allPassed) {
    console.log('✅  All checks passed. You are ready to run the scheduler.');
    console.log('    Start it with:  node index.js');
  } else {
    console.log('❌  One or more checks failed. Fix the issues above, then re-run.');
  }
  console.log('');
}

async function checkApollo() {
  process.stdout.write('Apollo.io API key … ');
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY not set in .env');
    return;
  }

  try {
    const res = await axios.get('https://api.apollo.io/api/v1/users/me', {
      params: { api_key: apiKey },
      timeout: 10000,
    });
    const email = res.data?.user?.email ?? '(unknown)';
    pass(`authenticated as ${email}`);
  } catch (err) {
    const detail = err.response?.data?.message ?? err.message;
    fail(detail);
  }
}

async function checkSheets() {
  process.stdout.write('Google Sheets …      ');
  try {
    const title = await testSheets();
    pass(`connected — sheet title: "${title}"`);
  } catch (err) {
    fail(err.message);
  }
}

async function checkSmtp() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('Email alerts …       SKIPPED (SMTP not configured — errors will log to console only)');
    return;
  }

  process.stdout.write('Email alerts …       ');
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.verify();

    if (NOTIFY_EMAIL) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? SMTP_USER,
        to: NOTIFY_EMAIL,
        subject: '[HVAC Lead Gen] Connection test successful',
        text: 'Your HVAC lead generator is connected and the scheduler is ready to run.',
      });
      pass(`SMTP OK — test email sent to ${NOTIFY_EMAIL}`);
    } else {
      pass('SMTP OK (set NOTIFY_EMAIL to receive error alerts)');
    }
  } catch (err) {
    fail(`SMTP error: ${err.message}`);
  }
}

function pass(detail) {
  console.log(`✅  ${detail}`);
}

function fail(detail) {
  console.log(`❌  ${detail}`);
  allPassed = false;
}

run().catch((err) => {
  console.error('Unexpected error during connection test:', err);
  process.exit(1);
});
