// Entry point for the always-on scheduler: runs the lead-gen workflow every
// morning at 7:00 AM Eastern Time. Start with `npm start`.
require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

const SCHEDULE = '0 7 * * *'; // minute hour day month weekday -> 7:00 AM daily

cron.schedule(
  SCHEDULE,
  () => {
    runWorkflow().catch((err) => console.error('Unhandled workflow error:', err));
  },
  { timezone: 'America/New_York' }
);

console.log('Scheduler started — lead-gen workflow will run daily at 7:00 AM Eastern Time.');
console.log('Press Ctrl+C to stop. Use `npm run run-once` to trigger a run immediately.');
