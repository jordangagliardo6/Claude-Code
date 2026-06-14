// One-shot manual trigger — runs the lead generation immediately.
// Use this to test or to force a run outside the 7am schedule.
//
//   node run-now.js
//
require('dotenv').config();
const { runLeadGeneration } = require('./src/workflow');

runLeadGeneration()
  .then(() => {
    console.log('\nDone. Check your Google Sheet for new leads.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\nRun failed with an unhandled error:', err.message);
    process.exit(1);
  });
