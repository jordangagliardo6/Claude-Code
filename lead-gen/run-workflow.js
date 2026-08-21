/**
 * Core workflow logic — searches Apollo, deduplicates against the sheet,
 * and appends up to MAX_LEADS_PER_RUN new leads.
 *
 * Called by both workflow.js (on the cron schedule) and run-now.js (manually).
 */

require('dotenv').config();
const { searchHvacLeads, normalizeLead, extractBestPhone } = require('./apollo-client');
const { buildSheetsClient, getExistingBusinessNames, appendLeadRows, ensureHeaderRow, todayFormatted } = require('./sheets-client');
const { log, sendErrorNotification } = require('./logger');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus';
const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
// We fetch more from Apollo than we need so deduplication still yields MAX_LEADS
const APOLLO_FETCH_SIZE = Math.min(MAX_LEADS * 3, 100);

async function runWorkflow() {
  log.info('─── HVAC Lead Gen Run Starting ───────────────────────────────');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    const msg = 'APOLLO_API_KEY is not set. Add it to your .env file.';
    log.error(msg);
    await sendErrorNotification('Missing APOLLO_API_KEY', msg);
    return { added: 0, error: msg };
  }

  // ── Step 1: Read existing business names from the sheet ──────────────────
  let sheets, existingNames;
  try {
    sheets = buildSheetsClient();
    await ensureHeaderRow(sheets, SPREADSHEET_ID);
    existingNames = await getExistingBusinessNames(sheets, SPREADSHEET_ID);
    log.info(`Sheet already contains ${existingNames.size} unique businesses.`);
  } catch (err) {
    const msg = `Failed to read Google Sheet: ${err.message}`;
    log.error(msg);
    await sendErrorNotification('Google Sheets Read Failure', `${msg}\n\nFull error:\n${err.stack}`);
    return { added: 0, error: msg };
  }

  // ── Step 2: Search Apollo for leads ─────────────────────────────────────
  let apolloResults;
  try {
    log.info(`Searching Apollo for HVAC leads (fetching up to ${APOLLO_FETCH_SIZE})...`);
    apolloResults = await searchHvacLeads(apiKey, 1, APOLLO_FETCH_SIZE);
    log.info(`Apollo returned ${apolloResults.people.length} people (${apolloResults.totalEntries} total available).`);
  } catch (err) {
    const isApiPlan = err.response?.data?.error_code === 'API_INACCESSIBLE';
    const msg = isApiPlan
      ? 'Apollo API returned API_INACCESSIBLE — the people search endpoint requires a paid Apollo plan. Upgrade at https://www.apollo.io/pricing'
      : `Apollo search failed: ${err.message}`;
    log.error(msg);
    await sendErrorNotification('Apollo Search Failure', `${msg}\n\n${err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.stack}`);
    return { added: 0, error: msg };
  }

  if (!apolloResults.people.length) {
    const msg = 'Apollo returned 0 results. Check your filters or API plan.';
    log.warn(msg);
    await sendErrorNotification('Apollo: No Results', msg);
    return { added: 0, error: msg };
  }

  // ── Step 3: Normalize, filter, and deduplicate ──────────────────────────
  const newLeads = [];

  for (const person of apolloResults.people) {
    if (newLeads.length >= MAX_LEADS) break;

    const lead = normalizeLead(person);
    if (!lead) continue;

    // Skip if no phone number (per the requirements)
    if (!lead.phone) continue;

    // Skip if business already in the sheet (case-insensitive)
    const nameKey = lead.businessName.toLowerCase().trim();
    if (existingNames.has(nameKey)) {
      log.info(`  SKIP (duplicate): ${lead.businessName}`);
      continue;
    }

    newLeads.push(lead);
    existingNames.add(nameKey); // Prevent duplicate within this same run
    log.info(`  + ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone} | ${lead.city}`);
  }

  log.info(`Found ${newLeads.length} new, unique leads with phone numbers.`);

  if (!newLeads.length) {
    log.warn('No new leads to add — all results were duplicates or missing phone numbers.');
    return { added: 0, error: null };
  }

  // ── Step 4: Append new leads to the sheet ────────────────────────────────
  const today = todayFormatted();
  const rows = newLeads.map((lead) => [
    today,             // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called (blank)
    '',                // I: Notes (blank)
  ]);

  try {
    await appendLeadRows(sheets, SPREADSHEET_ID, rows);
    log.success(`Appended ${rows.length} new lead(s) to the sheet.`);
  } catch (err) {
    const msg = `Failed to write to Google Sheet: ${err.message}`;
    log.error(msg);
    await sendErrorNotification('Google Sheets Write Failure', `${msg}\n\nLeads that were NOT saved:\n${JSON.stringify(newLeads, null, 2)}\n\nFull error:\n${err.stack}`);
    return { added: 0, error: msg };
  }

  log.info('─── Run Complete ─────────────────────────────────────────────\n');
  return { added: rows.length, error: null };
}

module.exports = { runWorkflow };
