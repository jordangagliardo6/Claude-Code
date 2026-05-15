const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const RUN_LOG = path.join(LOG_DIR, 'run.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeLine(file, line) {
  fs.appendFileSync(file, line + '\n', 'utf8');
}

const logger = {
  info(message) {
    const line = `[${timestamp()}] INFO  ${message}`;
    console.log(line);
    writeLine(RUN_LOG, line);
  },

  warn(message) {
    const line = `[${timestamp()}] WARN  ${message}`;
    console.warn(line);
    writeLine(RUN_LOG, line);
  },

  error(message, err = null) {
    const detail = err ? ` | ${err.stack || err.message || err}` : '';
    const line = `[${timestamp()}] ERROR ${message}${detail}`;
    console.error(line);
    writeLine(RUN_LOG, line);
    writeLine(ERROR_LOG, line);
  },

  success(message) {
    const line = `[${timestamp()}] OK    ${message}`;
    console.log(line);
    writeLine(RUN_LOG, line);
  },

  separator() {
    const line = `${'─'.repeat(72)}`;
    console.log(line);
    writeLine(RUN_LOG, line);
  },
};

module.exports = logger;
