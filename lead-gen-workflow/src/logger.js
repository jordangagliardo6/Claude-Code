const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    // Console output — always visible
    new winston.transports.Console(),
    // Persistent log file — rotates daily via filename date
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/workflow.log'),
      maxsize: 5 * 1024 * 1024, // 5MB max per file
      maxFiles: 7,              // Keep 7 days of logs
    }),
    // Separate error log so failures are easy to spot
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/errors.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 7,
    }),
  ],
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

module.exports = logger;
