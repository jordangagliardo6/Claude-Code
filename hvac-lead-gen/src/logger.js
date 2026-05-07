const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, data = null) {
  const entry = {
    ts: timestamp(),
    level,
    message,
    ...(data && { data }),
  };

  const line = JSON.stringify(entry);
  const display = `[${entry.ts}] [${level.toUpperCase()}] ${message}${data ? ' — ' + JSON.stringify(data) : ''}`;

  console.log(display);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

const logger = {
  info: (msg, data) => write('info', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
  success: (msg, data) => write('success', msg, data),
};

module.exports = logger;
