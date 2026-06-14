const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state', 'search-state.json');

const DEFAULT_STATE = {
  lastPage: 1,        // Apollo search page to start from on the next run
  totalAdded: 0,      // Cumulative leads added across all runs
  lastRunAt: null,    // ISO timestamp of the last successful run
  lastRunAdded: 0     // Leads added in the most recent run
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    }
  } catch (_) {}
  return { ...DEFAULT_STATE };
}

function saveState(updates) {
  const current = loadState();
  const next = { ...current, ...updates };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

module.exports = { loadState, saveState };
