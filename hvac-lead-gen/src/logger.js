const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../logs/hvac-lead-gen.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function ts() {
  return new Date().toISOString();
}

function write(level, message) {
  try {
    fs.appendFileSync(LOG_FILE, `[${ts()}] [${level}] ${message}\n`);
  } catch {
    // Never crash the workflow over a logging failure
  }
}

module.exports = {
  info(msg)  { console.log(`[${ts()}] [INFO]  ${msg}`);  write('INFO ', msg); },
  warn(msg)  { console.warn(`[${ts()}] [WARN]  ${msg}`); write('WARN ', msg); },
  error(msg) { console.error(`[${ts()}] [ERROR] ${msg}`); write('ERROR', msg); },
};
