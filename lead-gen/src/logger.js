const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'lead-gen.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

const logger = {
  info(message) {
    const line = `[${timestamp()}] [INFO]  ${message}`;
    console.log(line);
    writeToFile('INFO ', message);
  },

  warn(message) {
    const line = `[${timestamp()}] [WARN]  ${message}`;
    console.warn(line);
    writeToFile('WARN ', message);
  },

  error(message, err) {
    const detail = err ? ` | ${err.stack || err.message || err}` : '';
    const line = `[${timestamp()}] [ERROR] ${message}${detail}`;
    console.error(line);
    writeToFile('ERROR', `${message}${detail}`);
  },

  success(message) {
    const line = `[${timestamp()}] [OK]    ${message}`;
    console.log(line);
    writeToFile('OK   ', message);
  },

  separator() {
    const line = '-'.repeat(72);
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  },
};

module.exports = logger;
