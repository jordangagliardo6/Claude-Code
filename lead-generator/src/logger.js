const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function timestamp() {
  return new Date().toISOString();
}

function formatLine(level, message) {
  return `[${timestamp()}] [${level}] ${message}`;
}

function writeToFile(line) {
  try {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logFile = path.join(LOG_DIR, `${dateStr}.log`);
    fs.appendFileSync(logFile, line + '\n');
  } catch (_) {
    // Non-fatal — file logging is best-effort
  }
}

const logger = {
  info(msg) {
    const line = formatLine('INFO', msg);
    console.log(line);
    writeToFile(line);
  },
  warn(msg) {
    const line = formatLine('WARN', msg);
    console.warn(line);
    writeToFile(line);
  },
  error(msg) {
    const line = formatLine('ERROR', msg);
    console.error(line);
    writeToFile(line);
  }
};

module.exports = logger;
