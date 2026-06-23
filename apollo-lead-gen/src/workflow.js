// ---------------------------------------------------------------------------
// Orchestrates a single end-to-end run:
//   1. Search Apollo for matching people
//   2. Resolve a phone number for each candidate, drop any without one
//   3. Sort by job-title priority, dedupe against the sheet, cap at
//      maxLeadsPerRun
//   4. Append new rows to Google Sheets
//   5. Report a summary; alert on hard failures or zero Apollo results
// ---------------------------------------------------------------------------

const config = require('../config');
const apollo = require('./apolloClient');
const sheets = require('./googleSheetsClient');
const { notifyError, notifyInfo } = require('./notifier');

function titlePriorityRank(person) {
  const title = (person.title || '').toLowerCase();
  const index = config.targetTitles.findIndex((t) => title.includes(t.toLowerCase()));
  return index === -1 ? config.targetTitles.length : index;
}

function todayEastern() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
}

function toRow(person, phoneNumber) {
  return [
    todayEastern(),
    person.organization?.name || person.organization_name || '',
    person.first_name || '',
    person.last_name || '',
    phoneNumber,
    person.city || person.organization?.city || '',
    person.organization?.website_url || '',
    '', // Called — left blank for manual tracking
    '', // Notes — left blank for manual tracking
  ];
}

async function runWorkflowOnce() {
  notifyInfo('Starting Apollo lead gen run...');

  // --- 1. Search Apollo ---------------------------------------------------
  let candidates;
  try {
    candidates = await apollo.searchPeople();
  } catch (err) {
    await notifyError('Apollo search request failed', err.response?.data || err);
    throw err;
  }

  if (!candidates || candidates.length === 0) {
    await notifyError(
      'Apollo returned zero results',
      'Search ran successfully but matched no people. Check filters in config.js ' +
        '(industries, cities, employee range) — they may be too narrow, or Apollo credits may be exhausted.'
    );
    return { added: 0, reason: 'no_apollo_results' };
  }
  notifyInfo(`Apollo returned ${candidates.length} candidate(s) before phone/dedupe filtering.`);

  // --- 2. Resolve phone numbers, drop anyone without one -------------------
  const withPhones = [];
  for (const person of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const phoneNumber = await apollo.resolvePhoneNumber(person);
    if (phoneNumber) {
      withPhones.push({ person, phoneNumber });
    }
  }
  notifyInfo(`${withPhones.length} candidate(s) have a usable phone number.`);

  // --- 3. Prioritize by title, dedupe, cap at maxLeadsPerRun ---------------
  withPhones.sort((a, b) => titlePriorityRank(a.person) - titlePriorityRank(b.person));

  let existingNames;
  try {
    existingNames = await sheets.getExistingBusinessNames();
  } catch (err) {
    await notifyError('Failed to read existing leads from Google Sheet', err);
    throw err;
  }

  const newRows = [];
  const seenThisRun = new Set();
  for (const { person, phoneNumber } of withPhones) {
    const businessName = person.organization?.name || person.organization_name || '';
    const key = businessName.trim().toLowerCase();
    if (!key || existingNames.has(key) || seenThisRun.has(key)) continue;

    seenThisRun.add(key);
    newRows.push(toRow(person, phoneNumber));

    if (newRows.length >= config.maxLeadsPerRun) break;
  }

  if (newRows.length === 0) {
    notifyInfo('No new (non-duplicate) leads to add this run.');
    return { added: 0, reason: 'all_duplicates' };
  }

  // --- 4. Append to sheet ---------------------------------------------------
  try {
    await sheets.appendLeads(newRows);
  } catch (err) {
    await notifyError('Failed to write new leads to Google Sheet', err);
    throw err;
  }

  notifyInfo(`Added ${newRows.length} new lead(s) to "${config.sheetTabName}".`);
  return { added: newRows.length };
}

module.exports = { runWorkflowOnce };
