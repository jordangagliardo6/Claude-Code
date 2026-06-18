// One full run of the lead generation workflow:
//   search Apollo -> rank by title priority -> dedupe against the sheet
//   -> enrich phone numbers -> drop anyone with no phone -> append new rows.
//
// Run manually with: npm run run-once
// Run on a schedule with: npm start (see scheduler.js)

const config = require('../config');
const apollo = require('./apolloClient');
const sheets = require('./googleSheets');
const notify = require('./notify');

function todayEastern() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function titlePriorityRank(title) {
  const idx = config.jobTitlesByPriority.findIndex((t) =>
    (title || '').toLowerCase().includes(t.toLowerCase())
  );
  return idx === -1 ? config.jobTitlesByPriority.length : idx;
}

function cityFromLocationLabel(label) {
  return label.split(',')[0].trim();
}

// Searches every configured city and returns a flat array of { person, city }.
async function searchAllCities() {
  const locations = [...config.targetCities];
  if (config.searchStatewideFallback) locations.push(config.stateFallbackLocation);

  const results = [];
  for (const location of locations) {
    const people = await apollo.searchPeople(location);
    for (const person of people) {
      results.push({ person, city: cityFromLocationLabel(location) });
    }
  }
  return results;
}

// Keeps only the single highest-priority contact per company, sorted best
// title first so we enrich/insert the best candidates before lesser ones.
function rankAndDedupeByCompany(rawResults) {
  const bestByCompany = new Map();

  for (const { person, city } of rawResults) {
    const companyKey = ((person.organization && person.organization.name) || '')
      .trim()
      .toLowerCase();
    if (!companyKey) continue;

    const rank = titlePriorityRank(person.title);
    const existing = bestByCompany.get(companyKey);
    if (!existing || rank < existing.rank) {
      bestByCompany.set(companyKey, { person, city, rank });
    }
  }

  return [...bestByCompany.values()].sort((a, b) => a.rank - b.rank);
}

function buildRow({ person, city, phone }) {
  const row = {
    'Date Added': todayEastern(),
    'Business Name': (person.organization && person.organization.name) || '',
    'Owner First Name': person.first_name || '',
    'Owner Last Name': person.last_name || '',
    'Phone Number': phone,
    City: city,
    Website: (person.organization && person.organization.website_url) || '',
    Called: '',
    Notes: '',
  };
  // Output in the exact column order from config so reordering columns there
  // is the only change needed to change the sheet layout.
  return config.sheetColumns.map((col) => row[col]);
}

async function run() {
  notify.logInfo('Starting HVAC lead generation run...');

  const rawResults = await searchAllCities();
  if (rawResults.length === 0) {
    throw new apollo.ApolloError(
      'Apollo returned zero results for the configured cities/filters.'
    );
  }
  notify.logInfo(`Apollo returned ${rawResults.length} raw candidates.`);

  const candidates = rankAndDedupeByCompany(rawResults);

  const existingBusinessNames = await sheets.getExistingBusinessNames();
  const newCandidates = candidates.filter(
    (c) => !existingBusinessNames.has((c.person.organization.name || '').trim().toLowerCase())
  );
  notify.logInfo(
    `${candidates.length} unique companies found, ${newCandidates.length} not already in the sheet.`
  );

  // Enrich phone numbers one candidate at a time (each call costs an Apollo
  // credit) until we hit the daily cap or run out of candidates. Any
  // candidate with no phone number is skipped, per the "no phone = exclude"
  // requirement.
  const acceptedRows = [];
  for (const candidate of newCandidates) {
    if (acceptedRows.length >= config.maxNewLeadsPerRun) break;

    const phone = await apollo.enrichPhone(candidate.person);
    if (!phone) continue;

    acceptedRows.push(buildRow({ ...candidate, phone }));
  }

  if (acceptedRows.length === 0) {
    notify.logInfo('No new leads with a phone number to add this run.');
    return;
  }

  await sheets.appendLeads(acceptedRows);
  notify.logInfo(`Appended ${acceptedRows.length} new leads to the sheet.`);
}

async function runSafely() {
  try {
    await run();
  } catch (error) {
    await notify.alert('lead generation run', error);
  }
}

if (require.main === module) {
  runSafely();
}

module.exports = { run, runSafely };
