'use strict';

// Prefixes every log line with a UTC timestamp and a level tag.
// Drop-in replacement for console.log/warn/error — no dependencies required.

const timestamp = () => new Date().toISOString();

const logger = {
  info(msg, ...args) {
    console.log(`[${timestamp()}] [INFO]  ${msg}`, ...args);
  },
  warn(msg, ...args) {
    console.warn(`[${timestamp()}] [WARN]  ${msg}`, ...args);
  },
  error(msg, ...args) {
    console.error(`[${timestamp()}] [ERROR] ${msg}`, ...args);
  },
  success(msg, ...args) {
    console.log(`[${timestamp()}] [OK]    ${msg}`, ...args);
  },
};

module.exports = logger;
