'use strict';

/**
 * OFFLINE new v6 Goal 2 follow-up scorer. Never calls Gemini or reconstructs missing
 * outputs. All reference decisions predate attempts; all output judgments are an
 * explicitly separate POST-RUN project/AI-assisted source audit of the FINAL production
 * postprocessor report. A source quote alone never automatically implies semantic support.
 *
 * This follow-up cannot retroactively change or replace the original v3 STD/v4 SRS pilots.
 */
const fs = require('node:fs');
const path = require('node:path');
const { validatePlan, hashFile, hash, normalize, within, TYPE, METHOD, HERE, ROOT } =
  require('./freeze-followup.cjs');

const AUDIT_METHOD = 'PROJECT_AI_ASSISTED_SOURCE_AUDIT';
const STATUS = ['SOURCE_SUPPORTED', 'UNSUPPORTED', 'UNASSESSABLE'];
const OUTCOMES = ['fresh_success', 'not_attempted', 'quota_failure', 'provider_failure',
  'transport_failure', 'invalid_response', 'outcome_unknown', 'production_postprocessing_rejected'];
const HASH64 = /^[0-9a-f]{64}$/i;
const HASH40 = /^[0-9a-f]{40}$/i;
// The production postprocessor generates only a small, identifiable set of generic
// actions/limitations. Arbitrary sentences containing "no", "document" or "review"
// are NOT boilerplate: those could be novel factual or requirement claims.
const GENERIC_APP_SENTENCES = new Set([
  'Review the submitted PDF.',
  'Check the cited document fact.',
  'The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.',
  'Verify that the submitted PDF is the intended deliverable and review the cited document evidence.',
  'Review the cited document evidence before deciding what correction, if any, is appropriate.',
  'Confirm the cited Deliverable Instructions or official-template passages before giving requirement-based feedback.',
  'If a specific template structure is required, add the official template or state the requirement in Deliverable Instructions.',
  'Review the PDF manually before giving feedback or making a decision.'
].map(normalizedSentence));
function normalizedSentence(text) { return String(text || '').trim().replace(/\s+/g, ' '); }
const fail = (value, message) => { if (!value) throw new Error(message); };
const ratio = (numerator, denominator) => ({
  numerator, denominator, value: denominator ? numerator / denominator : null
});
const iso = (timestamp, name) => {
  fail(typeof timestamp === 'string' && /^\d{4}-\d\d-\d\dT/.test(timestamp)
    && Number.isFinite(Date.parse(timestamp)), `${name}: real ISO UTC timestamp required`);
  return Date.parse(timestamp);
};
const jsonFile = (filename, label) => {
  fail(fs.existsSync(filename) && fs.statSync(filename).isFile(), `${label} not found`);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
};
const unique = (rows, key, label) => {
  const result = new Map();
  for (const row of rows) {
    fail(typeof row?.[key] === 'string' && row[key] && !result.has(row[key]),
      `Missing/duplicate ${label} ${row?.[key] || ''}`);
    result.set(row[key], row);
  }
  return result;
};

/** A claimed success must have ACTUAL captured one-shot transport and cache evidence. */
function validateTransport(result, id = 'case') {
  fail(OUTCOMES.includes(result.outcome) && result.outcome !== 'not_attempted',
    `${id}: unknown provider outcome (never convert a failed attempt to clean)`);
  const count = result.generation_requests_sent;
  fail(Number.isInteger(count) && count >= 0 && count <= 1,
    `${id}: one-shot actual Gemini transport count must be 0 or 1, never retry`);
  if (count === 1) fail(HASH64.test(result.request_payload_sha256 || ''),
    `${id}: actual generation payload SHA absent despite recorded send`);
  if (result.outcome === 'fresh_success') {
    fail(count === 1 && result.response_http_status === 200 && result.cache_status === 'MISS'
      && result.provider === 'Google Gemini'
      && result.scope === 'Genuine provider + actual production postprocessing, synthetic PDF; no Drive/UI/cache',
    `${id}: fresh success requires one genuine HTTP 200 Gemini request and production postprocessing`);
    fail(HASH64.test(result.raw_provider_sha256 || '')
      && HASH64.test(result.raw_report_sha256 || '')
      && HASH64.test(result.production_filtered_report_sha256 || ''),
    `${id}: all three raw, parsed, FINAL report SHAs required`);
  } else {
    fail(result.cache_status !== 'MISS' && !result.production_filtered_report_sha256,
      `${id}: unsuccessful/nonfresh attempt cannot masquerade as a final fresh-scored report`);
  }
  return { fresh: result.outcome === 'fresh_success', requestsSent: count,
    httpStatus: result.response_http_status ?? null };
}

function validateProviderResponseId(raw, result, id = 'case') {
  fail(typeof raw.responseId === 'string' && raw.responseId.trim(),
    `${id}: actual raw Gemini HTTP body has no responseId; do not invent provider provenance`);
  fail(result.provider_response_id === raw.responseId,
    `${id}: provider responseId differs from actual HTTP response body`);
  return raw.responseId;
}

/** Ordered, cumulative budget. Does not interpret one 503 as a fresh or retriable result. */
function checkAvailabilityBudget(attempts, maxFailures = 2) {
  let availabilityFailures = 0;
  const late = [];
  for (const item of [...attempts].sort((a, b) => a.time - b.time)) {
    if (availabilityFailures >= maxFailures) late.push(item.id);
    if ([429, 503].includes(item.httpStatus)) availabilityFailures++;
  }
  fail(late.length === 0,
    'Bounded availability budget exceeded: cases attempted after '
      + maxFailures + ' observed HTTP 429/503 failures: ' + late.join(', '));
  return availabilityFailures;
}

function verifyFreeze(freezePath, prepared, options = {}) {
  fail(freezePath, 'The v6 run must have a new pre-run frozen-key.json; no retroactive reference');
  const file = path.resolve(freezePath);
  fail(file.startsWith(ROOT + path.sep), 'Freeze key must reside within benchmark repository');
  const frozen = jsonFile(file, 'v6 pre-run frozen key');
  fail(frozen.type === TYPE && frozen.status === 'FROZEN_PROJECT_DEFINED'
    && frozen.reference_method === METHOD, 'Wrong v6 project reference freeze/type/status');
  const frozenAt = iso(frozen.frozen_at, 'v6 reference freeze');
  const exact = {
    manifest_sha256: prepared.manifest_sha256,
    reference_sha256: prepared.reference_sha256,
    protocol_sha256: hashFile(within(HERE, 'GOAL2_V6_EVALUATION_PROTOCOL.md', 'v6 protocol')),
    template_sha256: prepared.template_sha256,
    template_text_sha256: prepared.template_text_sha256,
    source_text_hashes_sha256: prepared.source_text_hashes_sha256,
    score_sha256: hashFile(path.join(HERE, 'score-followup.cjs'))
  };
  for (const [key, expected] of Object.entries(exact)) {
    fail(HASH64.test(frozen[key] || '') && frozen[key] === expected,
      `Freeze ${key}: source/score/protocol changed after the pre-run reference was set`);
  }
  for (const [key, expected] of Object.entries(prepared.instructions_sha256)) {
    fail(frozen.instructions_sha256?.[key] === expected, `Freeze ${key} instructions SHA drift`);
  }
  fail(Array.isArray(frozen.case_ids)
    && JSON.stringify(frozen.case_ids) === JSON.stringify(prepared.caseIds)
    && frozen.case_ids.length === 10 && frozen.planned_case_count === 10,
  'This NEW experiment requires precisely ten predeclared G2 cases, no selective additions');
  fail(frozen.planned_decision_count === prepared.decisions.length,
    'Frozen project-reference decision denominator changed');
  fail(HASH40.test(frozen.app_commit || '') && frozen.prompt_version === 'wildtrack-academic-review-v5'
    && frozen.model === 'gemini-3.1-flash-lite'
    && /^gemini-3\.1-flash-lite:/.test(frozen.provider_cache_version || ''),
  'Wrong committed production prompt/model/provider cache revision for follow-up');
  const runner = within(ROOT,
    'backend/src/test/java/com/capvault/backend/aireview/StdGoal2V6LivePilotTest.java', 'one-shot JUnit runner');
  fail(frozen.runner_sha256 === hashFile(runner),
    'Runner changed after reference freeze: transport/postprocessor provenance cannot be assumed');
  for (const id of prepared.caseIds) {
    fail(frozen.fixture_sha256?.[id] === prepared.fixtureSha[id]
      && frozen.source_text_sha256?.[id] === prepared.sourceTextSha[id],
    `${id}: planned PDF or PDFBox text differs from frozen reference`);
  }
  fail(frozen.methodology_note && /not independent|not.*human/i.test(frozen.methodology_note),
    'Do not describe this project-defined AI-assisted reference as independent human ground truth');
  if (options.expectedCommit) fail(frozen.app_commit === options.expectedCommit,
    'Unexpected app commit: never mix production code versions');
  return { frozen, frozenAt, freezePath: file, freezeSha256: hashFile(file) };
}

function narrativeAtoms(value) {
  const text = String(value || '');
  const result = [];
  // Maintain EXACT UTF-16 offsets. Segment by sentence or semicolon/newline while retaining
  // punctuation. The audit must account for every non-whitespace character in each atom.
  const separator = /(?:[.!?;](?:\s+|$)|\r?\n+)/g;
  let offset = 0;
  for (const match of text.matchAll(separator)) {
    const end = match.index + match[0].length;
    const start = offset;
    if (text.slice(start, end).trim()) result.push({ start, end, text: text.slice(start, end) });
    offset = end;
  }
  if (text.slice(offset).trim())
    result.push({ start: offset, end: text.length, text: text.slice(offset) });
  return result;
}

function validateNarrative(report, audit, claims, structuredReferences) {
  const segments = audit.claim_inventory?.narrative_segments;
  fail(segments && typeof segments === 'object',
    'Every final report needs a complete, explicit summary + suggestedAction audit');
  for (const field of ['summary', 'suggestedAction']) {
    const atoms = narrativeAtoms(report[field]);
    const annotations = segments[field];
    fail(Array.isArray(annotations) && annotations.length === atoms.length,
      `${field}: each textual assertion/sentence must be covered by an explicit audit segment`);
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const segment = annotations[i];
      fail(segment.start === atom.start && segment.end === atom.end,
        `${field}: gap, overlap, or reordered narrative span at segment ${i}`);
      fail(segment.text === atom.text && typeof segment.notes === 'string' && segment.notes.trim().length >= 10,
        `${field}: audit must reproduce the exact narrative excerpt and explain its handling`);
      fail(['SUBSTANTIVE', 'DERIVATIVE', 'BOILERPLATE'].includes(segment.classification),
        `${field}: every segment needs explicit substantive/derivative/boilerplate classification`);
      if (segment.classification === 'SUBSTANTIVE') {
        const item = claims.get(segment.claim_id);
        fail(item && item.report_reference === field
          && item.span_start === atom.start && item.span_end === atom.end
          && item.text === atom.text,
        `${field}: novel substantive assertion missing its exact source-audited claim inventory item`);
      } else {
        fail(!segment.claim_id, `${field}: derivative/boilerplate cannot be scored again as new claim`);
        if (segment.classification === 'DERIVATIVE') {
          fail(structuredReferences.has(segment.derivative_of)
            || claims.has(segment.derivative_of),
          `${field}: derivative segment must identify an already-inventoried actual claim`);
          const parent = structuredReferences.has(segment.derivative_of)
            ? [...claims.values()].find(claim => claim.report_reference === segment.derivative_of)
            : claims.get(segment.derivative_of);
          fail(parent && (normalize(atom.text).includes(normalize(parent.text))
            || normalize(parent.text).includes(normalize(atom.text))),
          `${field}: paraphrased/new narrative assertion cannot be auto-exempted as derivative; audit it as a separate substantive claim`);
        }
        if (segment.classification === 'BOILERPLATE') {
          const generic = normalizedSentence(atom.text);
          fail(GENERIC_APP_SENTENCES.has(generic)
            || generic.startsWith('No official template was supplied'),
          `${field}: novel documentary assertion cannot be exempted as generic boilerplate`);
        }
      }
    }
  }
}

function verifyAudit(audit, finalReport, fixture, prepared, finalHash) {
  const id = fixture.fixture_id;
  fail(audit && audit.fixture_id === id && audit.final_report_sha256 === finalHash
    && audit.claim_inventory?.complete === true
    && audit.claim_inventory.final_report_sha256 === finalHash
    && audit.claim_inventory.method === AUDIT_METHOD,
  `${id}: final report has no complete post-run source audit against exact final SHA`);
  fail(Array.isArray(finalReport.findings) && Array.isArray(finalReport.missingRequiredSections)
    && typeof finalReport.summary === 'string' && typeof finalReport.suggestedAction === 'string',
  `${id}: final production report is not the expected structured AI Review format`);
  const claims = unique(audit.claims || [], 'claim_id', `${id} substantive claim`);
  const structuredReferences = new Set();
  for (const [field, textField] of [['findings', 'issue'], ['missingRequiredSections', 'section']]) {
    finalReport[field].forEach((item, index) => {
      const ref = `${field}[${index}]`;
      structuredReferences.add(ref);
      const matches = [...claims.values()].filter(c => c.report_reference === ref);
      fail(matches.length === 1 && matches[0].text === item[textField],
        `${id}: unexamined or duplicated FINAL ${ref}, or claim text not exact`);
    });
  }
  validateNarrative(finalReport, audit, claims, structuredReferences);
  let supported = 0; let unsupported = 0; let unassessable = 0;
  const supportedExamples = [];
  for (const claim of claims.values()) {
    fail(claim.audit_method === AUDIT_METHOD && STATUS.includes(claim.source_status)
      && claim.substantive === true && claim.text && claim.notes
      && claim.notes.trim().length >= 10, `${id} ${claim.claim_id}: missing explicit source-audit judgment`);
    const match = /^(findings|missingRequiredSections)\[(\d+)\]$/.exec(claim.report_reference);
    if (match) {
      const item = finalReport[match[1]][Number(match[2])];
      fail(item && claim.text === (match[1] === 'findings' ? item.issue : item.section),
        `${id} ${claim.claim_id}: structured claim is not in FINAL report`);
    } else {
      fail(['summary', 'suggestedAction'].includes(claim.report_reference)
        && Number.isInteger(claim.span_start) && Number.isInteger(claim.span_end)
        && finalReport[claim.report_reference].slice(claim.span_start, claim.span_end) === claim.text,
      `${id} ${claim.claim_id}: summary/action claim must quote exact UTF-16 report span`);
      fail(audit.claim_inventory.narrative_segments[claim.report_reference].some(segment =>
        segment.classification === 'SUBSTANTIVE' && segment.claim_id === claim.claim_id),
      `${id} ${claim.claim_id}: a novel narrative claim was omitted from segment audit`);
    }
    if (claim.source_status === 'SOURCE_SUPPORTED') {
      fail(['pdf', 'official_template', 'deliverable_instructions'].includes(claim.source_kind)
        && claim.source_excerpt?.trim() && claim.source_reference?.trim()
        && claim.source_assessment?.trim().length >= 30,
      `${id} ${claim.claim_id}: source-supported requires actual separately reasoned semantic assessment, not provider quote`);
      fail(claim.source_kind !== 'official_template' || fixture.template_mapped === true,
        `${id} ${claim.claim_id}: cannot cite an official template absent from this provider input`);
      const instructionsKey = fixture.instructions_key
        || (fixture.instructions_filename === 'STD_V6_INSTRUCTIONS.txt' ? 'mapped'
          : fixture.instructions_filename === 'NO_TEMPLATE_GENERIC_INSTRUCTIONS.txt'
            ? 'no_template_generic' : 'no_template_explicit');
      const source = claim.source_kind === 'pdf'
        ? prepared.sourceText[id] : claim.source_kind === 'official_template'
          ? prepared.templateText : prepared.instructions[instructionsKey];
      fail(source && normalize(source).includes(normalize(claim.source_excerpt)),
        `${id} ${claim.claim_id}: source quote not in SHA-bound input PDF/template/instructions`);
      if (match) {
        const item = finalReport[match[1]][Number(match[2])];
        const expectedSource = {
          DOCUMENT: 'pdf', OFFICIAL_TEMPLATE: 'official_template',
          DELIVERABLE_REQUIREMENTS: 'deliverable_instructions'
        }[item.source];
        fail(expectedSource === claim.source_kind,
          `${id} ${claim.claim_id}: audit source type contradicts final structured finding`);
        if (item.source !== 'DOCUMENT') {
          fail(item.requirement && normalize(source).includes(normalize(item.requirement)),
            `${id} ${claim.claim_id}: provider's claimed mandatory requirement is NOT in supplied authority`);
        }
      }
      if (claim.report_reference.startsWith('missingRequiredSections[')
        || /\b(?:absent|missing|not present|no evidence|does not contain|lacks)\b/i.test(claim.text)) {
        fail(claim.absence_audit?.full_document_examined === true
          && claim.absence_audit?.notes?.trim().length >= 25,
        `${id} ${claim.claim_id}: a positive quote cannot independently prove an absence in the whole PDF`);
      }
      supported++;
      supportedExamples.push({ claim_id: claim.claim_id, source_kind: claim.source_kind,
        source_reference: claim.source_reference });
    } else if (claim.source_status === 'UNSUPPORTED') {
      fail(claim.source_kind === 'none' && !claim.source_excerpt,
        `${id} ${claim.claim_id}: unsupported claim cannot cite invented supporting source`);
      unsupported++;
    } else {
      fail(claim.source_kind === 'none' && !claim.source_excerpt,
        `${id} ${claim.claim_id}: ambiguous claim must be kept UNASSESSABLE, not given a fake source`);
      unassessable++;
    }
  }
  const decisions = unique(audit.decisions || [], 'decision_id', `${id} observed decision`);
  const planned = prepared.decisions.filter(d => d.fixture_id === id);
  fail(decisions.size === planned.length,
    `${id}: every frozen issue/clean reference decision must be evaluated from FINAL report`);
  let correct = 0; let adjudicable = 0; let undecidable = 0;
  for (const plannedDecision of planned) {
    const item = decisions.get(plannedDecision.decision_id);
    fail(item && ['present', 'absent', 'unassessable'].includes(item.observed)
      && item.audit_method === AUDIT_METHOD && item.notes?.trim().length >= 15,
    `${id} ${plannedDecision.decision_id}: source-grounded final-report observation missing`);
    fail(item.report_reference === 'full_report'
      || item.report_reference === 'summary' || item.report_reference === 'suggestedAction'
      || /^(?:findings|missingRequiredSections)\[\d+\]$/.test(item.report_reference || ''),
    `${id}: decision evidence must identify an actual FINAL report location or full-report absence audit`);
    if (item.report_reference === 'full_report')
      fail(item.observed !== 'present' && item.full_report_examined === true,
        `${id}: absence requires an explicitly documented complete final-report examination`);
    if (item.observed === 'unassessable') undecidable++;
    else {
      adjudicable++;
      if (item.observed === plannedDecision.expected) correct++;
    }
  }
  fail(audit.claim_inventory.notes?.trim().length >= 30
    && /summary/i.test(audit.claim_inventory.notes)
    && /suggestedaction/i.test(audit.claim_inventory.notes),
  `${id}: completeness attestation must explain both summary and suggestedAction treatment`);
  return {
    decisions: { correct, adjudicable, undecidable, scheduled: planned.length },
    claims: { total: claims.size, supported, unsupported, unassessable, supportedExamples }
  };
}

function score(options = {}) {
  const prepared = validatePlan();
  const attemptsRoot = path.resolve(options.attemptsDir
    || path.join(ROOT, '.scratch/capstone-2-session/goal2-v6/attempts'));
  const auditsRoot = path.resolve(options.auditsDir || path.join(HERE, 'audits'));
  fail(attemptsRoot.startsWith(ROOT + path.sep) && auditsRoot.startsWith(ROOT + path.sep),
    'Attempt/audit source roots must be explicitly inside the repository; no arbitrary remote inputs');
  const anyAttempt = prepared.caseIds.some(id =>
    fs.existsSync(path.join(attemptsRoot, id, 'attempt-started.json')));
  if (!options.freezePath && anyAttempt) throw new Error('Attempt exists without a pre-run v6 freeze');
  const freeze = options.freezePath ? verifyFreeze(options.freezePath, prepared, options) : null;
  const outcomes = Object.fromEntries(OUTCOMES.map(name => [name, 0]));
  let fresh = 0; let attempted = 0; let audited = 0;
  let referenceCorrect = 0; let referenceAssessable = 0; let referenceUnassessable = 0;
  let totalClaims = 0; let supported = 0; let unsupported = 0; let uncertain = 0;
  const rows = [];
  const sortedAttempts = [];
  for (const fixture of prepared.fixtures) {
    const id = fixture.fixture_id;
    const dir = path.join(attemptsRoot, id);
    const startFile = path.join(dir, 'attempt-started.json');
    const resultFile = path.join(dir, 'attempt-result.json');
    const expectedDecisions = prepared.decisions.filter(d => d.fixture_id === id).length;
    const row = { fixture_id: id, expected_decisions: expectedDecisions, outcome: 'not_attempted',
      decision_correct: null, decision_adjudicable: null, claim_supported: null,
      claim_total: null, audited: false, generation_requests_sent: null, http_status: null };
    if (!fs.existsSync(startFile)) {
      fail(!fs.existsSync(resultFile), `${id}: attempt result exists without the exclusive pre-request claim`);
      outcomes.not_attempted++;
      rows.push(row);
      continue;
    }
    fail(freeze, `${id}: attempted reference was never frozen`);
    attempted++;
    const started = jsonFile(startFile, `${id} immutable one-shot start`);
    fail(started.type === 'GOAL2_V6_ONE_SHOT_PROVIDER_ATTEMPT'
      && started.fixture_id === id && started.frozen_key_sha256 === freeze.freezeSha256
      && started.app_commit === freeze.frozen.app_commit
      && started.manifest_sha256 === freeze.frozen.manifest_sha256
      && started.reference_sha256 === freeze.frozen.reference_sha256
      && started.fixture_sha256 === prepared.fixtureSha[id]
      && started.template_sha256 === freeze.frozen.template_sha256
      && started.model === freeze.frozen.model
      && started.prompt_version === freeze.frozen.prompt_version
      && started.provider_cache_version === freeze.frozen.provider_cache_version,
    `${id}: wrong frozen source, app or provider version on durable attempt claim`);
    const instructionName = fixture.instructions_filename || prepared.manifest.instructions_filename;
    const instructionsKey = Object.entries({
      mapped: 'STD_V6_INSTRUCTIONS.txt',
      no_template_generic: 'NO_TEMPLATE_GENERIC_INSTRUCTIONS.txt',
      no_template_explicit: 'NO_TEMPLATE_EXPLICIT_INSTRUCTIONS.txt'
    }).find(([, filename]) => filename === instructionName)?.[0];
    fail(instructionsKey && started.instructions_input_sha256 === prepared.instructions_sha256[instructionsKey]
      && started.template_mapped === fixture.template_mapped,
    `${id}: actual instructions or no-template mapping differs from pre-run case authority`);
    const time = iso(started.attempted_at, `${id} attempt`);
    fail(time > freeze.frozenAt, `${id}: attempted before pre-run reference freeze`);
    sortedAttempts.push({ id, time });
    if (!fs.existsSync(resultFile)) {
      outcomes.outcome_unknown++;
      Object.assign(row, { outcome: 'outcome_unknown',
        reason: 'Durable start exists but no result (crash/transport unknown); never reattempt or invent output' });
      rows.push(row);
      continue;
    }
    const result = jsonFile(resultFile, `${id} actual attempt outcome`);
    fail(result.fixture_id === id && result.attempted_at === started.attempted_at
      && result.frozen_key_sha256 === freeze.freezeSha256
      && result.fixture_sha256 === prepared.fixtureSha[id]
      && result.app_commit === freeze.frozen.app_commit
      && result.provider_cache_version === freeze.frozen.provider_cache_version,
    `${id}: result provenance differs from immutable attempted request`);
    const { requestsSent: count } = validateTransport(result, id);
    iso(result.finished_at, `${id} finish`);
    fail(Date.parse(result.finished_at) >= time, `${id}: finish predates attempt`);
    Object.assign(row, { outcome: result.outcome, generation_requests_sent: count,
      http_status: result.response_http_status ?? null,
      provider_response_id: result.provider_response_id ?? null });
    outcomes[result.outcome]++;
    if (result.outcome === 'fresh_success') {
      const evidence = {
        'raw-provider-response.json': result.raw_provider_sha256,
        'raw-report.json': result.raw_report_sha256,
        'production-filtered-report.json': result.production_filtered_report_sha256
      };
      for (const [filename, expectedHash] of Object.entries(evidence))
        fail(hashFile(within(dir, filename, `${id} ${filename}`)) === expectedHash,
          `${id}: exact raw/final provider evidence hash mismatch`);
      const provider = jsonFile(path.join(dir, 'raw-provider-response.json'), `${id} raw response`);
      validateProviderResponseId(provider, result, id);
      const report = jsonFile(path.join(dir, 'production-filtered-report.json'), `${id} final report`);
      fail(Array.isArray(report.findings) && Array.isArray(report.missingRequiredSections),
        `${id}: raw provider output cannot masquerade as final production review`);
      fresh++;
      const auditPath = path.join(auditsRoot, id + '.json');
      if (fs.existsSync(auditPath)) {
        const verified = verifyAudit(jsonFile(auditPath, `${id} audit`), report,
          fixture, prepared, result.production_filtered_report_sha256);
        audited++;
        referenceCorrect += verified.decisions.correct;
        referenceAssessable += verified.decisions.adjudicable;
        referenceUnassessable += verified.decisions.undecidable;
        totalClaims += verified.claims.total;
        supported += verified.claims.supported;
        unsupported += verified.claims.unsupported;
        uncertain += verified.claims.unassessable;
        Object.assign(row, {
          audited: true, decision_correct: verified.decisions.correct,
          decision_adjudicable: verified.decisions.adjudicable,
          claim_supported: verified.claims.supported, claim_total: verified.claims.total
        });
      } else row.reason = 'Fresh final report exists; complete post-run source audit NOT supplied';
    } else {
      fail(result.cache_status !== 'MISS' && !fs.existsSync(path.join(dir, 'production-filtered-report.json')),
        `${id}: unsuccessful/nonfresh outcome cannot claim final fresh-scored content`);
      row.reason = result.failure_code || 'Actual provider/production postprocessing did not deliver a final report';
    }
    rows.push(row);
  }
  const availabilityFailures = checkAvailabilityBudget(sortedAttempts.map(item => ({
    ...item, httpStatus: rows.find(r => r.fixture_id === item.id)?.http_status
  })));
  const allAudited = fresh === audited;
  const totalFrozenDecisions = prepared.decisions.length;
  const metricReady = allAudited && freeze;
  const summary = {
    type: 'GOAL2_V6_SEPARATE_SYNTHETIC_PRODUCTION_FILTERED_FOLLOWUP',
    status: !freeze ? 'NOT_FROZEN_NO_PROVIDER_RESULTS'
      : attempted === 0 ? 'FROZEN_NOT_ATTEMPTED'
        : !allAudited ? 'AUDIT_INCOMPLETE_NO_CLAIM_SCORE'
          : attempted < prepared.caseIds.length ? 'PARTIALLY_EXECUTED'
            : 'PROJECT_SOURCE_AUDIT_COMPLETE',
    reference_method: METHOD,
    scope: 'NEW controlled fictional STD provider + production v5 postprocessor; not original v3 STD pilot or real Drive/UI/cache',
    gate: {
      frozen_pre_run_reference_verified: Boolean(freeze),
      frozen_at: freeze?.frozen.frozen_at || null,
      app_commit: freeze?.frozen.app_commit || null,
      fixed_case_denominator: prepared.caseIds.length,
      frozen_decision_denominator: totalFrozenDecisions,
      attempted, fully_audited_fresh_reports: audited,
      audit_complete_for_all_fresh_reports: allAudited,
      bounded_availability_stop_after_http_429_or_503: 2,
      observed_http_429_or_503: availabilityFailures,
      no_independent_human_reference_claimed: true
    },
    fresh_run_coverage: ratio(fresh, prepared.caseIds.length),
    attempted_case_coverage: ratio(attempted, prepared.caseIds.length),
    attempt_outcomes: outcomes,
    checklist_agreement: metricReady ? ratio(referenceCorrect, referenceAssessable)
      : { numerator: null, denominator: null, value: null },
    frozen_decision_coverage: metricReady ? ratio(referenceAssessable, totalFrozenDecisions)
      : { numerator: null, denominator: totalFrozenDecisions, value: null },
    unassessable_decisions: metricReady ? referenceUnassessable : null,
    claim_traceability: metricReady ? ratio(supported, totalClaims)
      : { numerator: null, denominator: null, value: null },
    unsupported_claims: metricReady ? unsupported : null,
    unassessable_claims: metricReady ? uncertain : null,
    case_results: rows,
    limitations: [
      'This is a NEW separately frozen ten-case synthetic STD follow-up; never replace original STD v3 7/10 or 24/43 metrics or its HTTP 503.',
      'Checklist agreement uses only adjudicable, audited fresh FINAL reports; failed/unknown/no-request cases remain in fixed ten-case coverage.',
      'Source claim labels are post-run AI-assisted PROJECT audit judgments, not mechanically proven semantic truth or independent human ground truth.',
      'An exact source quote is necessary for SOURCE_SUPPORTED but alone insufficient; uncertain meaning must be marked UNASSESSABLE.',
      'Empty claim denominator produces a null traceability value, never an automatic 100%.',
      'A confirmed HTTP failure, provider timeout, malformed response, or crash is never replaced by a retry or invented final report.',
      'No complete deployed Drive, form, student population, UI, cache, or real-world testing authenticity was evaluated.'
    ]
  };
  return summary;
}

if (require.main === module) {
  try {
    const argument = name => { const i = process.argv.indexOf('--' + name);
      return i < 0 ? undefined : process.argv[i + 1]; };
    const output = argument('output');
    const result = score({ freezePath: argument('freeze'),
      attemptsDir: argument('attempts'), auditsDir: argument('audits') });
    const content = JSON.stringify(result, null, 2) + '\n';
    if (output) {
      const file = path.resolve(output);
      fail(file.startsWith(ROOT + path.sep) && !fs.existsSync(file),
        'Scoring output must be a NEW, create-only file inside repository');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, { flag: 'wx' });
    } else process.stdout.write(content);
  } catch (error) {
    console.error('GOAL 2 V6 NOT SCORED: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { score, verifyFreeze, verifyAudit, validateNarrative, narrativeAtoms, ratio,
  validateTransport, validateProviderResponseId, checkAvailabilityBudget, AUDIT_METHOD, OUTCOMES };
