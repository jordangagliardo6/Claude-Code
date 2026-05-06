'use strict';

// Lightweight timestamped logger — replace with winston/pino if you need file rotation.
const pad = n => String(n).padStart(2, '0');

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const logger = {
  info:  (...args) => console.log(`[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG === 'true') console.log(`[${timestamp()}] DEBUG`, ...args);
  },
};

module.exports = logger;
