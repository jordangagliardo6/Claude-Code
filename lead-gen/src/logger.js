const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `run-${new Date().toISOString().split('T')[0]}.log`);

function timestamp() {
  return new Date().toISOString();
}

function write(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Don't let logging errors crash the workflow
  }
}

module.exports = {
  info:  (msg) => write('INFO ', msg),
  warn:  (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
  LOG_FILE,
};
