const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function ts() {
  return new Date().toISOString();
}

function writeLine(level, message) {
  ensureLogDir();
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOG_DIR, `${date}.log`);
  fs.appendFileSync(logFile, `[${ts()}] [${level}] ${message}\n`);
}

function info(message) {
  console.log(`[INFO]  ${ts()} — ${message}`);
  writeLine('INFO', message);
}

function warn(message) {
  console.warn(`[WARN]  ${ts()} — ${message}`);
  writeLine('WARN', message);
}

function error(message, err = null) {
  const detail = err ? `: ${err.message || String(err)}` : '';
  console.error(`[ERROR] ${ts()} — ${message}${detail}`);
  if (err?.stack) console.error(err.stack);
  writeLine('ERROR', `${message}${detail}`);
}

module.exports = { info, warn, error };
