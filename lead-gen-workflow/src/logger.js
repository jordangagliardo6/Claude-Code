const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.padEnd(5)}] ${message}`;
  console.log(line);
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    console.error('Log file write failed:', e.message);
  }
}

module.exports = {
  info:  (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
};
