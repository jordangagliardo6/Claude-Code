const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fmt(level, msg) {
  return `[${new Date().toISOString()}] [${level.padEnd(5)}] ${msg}`;
}

function write(line) {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // If log file write fails, console is still active — don't crash the workflow
  }
}

function info(msg)  { const l = fmt('INFO',  msg); console.log(l);   write(l); }
function warn(msg)  { const l = fmt('WARN',  msg); console.warn(l);  write(l); }
function error(msg, err = null) {
  const detail = err ? `${msg}: ${err.message}` : msg;
  const l = fmt('ERROR', detail);
  console.error(l);
  if (err && err.stack) console.error(err.stack);
  write(l);
}

module.exports = { info, warn, error };
