'use strict';

/**
 * Manual trigger — runs the workflow immediately without waiting for the cron.
 * Use this to test your setup or to pull leads on demand.
 *
 *   node run-now.js          # uses MAX_LEADS_PER_RUN from .env (default 25)
 *   node run-now.js 10       # override: pull up to 10 leads this run
 */
require('dotenv').config();
const { runLeadGen } = require('./src/workflow');

const maxLeads = parseInt(process.argv[2] || process.env.MAX_LEADS_PER_RUN || '25', 10);

console.log('═'.repeat(60));
console.log(` Manual run — max ${maxLeads} leads`);
console.log('═'.repeat(60));

runLeadGen(maxLeads)
  .then(result => {
    console.log('\nDone.');
    console.log(`  Added:    ${result.added}`);
    console.log(`  Skipped:  ${result.skipped} (duplicates or no phone)`);
    console.log(`  Searched: ${result.searched} Apollo contacts`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
