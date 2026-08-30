'use strict';

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info:  (...args) => console.log( `[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn( `[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
  success: (...args) => console.log(`[${timestamp()}] OK   `, ...args),
};

module.exports = logger;
