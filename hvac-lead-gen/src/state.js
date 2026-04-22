// Persists run state so each scheduled run advances through Apollo's paginated
// results rather than pulling the same page 1 every morning.
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../data/state.json');

const DEFAULT_STATE = {
  currentPage: 1,
  totalLeadsPulled: 0,
  lastRun: null,
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    }
  } catch {
    // Corrupted state — start fresh
  }
  return { ...DEFAULT_STATE };
}

function saveState(updates) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const current = loadState();
  const next = { ...current, ...updates, lastRun: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { loadState, saveState };
