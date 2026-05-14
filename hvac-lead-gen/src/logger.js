const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(level, message) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logFile = path.join(LOG_DIR, `${date}.log`);
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, line, 'utf8');
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
    const detail = err ? ` — ${err.message || err}` : '';
    const line = `[${timestamp()}] [ERROR] ${message}${detail}`;
    console.error(line);
    writeToFile('ERROR', `${message}${detail}`);
    if (err && err.stack) writeToFile('STACK', err.stack);
  },
  success(message) {
    const line = `[${timestamp()}] [OK]    ${message}`;
    console.log(line);
    writeToFile('OK   ', message);
  },
};

module.exports = logger;
