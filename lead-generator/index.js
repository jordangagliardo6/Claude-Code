require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./src/workflow');
const logger = require('./src/logger');

logger.info('HVAC Lead Generator started');
logger.info('Scheduled: every day at 7:00 AM Eastern Time');
logger.info('Run "node run-now.js" to trigger a run immediately');

// 0 7 * * *  =  7:00 AM every day
// timezone option makes this 7 AM Eastern regardless of server timezone
cron.schedule('0 7 * * *', async () => {
  logger.info('Cron trigger fired — starting scheduled run');
  await runLeadGeneration();
}, {
  timezone: 'America/New_York'
});
