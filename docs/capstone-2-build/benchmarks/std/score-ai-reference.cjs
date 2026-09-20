'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readCsv, failUnless, fixtureAuthority, metric, getUnique, sha256 } = require('./score-lib.cjs');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../../..');
const PILOT = ['STD-01', 'STD-02', 'STD-03', 'STD-05', 'STD-08', 'STD-09', 'STD-10', 'STD-12', 'STD-18', 'STD-21'];
const OUTCOMES = ['not_attempted', 'fresh_success', 'cache_hit', 'quota_failure',
  'provider_failure', 'transport_failure', 'invalid_response', 'outcome_unknown'];
const SIGNALS = ['present', 'absent', 'unassessable'];
const METHODS = ['PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW', 'PROJECT_SOURCE_AUDIT', 'RULE_BASED_TEXT_AUDIT'];
const CHECKLIST_PATH = path.join(HERE, 'ai-checklist.csv');
const MANIFEST_PATH = path.join(HERE, 'manifest.csv');
const HASHES_PATH = path.join(HERE, 'fixture-hashes.sha256');
const PROTOCOL_PATH = path.join(HERE, 'GOAL2_REFERENCE_CHECKLIST.md');
const INSTRUCTIONS_PATH = path.join(HERE, 'STD_AI_INSTRUCTIONS.txt');
const MODEL = 'gemini-3.1-flash-lite';
const PROMPT_VERSION = 'wildtrack-academic-review-v3';
const KEY_METHOD = 'PROJECT_DEFINED_REFERENCE_AI_ASSISTED';

function timestamp(value, description) {
  failUnless(typeof value === 'string' && Number.isFinite(Date.parse(value)), description);
  return Date.parse(value);
}
function hash64(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function hash40(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value); }
function normalized(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function fileWithinRoot(relativeOrAbsolute, base, description) {
  failUnless(typeof relativeOrAbsolute === 'string' && relativeOrAbsolute.length > 0, `Missing ${description}`);
  const absolute = path.resolve(base, relativeOrAbsolute);
  failUnless(absolute.startsWith(ROOT + path.sep) && fs.existsSync(absolute) && fs.statSync(absolute).isFile(),
    `Missing or outside-repository ${description}: ${relativeOrAbsolute}`);
  return absolute;
}
function loadPreparedChecklist(options) {
  const checklist = options.checklist ?? readCsv(CHECKLIST_PATH);
  const rows = getUnique(checklist, 'decision_id', 'Goal 2 reference checklist decision');
  const grouped = new Map(PILOT.map(id => [id, []]));
  for (const row of rows.values()) {
    failUnless(grouped.has(row.fixture_id), `Unexpected Goal 2 fixture: ${row.fixture_id}`);
    failUnless(['present', 'absent'].includes(row.expected), `Invalid expectation: ${row.decision_id}`);
    failUnless(row.criterion && row.authority && row.reference_source && row.reference_excerpt &&
      row.reference_rationale, `Missing predeclared source-backed reference for ${row.decision_id}`);
    failUnless(row.reference_status === 'FROZEN_PROJECT_DEFINED' &&
      METHODS.includes(row.reference_method), `Reference is not transparently project-defined and frozen: ${row.decision_id}`);
    grouped.get(row.fixture_id).push(row);
  }
  for (const [id, decisions] of grouped) failUnless(decisions.length > 0, `No reference decisions for ${id}`);
  return { checklist, grouped };
}
function validateFrozenKey(record, authority, options) {
  const key = record.frozen_key;
  if (!key) return false;
  const required = {
    checklist_sha256: sha256(CHECKLIST_PATH),
    manifest_sha256: sha256(MANIFEST_PATH),
    template_sha256: authority.templateHash,
    fixture_hashes_sha256: sha256(HASHES_PATH),
    instructions_sha256: sha256(INSTRUCTIONS_PATH),
    protocol_sha256: sha256(PROTOCOL_PATH)
  };
  for (const [name, expected] of Object.entries(required)) {
    failUnless(key[name] === expected, `Frozen Goal 2 key mismatch at ${name}; do not change references after provider attempts`);
  }
  failUnless(key.methodology === KEY_METHOD, 'Frozen key must identify the project-defined AI-assisted reference methodology');
  failUnless(hash40(key.app_commit), 'Frozen key needs the exact 40-digit source app commit');
  failUnless(key.model === MODEL && key.prompt_version === PROMPT_VERSION,
    'Frozen key model and prompt differ from the runner contract');
  timestamp(key.frozen_at, 'Frozen key requires a real ISO timestamp');
  if (options.expectedCommit) failUnless(key.app_commit === options.expectedCommit, 'Unexpected frozen app commit');
  return true;
}
function checkedEvidence(filePath, hash, inputPath, label) {
  failUnless(hash64(hash), `${label} needs SHA-256`);
  const file = fileWithinRoot(filePath, path.dirname(inputPath), label);
  failUnless(sha256(file) === hash.toLowerCase(), `${label} hash mismatch: ${filePath}`);
  return file;
}
function inventory(run, report, fixture, seen) {
  failUnless(run.claim_inventory && run.claim_inventory.complete === true &&
    run.claim_inventory.method === 'PROJECT_SOURCE_AUDIT' &&
    run.claim_inventory.report_sha256 === run.report_sha256,
  `${run.fixture_id}: claims must be inventoried against the exact report hash before traceability scoring`);
  failUnless(Array.isArray(run.claims), `${run.fixture_id}: missing claim inventory`);
  const claims = getUnique(run.claims, 'claim_id', `${run.fixture_id} substantive claim`);
  const required = [];
  (report.findings || []).forEach((f, i) => required.push(`findings[${i}]`));
  (report.missingRequiredSections || []).forEach((f, i) => required.push(`missingRequiredSections[${i}]`));
  for (const reference of required) {
    failUnless([...claims.values()].some(c => c.report_reference === reference),
      `${run.fixture_id}: a structured finding is missing from the claim inventory: ${reference}`);
  }
  // Summary and action can introduce additional assertions. Inventory these separately only when substantive
  // and not simply a restatement of an already indexed finding; disclose that choice in claim_inventory.notes.
  failUnless(run.claim_inventory.notes && run.claim_inventory.notes.trim(),
    `${run.fixture_id}: inventory notes must account for summary and suggestedAction`);
  let total = 0; let traceable = 0; let unassessable = 0;
  for (const claim of claims.values()) {
    failUnless(claim.substantive === true && claim.text && claim.report_reference &&
      claim.notes && claim.audit_method === 'PROJECT_SOURCE_AUDIT',
    `${run.fixture_id} ${claim.claim_id}: missing substantive claim and method evidence`);
    const match = claim.report_reference.match(/^(findings|missingRequiredSections)\[(\d+)\]$/);
    if (match) {
      const item = report[match[1]]?.[Number(match[2])];
      failUnless(item && (claim.text === item.issue || claim.text === item.section),
        `${run.fixture_id} ${claim.claim_id}: claim text does not match raw report at ${claim.report_reference}`);
    } else {
      failUnless(['summary', 'suggestedAction'].includes(claim.report_reference) &&
        normalized(report[claim.report_reference]).includes(normalized(claim.text)),
      `${run.fixture_id} ${claim.claim_id}: claimed excerpt not present in report`);
    }
    failUnless(['pdf', 'official_template', 'deliverable_instructions', 'unsupported', 'unassessable'].includes(claim.source_kind),
      `${run.fixture_id} ${claim.claim_id}: unknown source kind`);
    failUnless([true, false, null].includes(claim.traceable),
      `${run.fixture_id} ${claim.claim_id}: traceable must be true/false/null`);
    if (claim.traceable === null) {
      failUnless(claim.source_kind === 'unassessable', `${run.fixture_id}: unassessable claim has wrong source_kind`);
      unassessable++;
      continue;
    }
    total++;
    if (claim.traceable === true) {
      failUnless(claim.source_kind !== 'unsupported' && claim.source_kind !== 'unassessable' &&
        claim.source_excerpt && claim.source_reference,
        `${run.fixture_id} ${claim.claim_id}: claimed supported finding lacks traceable source text`);
      failUnless(run.fixture_id !== 'STD-18' || claim.source_kind !== 'official_template',
        'STD-18 cannot use the unmapped official template as authority');
      const document = claim.source_kind === 'pdf' ? seen.fixtureText :
        claim.source_kind === 'official_template' ? seen.templateText : seen.instructions;
      failUnless(normalized(document).includes(normalized(claim.source_excerpt)),
        `${run.fixture_id} ${claim.claim_id}: quoted source_excerpt not found in the declared input authority`);
      traceable++;
    } else {
      failUnless(claim.source_kind === 'unsupported', `${run.fixture_id} ${claim.claim_id}: unsupported claim mislabeled`);
    }
  }
  return { total, traceable, unassessable, requiredStructuredClaims: required.length };
}
function score(record, options = {}) {
  const authority = fixtureAuthority();
  failUnless(record && record.schema_version === 2 && record.methodology === KEY_METHOD &&
    Array.isArray(record.runs), 'Goal 2 run record needs schema_version=2 and project-defined reference methodology');
  const { grouped } = loadPreparedChecklist(options);
  const frozen = validateFrozenKey(record, authority, options);
  const keyed = getUnique(record.runs, 'fixture_id', 'Goal 2 run fixture');
  for (const id of keyed.keys()) failUnless(PILOT.includes(id), `Unplanned Goal 2 fixture: ${id}`);
  const tally = Object.fromEntries(OUTCOMES.map(status => [status, 0]));
  const rows = [];
  let correct = 0; let decisionCount = 0; let unassessableDecisions = 0;
  let claims = 0; let traces = 0; let unassessableClaims = 0; let fullyAudited = 0;
  const inputPath = options.inputPath || path.join(HERE, 'ai-run-record.template.json');
  const instructions = fs.existsSync(INSTRUCTIONS_PATH) ? fs.readFileSync(INSTRUCTIONS_PATH, 'utf8') : '';
  const templateText = fs.existsSync(path.join(ROOT, '.scratch/capstone-2-session/goal2-reference-extracted-text/STD-01.txt'))
    ? fs.readFileSync(path.join(ROOT, '.scratch/capstone-2-session/goal2-reference-extracted-text/STD-01.txt'), 'utf8') : '';
  for (const id of PILOT) {
    const run = keyed.get(id) || { fixture_id: id, outcome: 'not_attempted' };
    failUnless(OUTCOMES.includes(run.outcome), `Invalid ${id} attempt outcome: ${run.outcome}`);
    tally[run.outcome]++;
    const row = { fixture_id: id, outcome: run.outcome, scheduled_decisions: grouped.get(id).length,
      decisions: [], audited_claims: 0, verified_claims: 0, outstanding_audit: false };
    if (run.outcome === 'not_attempted') {
      failUnless(!run.report_path && !run.decisions && !run.claims, `${id}: unattempted cannot claim provider evidence`);
      rows.push(row); continue;
    }
    failUnless(frozen, `${id}: cannot claim an attempted run without a frozen reference key`);
    failUnless(timestamp(run.attempted_at, `${id} requires attempted_at`) >= Date.parse(record.frozen_key.frozen_at),
      `${id}: frozen key was recorded after the attempt`);
    failUnless(run.fixture_sha256 === authority.fixtures.get(id).sha256 &&
      run.template_sha256 === authority.templateHash && run.app_commit === record.frozen_key.app_commit,
      `${id}: attempted bytes or code revision do not match frozen reference`);
    failUnless(run.provider === 'Google Gemini' && run.model === record.frozen_key.model &&
      run.prompt_version === record.frozen_key.prompt_version, `${id}: provider/prompt mismatch`);
    if (run.outcome !== 'fresh_success') {
      failUnless(run.reason && !run.decisions && !run.claims,
        `${id}: nonfresh attempt requires a reason and cannot be content-scored`);
      rows.push({ ...row, reason: run.reason }); continue;
    }
    failUnless(run.cache_status === 'MISS', `${id}: a cached result is not a fresh success`);
    const reportFile = checkedEvidence(run.report_path, run.report_sha256, inputPath, `${id} report`);
    checkedEvidence(run.raw_response_path, run.raw_response_sha256, inputPath, `${id} raw provider response`);
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    failUnless(Array.isArray(report.findings) && Array.isArray(report.missingRequiredSections),
      `${id}: raw structured AI Review report missing findings arrays`);
    if (!Array.isArray(run.decisions) || !run.claim_inventory?.complete) {
      row.outstanding_audit = true; rows.push(row); continue;
    }
    const decided = getUnique(run.decisions, 'decision_id', `${id} observation decision`);
    failUnless(decided.size === grouped.get(id).length, `${id}: all frozen checklist decisions must be audited`);
    for (const reference of grouped.get(id)) {
      const item = decided.get(reference.decision_id);
      failUnless(item && SIGNALS.includes(item.observed) && item.report_reference && item.notes &&
        item.audit_method === 'PROJECT_SOURCE_AUDIT',
        `${id}: missing auditable observation for ${reference.decision_id}`);
      if (item.observed === 'unassessable') unassessableDecisions++;
      else { decisionCount++; if (item.observed === reference.expected) correct++; }
      row.decisions.push({ decision_id: reference.decision_id, expected: reference.expected,
        observed: item.observed, matches_reference: item.observed === 'unassessable' ? null :
          item.observed === reference.expected, report_reference: item.report_reference, notes: item.notes });
    }
    const fixtureTextPath = path.join(ROOT, '.scratch/capstone-2-session/goal2-reference-extracted-text', id + '.txt');
    failUnless(fs.existsSync(fixtureTextPath), `${id}: extracted source text missing for claim provenance checks`);
    const audit = inventory(run, report, authority.fixtures.get(id), {
      fixtureText: fs.readFileSync(fixtureTextPath, 'utf8'), templateText, instructions
    });
    fullyAudited++;
    claims += audit.total; traces += audit.traceable; unassessableClaims += audit.unassessable;
    row.audited_claims = audit.total; row.verified_claims = audit.traceable;
    rows.push(row);
  }
  const allAttempted = tally.not_attempted === 0;
  const anyUnfinished = rows.some(row => row.outstanding_audit);
  return {
    type: 'STD_SYNTHETIC_GOAL2_PROJECT_DEFINED_REFERENCE_EVALUATION',
    status: !frozen ? 'NOT_FROZEN_NO_PROVIDER_RESULTS' :
      !allAttempted ? 'PILOT_PARTIALLY_EXECUTED' :
      anyUnfinished ? 'FRESH_RUNS_AWAIT_SOURCE_AUDIT' :
      fullyAudited === tally.fresh_success ? 'PROJECT_REFERENCE_AUDIT_COMPLETE' : 'AUDIT_INCOMPLETE',
    limitations: ['Project-defined checklist with ChatGPT assistance; no independent human verification',
      'Controlled synthetic STD fixtures only, not a population of actual student submissions',
      'Grounding judgments are source-audited but not externally validated; questionnaire ratings do not measure this goal'],
    gate: { planned_attempts: 10, frozen_reference_verified: frozen, source_review_method: KEY_METHOD,
      complete_report_audits: fullyAudited, fresh_reports: tally.fresh_success,
      fixed_reference_decisions: [...grouped.values()].reduce((n, rows) => n + rows.length, 0) },
    attempt_outcomes: tally,
    fresh_run_coverage: metric(tally.fresh_success, PILOT.length),
    checklist_agreement: metric(correct, decisionCount),
    unassessable_decisions: unassessableDecisions,
    claim_traceability: metric(traces, claims),
    unassessable_claims: unassessableClaims,
    unsupported_claims: claims - traces,
    fixture_results: rows
  };
}
function cli(argv) {
  try {
    const index = argv.indexOf('--record');
    const outputIndex = argv.indexOf('--output');
    failUnless(index > 0 && argv[index + 1], 'Usage: node score-ai.cjs --record <actual-run-record.json> [--output <report.json>]');
    const inputPath = path.resolve(argv[index + 1]);
    const report = score(JSON.parse(fs.readFileSync(inputPath, 'utf8')), { inputPath });
    const json = JSON.stringify(report, null, 2) + '\n';
    if (outputIndex > 0) {
      failUnless(argv[outputIndex + 1] && !fs.existsSync(argv[outputIndex + 1]),
        'Refusing to overwrite an earlier AI score report');
      fs.writeFileSync(argv[outputIndex + 1], json);
    } else process.stdout.write(json);
  } catch (error) {
    console.error(`GOAL 2 NOT SCORED: ${error.message}`);
    process.exitCode = 1;
  }
}
if (require.main === module) cli(process.argv);
module.exports = { score, cli, PILOT, KEY_METHOD };
