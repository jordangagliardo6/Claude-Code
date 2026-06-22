const workflow = require('./workflow');
const scheduler = require('./scheduler');
const notifier = require('./notifier');

const runOnce = process.argv.includes('--once');

if (runOnce) {
  workflow
    .run()
    .then(() => process.exit(0))
    .catch((err) => {
      notifier.logError('manual run', err);
      process.exit(1);
    });
} else {
  scheduler.start();
  // Keep the process alive for node-cron to fire on schedule.
}
