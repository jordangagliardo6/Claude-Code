/**
 * Entry point for continuous/scheduled operation.
 * Usage: npm start
 *
 * Keeps the process alive and triggers runWorkflow() every morning at
 * 7:00 AM America/New_York (see config.js -> schedule). node-cron's
 * `timezone` option correctly handles the EST/EDT switch for you.
 */

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { runWorkflow } = require('./src/workflow');

console.log(
  `Apollo lead gen scheduler started. Will run at "${config.schedule.cronExpression}" (${config.schedule.timezone}).`
);

cron.schedule(
  config.schedule.cronExpression,
  () => {
    runWorkflow().catch((err) => {
      console.error('Unhandled error during scheduled run:', err);
    });
  },
  { timezone: config.schedule.timezone }
);
