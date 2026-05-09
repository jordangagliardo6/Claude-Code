const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'hvac-leads.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const COLORS = {
  INFO:    '\x1b[36m',   // Cyan
  WARN:    '\x1b[33m',   // Yellow
  ERROR:   '\x1b[31m',   // Red
  SUCCESS: '\x1b[32m',   // Green
  RESET:   '\x1b[0m'
};

function timestamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }) + ' ET';
}

function log(level, message, data = null) {
  const ts = timestamp();
  const color = COLORS[level] || '';
  const reset = COLORS.RESET;

  // Pretty console output
  const prefix = `${color}[${ts}] [${level.padEnd(7)}]${reset}`;
  console.log(`${prefix} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));

  // Append structured entry to log file
  const entry = JSON.stringify({ timestamp: ts, level, message, ...(data && { data }) });
  fs.appendFileSync(LOG_FILE, entry + '\n');
}

module.exports = {
  info:    (msg, data) => log('INFO',    msg, data),
  warn:    (msg, data) => log('WARN',    msg, data),
  error:   (msg, data) => log('ERROR',   msg, data),
  success: (msg, data) => log('SUCCESS', msg, data)
};
