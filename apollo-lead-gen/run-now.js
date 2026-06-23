// ---------------------------------------------------------------------------
// Manual one-off run, for testing: `npm run run-now`
// Runs the workflow immediately (no scheduling) and exits when done.
// ---------------------------------------------------------------------------

require('dotenv').config();
const config = require('./config');
const { runWorkflowOnce } = require('./src/workflow');
const { startWebhookServer } = require('./src/phoneWebhookServer');

async function main() {
  let server;
  if (config.phoneRevealWebhookUrl) {
    // Webhook server must be up before we request enrichment so Apollo's
    // callback has somewhere to land.
    server = startWebhookServer();
  }

  const result = await runWorkflowOnce();
  console.log('Run result:', result);

  if (server) server.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
