const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, data = null) {
  ensureLogDir();
  const entry = { timestamp: timestamp(), level, message, ...(data && { data }) };
  const line = JSON.stringify(entry);
  console.log(`[${entry.timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

module.exports = {
  info:  (msg, data) => log('INFO',  msg, data),
  warn:  (msg, data) => log('WARN',  msg, data),
  error: (msg, data) => log('ERROR', msg, data),
};
