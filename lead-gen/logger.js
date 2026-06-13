'use strict';

function timestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

module.exports = {
  info: (...args) => console.log(`[${timestamp()}] INFO:`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] WARN:`, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR:`, ...args),
  success: (...args) => console.log(`[${timestamp()}] ✓`, ...args),
};
