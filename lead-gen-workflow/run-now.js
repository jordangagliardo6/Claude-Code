/**
 * Trigger one lead generation run immediately, without waiting for the cron.
 * Useful for testing and for manually backfilling leads.
 *
 *   npm run run:now
 */

require('dotenv').config();
const { runWorkflow } = require('./src/index');

runWorkflow().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
