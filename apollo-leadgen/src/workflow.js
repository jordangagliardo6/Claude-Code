/**
 * The actual lead-gen run: search Apollo across every configured city,
 * normalize + rank + dedupe the results against the sheet, and append up
 * to maxLeadsPerRun new rows.
 */

const config = require('../config');
const apollo = require('./apolloClient');
const { toLead, rankAndDedupe } = require('./leads');
const sheetsClient = require('./googleSheetsClient');
const { logError, sendAlert } = require('./notify');

function buildRow(lead) {
  const dateAdded = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return [
    dateAdded,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    '', // Notes — left blank
  ];
}

async function searchAllCities() {
  const rawLeads = [];

  for (const city of config.cities) {
    try {
      const people = await apollo.searchPeople({
        city,
        state: config.state,
        titles: config.titlesByPriority,
        industryKeywords: config.industryKeywords,
        employeeRanges: config.employeeRanges,
        perPage: config.apolloResultsPerPage,
      });

      for (const person of people) {
        rawLeads.push(toLead(person, city));
      }
    } catch (err) {
      // One city failing shouldn't kill the whole run — log it and keep going.
      logError(`Apollo search for "${city}"`, err);
    }
  }

  return rawLeads;
}

async function runWorkflow() {
  console.log(`[${new Date().toISOString()}] Starting Apollo lead gen run...`);

  let rawLeads;
  try {
    rawLeads = await searchAllCities();
  } catch (err) {
    await sendAlert('Apollo search failed', `The Apollo search step failed entirely: ${err.message}`);
    return;
  }

  if (rawLeads.length === 0) {
    await sendAlert(
      'No leads found',
      'Apollo returned zero results across all configured cities/filters this run. Check your Apollo API key, quota, and filters in config.js.'
    );
    return;
  }

  let sheets;
  let existingBusinessNames;
  try {
    sheets = sheetsClient.getSheetsClient();
    existingBusinessNames = await sheetsClient.getExistingBusinessNames(sheets, config.sheet.tabName);
  } catch (err) {
    await sendAlert('Google Sheets read failed', `Could not read the existing sheet to check for duplicates: ${err.message}`);
    return;
  }

  const newLeads = rankAndDedupe(rawLeads, {
    titlesByPriority: config.titlesByPriority,
    existingBusinessNames,
    maxLeads: config.maxLeadsPerRun,
  });

  if (newLeads.length === 0) {
    console.log('No new leads after filtering duplicates / missing phone numbers. Nothing to write.');
    return;
  }

  const rows = newLeads.map(buildRow);

  try {
    await sheetsClient.appendLeadRows(sheets, config.sheet.tabName, rows);
  } catch (err) {
    await sendAlert('Google Sheets write failed', `Found ${rows.length} new leads but failed to write them to the sheet: ${err.message}`);
    return;
  }

  console.log(`Added ${rows.length} new lead(s) to "${config.sheet.tabName}".`);
}

module.exports = { runWorkflow };
