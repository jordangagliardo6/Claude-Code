// Minimal structured logger — timestamps every line, persists to a log file
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'workflow.log');

function timestamp() {
  return new Date().toISOString();
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

const logger = {
  info:  (msg) => write('INFO ', msg),
  warn:  (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
  success: (msg) => write('OK   ', msg),
};

module.exports = logger;
