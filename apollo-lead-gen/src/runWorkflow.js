// ---------------------------------------------------------------------------
// Main orchestration: search Apollo (title-by-title, in priority order),
// enrich each candidate for a phone number, skip duplicates/no-phone leads,
// and append up to maxNewLeadsPerRun new rows to the Google Sheet.
// ---------------------------------------------------------------------------
require('dotenv').config();
const config = require('../config');
const apollo = require('./apolloClient');
const sheetsClient = require('./googleSheetsClient');
const logger = require('./logger');

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function splitName(fullName, firstNameField, lastNameField) {
  if (firstNameField || lastNameField) return { first: firstNameField || '', last: lastNameField || '' };
  const parts = (fullName || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

async function run() {
  logger.info('Starting Apollo lead generation run.');

  if (!config.sheet.spreadsheetId) {
    await logger.alert('Missing configuration', 'GOOGLE_SHEET_ID is not set in .env — cannot continue.');
    return;
  }

  const sheets = sheetsClient.getSheetsClient();

  // --- Step 1: connect to the sheet, validate headers, load existing names ---
  let existingNames;
  try {
    await sheetsClient.ensureHeaderRow(sheets, config.sheet.spreadsheetId, config.sheet.tabName, config.sheet.columns);
    existingNames = await sheetsClient.getExistingBusinessNames(
      sheets,
      config.sheet.spreadsheetId,
      config.sheet.tabName,
      config.sheet.columns
    );
    logger.info(`Loaded ${existingNames.size} existing business name(s) from the sheet for de-duplication.`);
  } catch (err) {
    await logger.alert('Google Sheets read failed', err.message);
    return;
  }

  // --- Step 2: search Apollo, title by title, city set baked into each query ---
  const newRows = [];
  const seenInThisRun = new Set(); // guards against the same company turning up under multiple titles
  let apolloReturnedAnything = false;

  titleLoop: for (const title of config.titlesByPriority) {
    for (let page = 1; page <= 5; page += 1) {
      let result;
      try {
        result = await apollo.searchPeopleByTitle({
          title,
          cities: config.cities,
          state: config.state,
          industryKeywords: config.industryKeywords,
          employeeRange: config.employeeRange,
          page,
          perPage: config.resultsPerPage,
        });
      } catch (err) {
        await logger.alert('Apollo search failed', `Title "${title}", page ${page}: ${err.message}`);
        return;
      }

      if (result.people.length > 0) apolloReturnedAnything = true;

      for (const person of result.people) {
        if (newRows.length >= config.maxNewLeadsPerRun) break titleLoop;

        const businessName = (person.organization && person.organization.name) || '';
        const key = businessName.trim().toLowerCase();
        if (!key) continue;
        if (existingNames.has(key) || seenInThisRun.has(key)) continue; // duplicate, skip per spec

        let phone;
        try {
          phone = await apollo.enrichPhone(person);
        } catch (err) {
          logger.error(`Phone enrichment failed for ${person.name || person.id}: ${err.message}`);
          continue;
        }
        if (!phone) continue; // no phone number on file -- exclude per spec

        const { first, last } = splitName(person.name, person.first_name, person.last_name);
        const city = (person.organization && person.organization.city) || person.city || '';
        const website = (person.organization && person.organization.website_url) || '';

        newRows.push({
          row: [todayDateString(), businessName, first, last, phone, city, website, '', ''],
          key,
        });
        seenInThisRun.add(key);
      }

      if (newRows.length >= config.maxNewLeadsPerRun) break titleLoop;
      if (page >= result.totalPages) break; // no more pages for this title
    }
  }

  // --- Step 3: handle the "Apollo returned nothing at all" case ---
  if (!apolloReturnedAnything) {
    await logger.alert(
      'Apollo returned no results',
      'No companies/people matched the configured filters (industry, MI cities, 1-25 employees, target titles). Check the Apollo dashboard for API/credit issues, or the filters in config.js may be too narrow.'
    );
    return;
  }

  if (newRows.length === 0) {
    logger.info('Apollo returned results, but all were duplicates or had no phone number. Nothing new to add today.');
    return;
  }

  // --- Step 4: append to the sheet ---
  try {
    await sheetsClient.appendLeads(
      sheets,
      config.sheet.spreadsheetId,
      config.sheet.tabName,
      newRows.map((r) => r.row)
    );
  } catch (err) {
    await logger.alert('Google Sheets write failed', `Found ${newRows.length} new lead(s) but could not append them: ${err.message}`);
    return;
  }

  logger.info(`Done. Appended ${newRows.length} new lead(s) to "${config.sheet.tabName}".`);
}

// Allow `node src/runWorkflow.js` for a manual one-off run.
if (require.main === module) {
  run().catch(async (err) => {
    await logger.alert('Unexpected workflow error', err.stack || err.message);
    process.exit(1);
  });
}

module.exports = { run };
