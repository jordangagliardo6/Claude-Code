/**
 * Entry point — schedules the lead generation workflow.
 *
 * Usage:
 *   node index.js            Start scheduler (runs at CRON_SCHEDULE, default 7am ET)
 *   node index.js --run-now  Run once immediately, then exit
 */

require("dotenv").config();
const cron = require("node-cron");
const { runLeadGen } = require("./leadgen");
const { notifyError, logSuccess } = require("./notify");

// 7:00 AM Eastern = 12:00 UTC (EST) or 11:00 UTC (EDT).
// Default cron targets 12:00 UTC which is 7am ET during Eastern Standard Time.
// Adjust CRON_SCHEDULE to "0 11 * * *" during Daylight Saving Time if needed.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 12 * * *";

async function executeWorkflow() {
  console.log(`\n[${new Date().toISOString()}] Starting lead generation run...`);

  // Validate required environment variables before doing any API work
  const missing = ["APOLLO_API_KEY", "GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_KEY_FILE"]
    .filter((k) => !process.env[k]);

  if (missing.length) {
    const msg = `Missing required environment variables: ${missing.join(", ")}`;
    await notifyError("Configuration error", new Error(msg));
    return;
  }

  try {
    const summary = await runLeadGen();
    logSuccess(summary);

    if (summary.added === 0 && summary.total === 0) {
      await notifyError(
        "Apollo returned no results",
        new Error(
          "The Apollo search returned 0 contacts. Check your API key, " +
          "plan credits, and search filters in config.js."
        )
      );
    }
  } catch (err) {
    const isSheetError =
      err.message && err.message.toLowerCase().includes("google");
    const subject = isSheetError
      ? "Google Sheets write failed"
      : "Lead generation run failed";
    await notifyError(subject, err);
  }
}

// --run-now flag: execute once and exit (useful for testing)
if (process.argv.includes("--run-now")) {
  executeWorkflow().then(() => {
    console.log("One-shot run complete. Exiting.");
    process.exit(0);
  });
} else {
  // Validate cron expression before starting
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}"`);
    console.error(
      'Expected format: "minute hour * * *" — e.g. "0 12 * * *" for noon UTC'
    );
    process.exit(1);
  }

  console.log(`Lead generation scheduler started.`);
  console.log(`Schedule: ${CRON_SCHEDULE} (UTC)`);
  console.log(`Max leads per run: ${process.env.MAX_LEADS_PER_RUN || 25}`);
  console.log(`Press Ctrl+C to stop.\n`);

  cron.schedule(CRON_SCHEDULE, executeWorkflow, {
    timezone: "UTC",
  });
}
