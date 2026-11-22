const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// One log file per day
const logFile = path.join(LOG_DIR, `run-${new Date().toISOString().slice(0, 10)}.log`);

function write(level, msg, extra) {
  const ts = new Date().toISOString();
  const suffix = extra
    ? ' — ' + (extra instanceof Error ? extra.stack : JSON.stringify(extra))
    : '';
  const line = `[${ts}] [${level.padEnd(5)}] ${msg}${suffix}`;
  console.log(line);
  try {
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) {
    // non-fatal if log write fails
  }
}

module.exports = {
  info:  (msg, extra) => write('INFO',  msg, extra),
  warn:  (msg, extra) => write('WARN',  msg, extra),
  error: (msg, extra) => write('ERROR', msg, extra),
  logFile,
};
