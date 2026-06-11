const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeLine(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);

  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logsDir, `${date}.log`);
  fs.appendFileSync(logFile, line + '\n');
}

module.exports = {
  info:  (msg) => writeLine('INFO ', msg),
  warn:  (msg) => writeLine('WARN ', msg),
  error: (msg) => writeLine('ERROR', msg),
};
