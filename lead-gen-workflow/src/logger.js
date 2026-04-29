/**
 * Logger utility
 *
 * Writes timestamped log lines to both stdout and a rotating daily log file
 * inside the /logs directory.  All levels (info, warn, error) also appear in
 * the console so the output is visible when running interactively or via cron.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Ensure the logs directory exists at module load time
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

function _timestamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
}

function _todayFilename() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(LOGS_DIR, `${yyyy}-${mm}-${dd}.log`);
}

function _write(level, message, meta) {
  const ts = _timestamp();
  const metaPart = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] [${level.toUpperCase()}] ${message}${metaPart}`;

  // Console output with color hints
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  // Append to daily log file (non-blocking; ignore write errors)
  try {
    fs.appendFileSync(_todayFilename(), line + '\n');
  } catch (_) {
    // If file logging fails, silently continue — console output is enough
  }
}

const logger = {
  info: (msg, meta) => _write('info', msg, meta),
  warn: (msg, meta) => _write('warn', msg, meta),
  error: (msg, meta) => _write('error', msg, meta),
};

module.exports = logger;
