'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readCsv, failUnless, fixtureAuthority, labelsReviewed, metric, getUnique, sha256 } = require('./score-lib.cjs');

const PILOT = ['STD-01', 'STD-02', 'STD-03', 'STD-05', 'STD-08', 'STD-09', 'STD-10', 'STD-12', 'STD-18', 'STD-21'];
const OUTCOMES = new Set(['not_attempted', 'fresh_success', 'cache_hit', 'quota_failure', 'provider_failure', 'transport_failure', 'invalid_response']);
const SIGNALS = new Set(['present', 'absent', 'unassessable']);
const KEY_PATH = path.join(__dirname, 'ai-checklist.csv');
const MANIFEST_PATH = path.join(__dirname, 'manifest.csv');

function reviewed(row, context) {
  failUnless(row && row.reviewer_id && !Number.isNaN(Date.parse(row.reviewed_at)),
    `${context}: independent human adjudication requires reviewer_id and valid reviewed_at`);
}

function safeLocalEvidence(reportPath, inputPath) {
  failUnless(typeof reportPath === 'string' && reportPath.length > 0, 'Fresh report requires report_path');
  const absolute = path.resolve(path.dirname(inputPath), reportPath);
  failUnless(fs.existsSync(absolute) && fs.statSync(absolute).isFile(),
    `Fresh report evidence missing: ${reportPath}`);
  return absolute;
}

function score(record, options = {}) {
  const { templateHash, fixtures } = fixtureAuthority();
  failUnless(record && record.schema_version === 1 && Array.isArray(record.runs),
    'AI run record must have schema_version=1 and a runs array');
  const checklist = options.checklist ?? readCsv(KEY_PATH);
  const key = getUnique(checklist, 'decision_id', 'AI checklist decision');
  const labelsByFixture = new Map();
  for (const item of key.values()) {
    failUnless(PILOT.includes(item.fixture_id), `Unexpected checklist fixture: ${item.fixture_id}`);
    failUnless(item.expected === 'present' || item.expected === 'absent', `Invalid expected decision: ${item.decision_id}`);
    failUnless(item.criterion && item.authority, `Missing checklist authority: ${item.decision_id}`);
    const items = labelsByFixture.get(item.fixture_id) || [];
    items.push(item);
    labelsByFixture.set(item.fixture_id, items);
  }
  for (const fixture of PILOT) failUnless(labelsByFixture.has(fixture), `Missing pilot checklist fixture: ${fixture}`);
  const manifestReviewed = PILOT.every(id => {
    const item = fixtures.get(id);
    failUnless(item, `Pilot fixture not present in manifest: ${id}`);
    if (item.human_label_review !== 'VERIFIED') return false;
    failUnless(item.human_label_reviewer && !Number.isNaN(Date.parse(item.human_label_reviewed_at)),
      `${id}: verified fixture label requires an independent reviewer and timestamp`);
    return true;
  });
  const checklistReviewed = labelsReviewed(checklist, 'AI checklist');
  const canScoreFresh = manifestReviewed && checklistReviewed;
  const runs = getUnique(record.runs, 'fixture_id', 'AI run fixture');
  for (const id of runs.keys()) failUnless(PILOT.includes(id), `Unplanned AI fixture: ${id}`);
  const tally = Object.fromEntries(Array.from(OUTCOMES, status => [status, 0]));
  let matchingDecisions = 0;
  let adjudicableDecisions = 0;
  let substantiveClaims = 0;
  let tracedClaims = 0;
  let unassessableDecisions = 0;
  const resultRows = [];
  for (const id of PILOT) {
    const run = runs.get(id) || { fixture_id: id, outcome: 'not_attempted' };
    failUnless(OUTCOMES.has(run.outcome), `Invalid outcome for ${id}: ${run.outcome}`);
    tally[run.outcome]++;
    const row = { fixture_id: id, outcome: run.outcome, expected_decisions: labelsByFixture.get(id).length,
      adjudicated: [], substantive_claims: 0, traceable_claims: 0 };
    if (run.outcome === 'not_attempted') {
      failUnless(!run.report_path && !run.decisions && !run.claims, `${id}: not_attempted may not include fabricated report evidence`);
      resultRows.push(row);
      continue;
    }
    failUnless(run.attempted_at && !Number.isNaN(Date.parse(run.attempted_at)), `${id}: missing real attempt timestamp`);
    failUnless(run.fixture_sha256 === fixtures.get(id).sha256, `${id}: attempted fixture hash mismatch`);
    failUnless(run.template_sha256 === templateHash, `${id}: attempted template hash mismatch`);
    failUnless(/^[0-9a-f]{40}$/i.test(run.app_commit || ''), `${id}: missing app commit`);
    if (run.outcome !== 'fresh_success') {
      failUnless(run.reason && typeof run.reason === 'string', `${id}: nonfresh attempt needs explicit reason`);
      failUnless(!run.decisions && !run.claims, `${id}: only fresh successful reports may be scored`);
      resultRows.push({ ...row, reason: run.reason });
      continue;
    }
    failUnless(canScoreFresh, 'Fresh reports cannot be scored before manifest and checklist receive independently verified human labels');
    failUnless(record.frozen_key && record.frozen_key.checklist_sha256 === sha256(KEY_PATH)
      && record.frozen_key.manifest_sha256 === sha256(MANIFEST_PATH)
      && record.frozen_key.template_sha256 === templateHash
      && record.frozen_key.frozen_at && !Number.isNaN(Date.parse(record.frozen_key.frozen_at)),
    `${id}: missing unmodified pre-run checklist/manifest/template key fingerprint`);
    failUnless(Date.parse(record.frozen_key.frozen_at) <= Date.parse(run.attempted_at),
      `${id}: scoring key was frozen after the provider attempt`);
    for (const item of labelsByFixture.get(id)) {
      failUnless(Date.parse(item.reviewed_at) <= Date.parse(record.frozen_key.frozen_at),
        `${id}: checklist answer was verified after key freeze`);
    }
    failUnless(Date.parse(fixtures.get(id).human_label_reviewed_at) <= Date.parse(record.frozen_key.frozen_at),
      `${id}: fixture label was verified after key freeze`);
    failUnless(run.cache_status === 'MISS' && run.provider_request_id && run.provider && run.model && run.prompt_version,
      `${id}: fresh report needs cache MISS and genuine provider/model/request/prompt evidence`);
    const file = safeLocalEvidence(run.report_path, options.inputPath || path.resolve(__dirname, 'ai-run-record.template.json'));
    failUnless(/^[0-9a-f]{64}$/i.test(run.report_sha256 || '') && sha256(file) === run.report_sha256.toLowerCase(),
      `${id}: raw provider report hash mismatch`);
    failUnless(Array.isArray(run.decisions) && Array.isArray(run.claims), `${id}: human decisions and claim inventory required`);
    reviewed(run.claim_inventory_review, `${id} claim inventory`);
    failUnless(run.claim_inventory_review.complete === true && run.claim_inventory_review.report_sha256 === run.report_sha256,
      `${id}: claim inventory must attest complete coverage of the exact raw report hash`);
    const actual = getUnique(run.decisions, 'decision_id', `${id} adjudicated decision`);
    const expected = labelsByFixture.get(id);
    failUnless(actual.size === expected.length, `${id}: expected ${expected.length} checklist decisions, got ${actual.size}`);
    for (const item of expected) {
      const decision = actual.get(item.decision_id);
      failUnless(decision && SIGNALS.has(decision.observed), `${id}: missing adjudication of ${item.decision_id}`);
      reviewed(decision, `${id} ${item.decision_id}`);
      failUnless(decision.evidence_reference && decision.notes, `${id} ${item.decision_id}: cite exact raw-report evidence and notes`);
      const match = decision.observed === item.expected;
      if (decision.observed === 'unassessable') unassessableDecisions++;
      else {
        adjudicableDecisions++;
        if (match) matchingDecisions++;
      }
      row.adjudicated.push({ decision_id: item.decision_id, expected: item.expected, observed: decision.observed,
        matches_expected: decision.observed === 'unassessable' ? null : match, evidence_reference: decision.evidence_reference });
    }
    const claims = getUnique(run.claims, 'claim_id', `${id} substantive claim`);
    for (const claim of claims.values()) {
      failUnless(claim.text && claim.substantive === true, `${id} ${claim.claim_id}: inventory must list each substantive claim separately`);
      failUnless(['pdf', 'official_template', 'deliverable_instructions', 'unsupported'].includes(claim.source_kind),
        `${id} ${claim.claim_id}: invalid claimed authority`);
      failUnless(typeof claim.traceable === 'boolean', `${id} ${claim.claim_id}: traceability must be adjudicated`);
      reviewed(claim, `${id} claim ${claim.claim_id}`);
      failUnless(claim.report_reference && claim.notes, `${id} ${claim.claim_id}: raw-report pointer and adjudication notes required`);
      if (claim.traceable) {
        failUnless(claim.source_kind !== 'unsupported' && claim.source_reference && claim.source_excerpt,
          `${id} ${claim.claim_id}: traced claim needs exact document/authority evidence`);
        if (claim.source_kind === 'official_template') {
          failUnless(id !== 'STD-18', `${id}: no official template mapped in this pilot condition`);
        }
      } else {
        failUnless(claim.source_kind === 'unsupported', `${id} ${claim.claim_id}: unsupported claim must be marked unsupported`);
      }
      substantiveClaims++;
      row.substantive_claims++;
      if (claim.traceable) { tracedClaims++; row.traceable_claims++; }
    }
    resultRows.push(row);
  }
  return {
    type: 'STD_SYNTHETIC_AI_PROVIDER_PILOT',
    status: !canScoreFresh ? 'AWAITING_INDEPENDENT_ANSWER_KEY_REVIEW'
      : tally.fresh_success ? 'FRESH_PROVIDER_REPORTS_HUMAN_ADJUDICATED' : 'AWAITING_FRESH_PROVIDER_REPORTS',
    gate: { planned_attempts: PILOT.length, manifest_labels_verified: manifestReviewed,
      checklist_labels_verified: checklistReviewed, results_restricted_to_fresh_provider_reports: true },
    attempt_outcomes: tally,
    fresh_run_coverage: metric(tally.fresh_success, PILOT.length),
    decision_agreement: metric(matchingDecisions, adjudicableDecisions),
    unassessable_decisions: unassessableDecisions,
    claim_traceability: metric(tracedClaims, substantiveClaims),
    unsupported_claims: substantiveClaims - tracedClaims,
    fixture_results: resultRows
  };
}

if (require.main === module) {
  try {
    const index = process.argv.indexOf('--record');
    const outputIndex = process.argv.indexOf('--output');
    failUnless(index > 0 && process.argv[index + 1], 'Usage: node score-ai.cjs --record <actual-run-record.json> [--output <report.json>]');
    const inputPath = path.resolve(process.argv[index + 1]);
    const report = score(JSON.parse(fs.readFileSync(inputPath, 'utf8')), { inputPath });
    const json = JSON.stringify(report, null, 2) + '\n';
    if (outputIndex > 0) {
      failUnless(process.argv[outputIndex + 1], '--output needs a JSON path');
      failUnless(!fs.existsSync(process.argv[outputIndex + 1]), 'Refusing to overwrite an earlier AI scoring report');
      fs.writeFileSync(process.argv[outputIndex + 1], json);
    } else process.stdout.write(json);
  } catch (error) {
    console.error(`AI PILOT NOT SCORED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { score, PILOT };
