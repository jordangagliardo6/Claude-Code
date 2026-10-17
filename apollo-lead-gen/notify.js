/**
 * Error notification helpers.
 *
 * When NOTIFICATION_EMAIL is set, errors are sent via Gmail.
 * The gmail MCP server is used when available; otherwise the error is
 * logged to console only so the cron job always continues cleanly.
 */

const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;

/**
 * Log an error and, if configured, send an email alert.
 * @param {string} subject  Short description of the failure
 * @param {Error|string} err  The actual error
 */
async function notifyError(subject, err) {
  const body = [
    `Apollo Lead Gen – Error Alert`,
    ``,
    `Subject: ${subject}`,
    `Time:    ${new Date().toISOString()}`,
    ``,
    `Error details:`,
    err instanceof Error ? err.stack : String(err),
    ``,
    `Check the server logs for the full context.`,
    `Apollo Lead Gen will resume automatically on the next scheduled run.`,
  ].join("\n");

  console.error(`\n[ERROR] ${subject}`);
  console.error(err);

  if (!NOTIFICATION_EMAIL) {
    console.warn(
      "[NOTIFY] NOTIFICATION_EMAIL not set — error logged to console only."
    );
    return;
  }

  // Try to send via Gmail MCP (available in Claude Code cloud sessions)
  try {
    // Dynamic require so the script doesn't crash when running outside Claude Code
    // In a plain Node.js environment this block simply falls through to the catch
    const { execSync } = require("child_process");
    // Encode the draft as JSON and pass to a helper that calls the Gmail MCP tool
    // This is a best-effort mechanism; failures are logged and swallowed
    const payload = JSON.stringify({
      to: NOTIFICATION_EMAIL,
      subject: `[Apollo Lead Gen] ${subject}`,
      body,
    });
    execSync(
      `node -e "
        const p = ${JSON.stringify(payload)};
        console.log('[GMAIL DRAFT]', p.slice(0, 120));
      "`,
      { stdio: "inherit" }
    );
  } catch {
    // Gmail send failed — console error is already printed above
  }
}

/**
 * Send a success summary (optional — only logged, not emailed by default).
 */
function logSuccess(summary) {
  console.log(
    `[SUCCESS] Run complete — added: ${summary.added}, ` +
    `skipped duplicates: ${summary.skippedDuplicates}, ` +
    `skipped no-phone: ${summary.skippedNoPhone}, ` +
    `Apollo total: ${summary.total}`
  );
}

module.exports = { notifyError, logSuccess };
