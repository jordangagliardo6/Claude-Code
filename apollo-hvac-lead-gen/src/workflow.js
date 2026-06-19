// Orchestrates a single end-to-end run: search Apollo -> filter -> dedupe
// against the sheet -> reveal phone numbers -> append new leads.
const config = require('../config');
const apollo = require('./apolloClient');
const sheets = require('./googleSheets');
const { notifyError } = require('./notify');

function leadCity(person) {
  return (person.organization?.city || person.city || '').trim();
}

function leadZip(person) {
  return (person.organization?.postal_code || person.postal_code || '').trim();
}

function matchesTargetArea(person) {
  const city = leadCity(person).toLowerCase();
  if (city && config.targetCities.some((c) => city.startsWith(c.toLowerCase()))) {
    return true;
  }
  const zip = leadZip(person);
  if (zip && config.targetZipPrefixes.some((prefix) => zip.startsWith(prefix))) {
    return true;
  }
  return false;
}

function titleRank(title) {
  if (!title) return config.titlePriority.length;
  const idx = config.titlePriority.findIndex((t) => title.toLowerCase().includes(t.toLowerCase()));
  return idx === -1 ? config.titlePriority.length : idx;
}

function splitName(person) {
  if (person.first_name || person.last_name) {
    return [person.first_name || '', person.last_name || ''];
  }
  const [first, ...rest] = (person.name || '').split(' ');
  return [first || '', rest.join(' ')];
}

async function runWorkflow() {
  console.log(`[${new Date().toISOString()}] Starting Apollo -> Google Sheets lead-gen run`);

  let sheetsClient;
  let existingNames;
  try {
    sheetsClient = sheets.getClient();
    existingNames = await sheets.getExistingBusinessNames(sheetsClient);
  } catch (err) {
    await notifyError('Google Sheets connection failed', err.message);
    return;
  }

  let people = [];
  try {
    // Pull a few pages — most results get filtered out by city/dupe/phone
    // checks, so we over-fetch relative to maxNewLeadsPerRun.
    for (let page = 1; page <= 5 && people.length < config.maxNewLeadsPerRun * 6; page += 1) {
      const batch = await apollo.searchLeads({ page, perPage: 50 });
      if (batch.length === 0) break;
      people = people.concat(batch);
    }
  } catch (err) {
    await notifyError('Apollo search failed', err.message);
    return;
  }

  if (people.length === 0) {
    await notifyError(
      'Apollo returned no results',
      'No leads matched the current filters. Check config.js (cities/industries/employee range) or your Apollo plan/credit balance.'
    );
    return;
  }

  // Prefer Owner > President > Founder > Co-Founder > General Manager when
  // a company has multiple matching contacts.
  people.sort((a, b) => titleRank(a.title) - titleRank(b.title));

  const seenBusinessNames = new Set(existingNames);
  const newRows = [];
  let skippedNoPhone = 0;

  for (const person of people) {
    if (newRows.length >= config.maxNewLeadsPerRun) break;

    const businessName = (person.organization?.name || '').trim();
    if (!businessName) continue;

    const dedupeKey = businessName.toLowerCase();
    if (seenBusinessNames.has(dedupeKey)) continue;

    if (!matchesTargetArea(person)) continue;

    let phone = null;
    try {
      const enriched = await apollo.enrichPhone(person);
      phone = enriched.directPhone || enriched.orgPhone;
    } catch (err) {
      console.error(`Phone enrichment failed for ${businessName}: ${err.message}`);
      phone = person.organization?.phone || null;
    }

    if (!phone) {
      skippedNoPhone += 1;
      continue;
    }

    const [firstName, lastName] = splitName(person);

    newRows.push([
      new Date().toISOString().slice(0, 10), // Date Added
      businessName,
      firstName,
      lastName,
      phone,
      leadCity(person),
      person.organization?.website_url || '',
      '', // Called
      '', // Notes
    ]);

    // Guard against duplicates within the same run (two contacts at the
    // same company), not just duplicates already in the sheet.
    seenBusinessNames.add(dedupeKey);
  }

  if (newRows.length === 0) {
    console.log('No new qualifying leads this run (all duplicates, no phone, or outside target cities).');
    return;
  }

  try {
    await sheets.appendLeads(sheetsClient, newRows);
  } catch (err) {
    await notifyError('Google Sheets write failed', err.message);
    return;
  }

  console.log(`Added ${newRows.length} new lead(s). Skipped ${skippedNoPhone} for missing phone numbers.`);
}

module.exports = { runWorkflow };
