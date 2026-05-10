const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

// Ensure logs/ exists at startup
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function ts() {
  return new Date().toISOString();
}

function appendFile(level, message) {
  fs.appendFileSync(LOG_FILE, `[${ts()}] [${level.padEnd(5)}] ${message}\n`);
}

const logger = {
  info(message) {
    const line = `[${ts()}] [INFO ] ${message}`;
    console.log(line);
    appendFile('INFO', message);
  },

  warn(message) {
    const line = `[${ts()}] [WARN ] ${message}`;
    console.warn('\x1b[33m' + line + '\x1b[0m');
    appendFile('WARN', message);
  },

  error(message, err) {
    const detail = err ? ` — ${err.message || String(err)}` : '';
    const line = `[${ts()}] [ERROR] ${message}${detail}`;
    console.error('\x1b[31m' + line + '\x1b[0m');
    appendFile('ERROR', `${message}${detail}`);
    if (err && err.stack) appendFile('ERROR', err.stack);
  },

  success(message) {
    const line = `[${ts()}] [OK   ] ${message}`;
    console.log('\x1b[32m' + line + '\x1b[0m');
    appendFile('OK', message);
  },
};

module.exports = logger;
