/**
 * run-now.js — Manually trigger one lead generation run immediately.
 *
 * Useful for:
 *   - Testing after initial setup
 *   - Manually backfilling leads outside the 7am schedule
 *   - Verifying a config change without waiting overnight
 *
 * Usage:
 *   node src/run-now.js
 *   npm run run-now
 */

require('dotenv').config();
const { searchHVACLeads } = require('./apollo');
const { appendLeads } = require('./sheets');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

(async () => {
  console.log(`\nManual run — pulling up to ${MAX_LEADS} HVAC leads from Apollo...\n`);

  let leads;
  try {
    leads = await searchHVACLeads(MAX_LEADS);
  } catch (err) {
    console.error('Apollo search failed:', err.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.warn('No leads returned from Apollo for the Southwest Michigan HVAC search.');
    console.warn('Check your APOLLO_API_KEY and filters in src/apollo.js.');
    process.exit(0);
  }

  console.log(`Found ${leads.length} leads. Preview:\n`);
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`);
  });
  if (leads.length > 5) console.log(`  ... and ${leads.length - 5} more`);

  console.log('\nWriting to Google Sheets...');
  let stats;
  try {
    stats = await appendLeads(leads);
  } catch (err) {
    console.error('Google Sheets write failed:', err.message);
    process.exit(1);
  }

  console.log(`\nDone!`);
  console.log(`  Rows added   : ${stats.added}`);
  console.log(`  Duplicates   : ${stats.skipped} (skipped)`);
  console.log('');
})();
