const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level.toUpperCase().padEnd(5)}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/workflow.log'),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/errors.log'),
      level: 'error',
      maxsize: 2 * 1024 * 1024,
      maxFiles: 3,
      tailable: true
    })
  ]
});

module.exports = logger;
