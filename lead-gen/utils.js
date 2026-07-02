'use strict';

// Strips punctuation/case so "ABC Heating & Cooling" === "abc heating cooling"
function normalizeBusinessName(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

module.exports = { normalizeBusinessName };
