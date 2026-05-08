'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function write(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}`;
  const date = timestamp().split('T')[0];
  const logFile = path.join(LOG_DIR, `workflow-${date}.log`);

  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) {
    // Non-fatal: if log file can't be written, still show console output
  }
}

module.exports = {
  log:   (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
};
