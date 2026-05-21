const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'workflow.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(level, message, data) {
  ensureLogDir();
  const ts    = new Date().toISOString();
  const entry = { timestamp: ts, level, message, ...(data && { data }) };

  // Human-readable console line
  const suffix = data ? '  ' + JSON.stringify(data) : '';
  console.log(`[${ts}] [${level.padEnd(7)}] ${message}${suffix}`);

  // Structured JSON log line for grep/tail
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

module.exports = {
  info:    (msg, data) => write('INFO',    msg, data),
  warn:    (msg, data) => write('WARN',    msg, data),
  error:   (msg, data) => write('ERROR',   msg, data),
  success: (msg, data) => write('SUCCESS', msg, data),
};
