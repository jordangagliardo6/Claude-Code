const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [
    // Always print to console
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) =>
          `[${timestamp}] ${level}: ${message}`
        )
      ),
    }),
    // Persist all logs to file
    new transports.File({
      filename: path.join(logsDir, 'lead-gen.log'),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
      tailable: true,
    }),
    // Errors get their own file for easy scanning
    new transports.File({
      filename: path.join(logsDir, 'errors.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

// Sends a prominent alert to console (and logs it) when something goes wrong
logger.alert = (message) => {
  const border = '='.repeat(60);
  logger.error(`\n${border}\n  ACTION REQUIRED: ${message}\n${border}`);
};

module.exports = logger;
