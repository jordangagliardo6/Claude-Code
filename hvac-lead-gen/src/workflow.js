'use strict';

const { searchHVACLeads, enrichPerson, buildLead } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert, logSuccess } = require('./notify');

/**
 * Execute one full lead-generation run:
 *   1. Search Apollo for HVAC contacts in SW Michigan
 *   2. Enrich each result to obtain a phone number
 *   3. Skip contacts with no phone
 *   4. Append new leads to Google Sheets (duplicate-safe)
 *
 * @param {number} maxLeads - cap on new leads to add (per-run limit)
 */
async function runLeadGen(maxLeads) {
  const max = maxLeads || parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

  console.log(`\n[workflow] Starting run — target: up to ${max} new leads`);

  // ── 1. Search ───────────────────────────────────────────────────────────────
  let rawPeople;
  try {
    // Request more than max to account for contacts that will be filtered
    // (no phone, duplicates). We'll stop enriching once we hit max.
    rawPeople = await searchHVACLeads(Math.min(max * 3, 100));
    console.log(`[workflow] Apollo returned ${rawPeople.length} candidate contacts`);
  } catch (err) {
    const msg = buildErrorMessage('Apollo search failed', err);
    await sendAlert('Apollo search failed', msg);
    throw err;
  }

  if (!rawPeople || rawPeople.length === 0) {
    await sendAlert(
      'Apollo returned 0 results',
      'No HVAC contacts found for SW Michigan on this run. ' +
      'This may be normal if the Apollo database has no new records matching the filters. ' +
      'Check your filters in src/apollo.js if this persists.'
    );
    return { added: 0, skipped: 0, searched: 0 };
  }

  // ── 2. Enrich (reveal phone numbers) ────────────────────────────────────────
  const leads = [];
  let enriched = 0;

  for (const person of rawPeople) {
    if (leads.length >= max) break; // stop enriching once we have enough

    try {
      console.log(`[workflow] Enriching: ${person.first_name} ${person.last_name} @ ${person.organization_name || '?'}`);
      const enrichedPerson = await enrichPerson(person.id);
      enriched++;

      const lead = buildLead(person, enrichedPerson);
      if (!lead) {
        console.log(`[workflow]   → skipped (no phone number)`);
        continue;
      }

      leads.push(lead);
      console.log(`[workflow]   → ${lead.phone} | ${lead.city}`);

      // Small delay to be respectful of Apollo's rate limits
      await sleep(500);
    } catch (err) {
      console.warn(`[workflow]   → enrichment failed for ${person.id}: ${err.message}`);
    }
  }

  console.log(`[workflow] Enriched ${enriched} contacts, built ${leads.length} leads with phone numbers`);

  // ── 3. Write to Google Sheets ───────────────────────────────────────────────
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = buildErrorMessage('Google Sheets write failed', err);
    await sendAlert('Google Sheets write failed', msg);
    throw err;
  }

  logSuccess(result.added, result.skipped, rawPeople.length);
  return { added: result.added, skipped: result.skipped, searched: rawPeople.length };
}

function buildErrorMessage(label, err) {
  return [
    `${label}: ${err.message}`,
    err.response?.data ? `API response: ${JSON.stringify(err.response.data, null, 2)}` : '',
    `Stack: ${err.stack}`,
  ].filter(Boolean).join('\n\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runLeadGen };
