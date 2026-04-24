'use strict';
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

// Ensure log directory exists on first use without crashing at import time.
function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  ensureLogDir();
  const line = `[${timestamp()}] [${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Log directory write failure should never crash the main process.
  }
}

module.exports = {
  info: (msg, meta) => write('INFO ', msg, meta),
  warn: (msg, meta) => write('WARN ', msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta),
  success: (msg, meta) => write('OK   ', msg, meta),
};
