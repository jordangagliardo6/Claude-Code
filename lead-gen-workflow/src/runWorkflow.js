// runWorkflow.js
//
// Orchestrates one full run of the lead-gen workflow:
//
//   1. Search Apollo across every configured city.
//   2. Collapse results down to one best contact per company (highest
//      priority job title wins), excluding contacts with no phone number.
//   3. Skip any business already present in the Google Sheet.
//   4. Enrich phone numbers (capped at maxLeadsPerRun) and append the new
//      rows to the sheet.
//   5. Alert (console + optional email) if Apollo returned nothing or the
//      sheet write failed, so the user knows to check it manually.

const config = require('../config');
const logger = require('./logger');
const { sendAlert } = require('./notify');
const apollo = require('./apolloClient');
const sheet = require('./googleSheets');

// Picks the single best contact per company: the one whose title is
// highest in config.jobTitlePriority. Ties keep whichever was seen first.
function pickBestContactPerCompany(people) {
  const byCompany = new Map();

  for (const person of people) {
    const companyName = person.organization?.name;
    if (!companyName) continue;

    const titleRank = config.jobTitlePriority.findIndex(
      (t) => (person.title || '').toLowerCase().includes(t.toLowerCase())
    );
    if (titleRank === -1) continue; // title doesn't match our priority list at all

    const existing = byCompany.get(companyName);
    if (!existing || titleRank < existing._titleRank) {
      byCompany.set(companyName, { ...person, _titleRank: titleRank });
    }
  }

  return [...byCompany.values()];
}

// Southwest Michigan zip "bias": candidates whose organization postal code
// starts with one of our target prefixes are sorted first, without hard
// excluding anyone outside that range (per the "bias toward" requirement).
function sortByZipBias(people) {
  const isInZipBias = (p) => {
    const zip = p.organization?.postal_code || '';
    return config.swMichiganZipPrefixes.some((prefix) => zip.startsWith(prefix));
  };
  return [...people].sort((a, b) => Number(isInZipBias(b)) - Number(isInZipBias(a)));
}

function buildRow({ company, firstName, lastName, phone, city, website }) {
  const fieldValues = {
    'Date Added': new Date().toISOString().slice(0, 10),
    'Business Name': company,
    'Owner First Name': firstName || '',
    'Owner Last Name': lastName || '',
    'Phone Number': phone,
    City: city || '',
    Website: website || '',
    Called: '',
    Notes: '',
  };
  return config.sheetColumns.map((col) => fieldValues[col] ?? '');
}

async function runWorkflow() {
  logger.info('Lead gen workflow run starting.');

  let rawPeople;
  try {
    rawPeople = await apollo.searchLeads();
  } catch (err) {
    await sendAlert('Apollo search failed', err.message);
    return;
  }

  if (rawPeople.length === 0) {
    await sendAlert('Apollo returned no results', 'No leads matched the configured filters across all cities this run.');
    return;
  }

  const candidates = sortByZipBias(pickBestContactPerCompany(rawPeople));

  let existingNames;
  try {
    existingNames = await sheet.getExistingBusinessNames();
  } catch (err) {
    await sendAlert('Google Sheets read failed', err.message);
    return;
  }

  const newCandidates = candidates.filter(
    (p) => !existingNames.has((p.organization?.name || '').trim().toLowerCase())
  );

  logger.info(
    `${rawPeople.length} people found -> ${candidates.length} unique companies -> ${newCandidates.length} not already in the sheet.`
  );

  const rows = [];
  for (const person of newCandidates) {
    if (rows.length >= config.maxLeadsPerRun) break;

    const phone = await apollo.enrichPhoneNumber(person);
    if (!phone) {
      logger.warn(`Skipping "${person.organization?.name}" -- no phone number found.`);
      continue;
    }

    rows.push(
      buildRow({
        company: person.organization?.name,
        firstName: person.first_name,
        lastName: person.last_name,
        phone,
        city: person._searchCity,
        website: person.organization?.website_url,
      })
    );
  }

  if (rows.length === 0) {
    await sendAlert(
      'No new leads to add',
      'Apollo returned results, but every candidate was either a duplicate already in the sheet or had no phone number.'
    );
    return;
  }

  try {
    await sheet.appendLeads(rows);
  } catch (err) {
    await sendAlert('Google Sheets write failed', err.message);
    return;
  }

  logger.info(`Lead gen workflow run complete. ${rows.length} new lead(s) added.`);
}

module.exports = { runWorkflow, pickBestContactPerCompany, sortByZipBias, buildRow };
