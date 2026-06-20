// logger.js
//
// Minimal timestamped console logger. Kept dependency-free so it works the
// same whether run by hand, by node-cron, or by an external process
// manager (pm2, systemd, etc.) that captures stdout/stderr.

function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (msg) => console.log(`[${timestamp()}] INFO  ${msg}`),
  warn: (msg) => console.warn(`[${timestamp()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${timestamp()}] ERROR ${msg}`),
};
