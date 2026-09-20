'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readCsv, failUnless, fixtureAuthority, labelsReviewed, metric, getUnique, sha256 } = require('./score-lib.cjs');

const ASSERTIONS = path.join(__dirname, 'atomic-assertions.csv');
const REQUIRED_FAMILIES = 25;
const REQUIRED_VARIANTS = ['STD-15-corrupt', 'STD-15-non-pdf', 'STD-17-password',
  'STD-17-oversized', 'STD-19-with-requirement', 'STD-19-without-requirement',
  'STD-25-unexplained', 'STD-25-resolved'];

const INSPECTED_SIGNALS = new Set(['readable', 'valid_pdf', 'invalid_pdf_data', 'corrupt_pdf',
  'password_protected', 'too_short', 'template_only', 'template_available', 'no_template']);
const GATEWAY_FLAGS = new Map([
  ['gateway_inaccessible', 'Inaccessible'],
  ['file_too_large', 'File Too Large'],
  ['not_pdf', 'Not PDF'],
  ['download_disabled', 'Download Disabled']
]);
const BENCHMARK = __dirname;
const REPO_ROOT = path.resolve(BENCHMARK, '../../../..');

function preRunFreeze(options, observations, assertions, fixtures, templateHash) {
  if (!options.freezePath) return { valid: false, frozen_at: null,
    detail: 'No real independently reviewed pre-run Goal 1 frozen-key.json supplied; engineering-only diagnostic' };
  const keyPath = path.resolve(options.freezePath);
  failUnless(keyPath.startsWith(REPO_ROOT + path.sep) && fs.existsSync(keyPath),
    'Goal 1 freeze key must be an existing file inside the repository');
  const frozen = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  failUnless(frozen.type === 'GOAL1_PRE_RUN_PROJECT_REFERENCE_FREEZE'
    && frozen.status === 'FROZEN_GOAL_1', 'Invalid Goal 1 reference freeze status/type');
  const at = Date.parse(frozen.frozen_at || '');
  failUnless(Number.isFinite(at), 'Goal 1 freeze must have a valid frozen_at timestamp');
  const referenceSha = sha256(keyPath);
  const frozenHashes = [
    ['manifest_sha256', 'manifest.csv'],
    ['atomic_assertions_sha256', 'atomic-assertions.csv'],
    ['fixture_hashes_sha256', 'fixture-hashes.sha256'],
    ['condition_authority_sha256', 'goal1-condition-authority.json'],
    ['deterministic_scorer_sha256', 'score-deterministic.cjs']
  ];
  for (const [key, name] of frozenHashes) {
    failUnless(/^[0-9a-f]{64}$/i.test(frozen[key] || '')
      && frozen[key].toLowerCase() === sha256(path.join(BENCHMARK, name)),
    `Goal 1 freeze ${key} mismatch: source/labels/authority/scorer changed after freeze`);
  }
  failUnless(frozen.template_sha256 === templateHash, 'Goal 1 freeze official-template hash mismatch');
  failUnless(/^[0-9a-f]{40}$/i.test(frozen.app_commit || ''),
    'Goal 1 freeze missing production source commit');
  const attestationPath = path.resolve(REPO_ROOT, frozen.review_attestation_path || '');
  failUnless(attestationPath.startsWith(REPO_ROOT + path.sep)
    && fs.existsSync(attestationPath)
    && /^[0-9a-f]{64}$/i.test(frozen.independent_review_attestation_sha256 || '')
    && sha256(attestationPath) === frozen.independent_review_attestation_sha256,
  'Goal 1 freeze independent-review attestation file missing or changed');
  failUnless(frozen.planned_case_families === 25
    && frozen.planned_fixture_conditions === fixtures.size
    && frozen.planned_atomic_assertions === assertions.length,
  'Goal 1 freeze planned families/fixture conditions/assertion denominator mismatch');
  const sourceFixtureHashes = frozen.fixture_sha256 || {};
  failUnless(Object.keys(sourceFixtureHashes).length === fixtures.size,
    'Goal 1 freeze fixture hash map incomplete');
  for (const [id, item] of fixtures) {
    failUnless(sourceFixtureHashes[id] === item.sha256, `Goal 1 freeze fixture ${id} changed`);
    failUnless(item.human_label_review === 'VERIFIED' && item.human_label_reviewer
      && Number.isFinite(Date.parse(item.human_label_reviewed_at))
      && Date.parse(item.human_label_reviewed_at) <= at,
    `Goal 1 freeze lacks independent pre-run manifest review for ${id}`);
  }
  for (const a of assertions) {
    failUnless(a.review_status === 'VERIFIED' && a.reviewer
      && Number.isFinite(Date.parse(a.reviewed_at)) && Date.parse(a.reviewed_at) <= at,
    `Goal 1 freeze lacks independently reviewed assertion ${a.assertion_id}`);
  }
  for (const row of observations) {
    failUnless(row.benchmark_run_mode === 'OFFICIAL'
      && row.reference_freeze_sha256 === referenceSha,
    `Observation ${row.fixture_id}: development output or wrong frozen-reference SHA cannot become official`);
    failUnless(row.app_commit.toLowerCase() === frozen.app_commit.toLowerCase(),
      `Observation ${row.fixture_id}: production source commit differs from pre-run freeze`);
    failUnless(Date.parse(row.measured_at) > at,
      `Observation ${row.fixture_id}: recorded before reference freeze`);
  }
  return { valid: true, frozen_at: frozen.frozen_at, detail: 'Reference source SHA and pre-run UTC order checked; actual reviewer independence must still be authenticated' };
}

function sourceScope(row) {
  return row.measurement_scope || 'LEGACY_UNSCOPED';
}

function classify(signal, row) {
  if (row.observation_status === 'ERROR' || row.check_error) {
    return { status: 'ERROR', detail: row.check_error || row.observation_status || 'No completed observation' };
  }
  if (row.observation_status !== 'SUCCESS') {
    return { status: 'UNASSESSABLE', detail: `No completed technical classification: ${row.observation_status || 'unknown'}` };
  }
  const scope = sourceScope(row);
  const localPdf = scope.includes('PDF_TEMPLATE_ISOLATED') || scope === 'LEGACY_UNSCOPED';
  const gateway = scope.includes('FILECHECK_GATEWAY_MOCK') || scope === 'FILECHECK_LIVE_PROVIDER';
  let value;
  if (signal === 'access_denied') {
    // The production gateway maps all GoogleDriveUnavailableExceptions to Inaccessible;
    // neither a generic exception nor a simulated 403 establishes an actual Drive permission denial.
    if (scope !== 'FILECHECK_LIVE_PROVIDER' || row.provider_access_evidence !== 'DRIVE_HTTP_403')
      return { status: 'NOT_MEASURED', detail: 'Real provider 403 permission evidence not supplied; gateway mock is not access proof' };
    if (row.filecheck_status !== 'BLOCKED' || row.technical_flag !== 'Inaccessible')
      return { status: 'UNASSESSABLE', detail: 'Provider evidence contradicts observed FileCheckService status/flag' };
    value = row.access_denied;
  } else if (GATEWAY_FLAGS.has(signal)) {
    if (!gateway) return { status: 'NOT_MEASURED', detail: `${signal} requires actual FileCheckService gateway/mock output` };
    const flag = GATEWAY_FLAGS.get(signal);
    if (row.filecheck_status === 'UNAVAILABLE')
      return { status: 'UNASSESSABLE', detail: 'FileCheckService provider unconfigured' };
    if (row[signal] === 'true' && (row.filecheck_status !== 'BLOCKED' || row.technical_flag !== flag))
      return { status: 'UNASSESSABLE', detail: `${signal} positive does not match the actual service flag` };
    // Other BLOCKED flags do not demonstrate a negative: MIME/access checks can short-circuit
    // before FileCheckService reaches the size or download-permission branch.
    if (row[signal] === 'false' && row.filecheck_status === 'BLOCKED' && row.technical_flag !== flag)
      return { status: 'NOT_MEASURED', detail: `${signal} branch bypassed by ${row.technical_flag}` };
    value = row[signal];
  } else if (signal === 'filename_ignored') {
    if (!gateway || row.filecheck_status !== 'COMPLETED'
        || !String(row.gateway_mock_evidence || '').includes('metadata.name=HolidayRecipes.txt')
        || row.technical_flag !== 'PDF Verified')
      return { status: 'NOT_MEASURED', detail: 'Misleading-name fixture needs completed real FileCheckService response against explicitly mocked filename/valid PDF MIME' };
    value = row.filename_ignored;
  } else if (signal === 'no_template') {
    if (!localPdf || row.readable !== 'true')
      return { status: 'NOT_MEASURED', detail: 'No-template status requires a readable isolated PDF and mapping configuration' };
    value = row.template_mapped === 'false' ? 'true' : row.template_mapped === 'true' ? 'false' : '';
  } else if (signal === 'template_available') {
    if (!localPdf || row.readable !== 'true')
      return { status: 'NOT_MEASURED', detail: 'Template availability not established without readable PDF' };
    value = row.template_available;
  } else if (signal === 'template_only') {
    if (!localPdf) return { status: 'NOT_MEASURED', detail: 'Template comparison not run by isolated PDF inspector' };
    if (row.readable !== 'true') return { status: 'UNASSESSABLE', detail: 'PDF not readable' };
    if (row.template_mapped === 'false' || row.template_available !== 'true')
      return { status: 'NOT_MEASURED', detail: 'No mapped/available template comparison' };
    value = row.template_only;
  } else if (signal.startsWith('missing_heading:')) {
    if (!localPdf) return { status: 'NOT_MEASURED', detail: 'Template headings require isolated PDF comparison' };
    if (row.readable !== 'true') return { status: 'UNASSESSABLE', detail: 'PDF not readable' };
    if (row.template_mapped === 'false' || row.template_available !== 'true') {
      return { status: 'NOT_MEASURED', detail: 'No template comparison performed' };
    }
    value = String(row.missing_template_headings || '').split(';').map(s => s.trim())
      .includes(signal.slice('missing_heading:'.length)) ? 'true' : 'false';
  } else if (INSPECTED_SIGNALS.has(signal)) {
    if (!localPdf) return { status: 'NOT_MEASURED', detail: `${signal} not observed via local PDF bytes` };
    if (signal !== 'readable' && row.readable === '' && row[signal] === '')
      return { status: 'NOT_MEASURED', detail: `${signal} not observed after failed or unavailable PDF parse` };
    value = row[signal];
  } else throw new Error(`Unsupported frozen signal: ${signal}`);
  if (value !== 'true' && value !== 'false')
    return { status: 'UNASSESSABLE', detail: `Missing or non-boolean observation: ${signal}` };
  return { status: 'COMPLETED', value: value === 'true' };
}

function score(observations, assertions = readCsv(ASSERTIONS), options = {}) {
  if (!Array.isArray(assertions)) {
    options = assertions;
    assertions = readCsv(ASSERTIONS);
  }
  options ||= {};
  const { templateHash, fixtures } = fixtureAuthority();
  const observationMap = getUnique(observations, 'fixture_id', 'observation fixture');
  const assertionMap = getUnique(assertions, 'assertion_id', 'assertion');
  const families = new Set(assertions.map(a => a.fixture_id.slice(0, 6)));
  const manifestFamilies = new Set([...fixtures.keys()].map(id => id.slice(0, 6)));
  const observationFamilies = new Set([...observationMap.keys()].map(id => id.slice(0, 6)));
  const observedCommits = new Set();
  const scopeCounts = {};
  for (const [id, item] of observationMap) {
    failUnless(fixtures.has(id), `Unregistered observation fixture: ${id}`);
    failUnless(item.fixture_sha256 === fixtures.get(id).sha256, `Observation ${id}: fixture hash does not match frozen input`);
    failUnless(item.template_sha256 === templateHash, `Observation ${id}: official template hash mismatch`);
    failUnless(/^[0-9a-f]{40}$/i.test(item.app_commit || '') && item.code_state === 'TRACKED_FILECHECK_CLEAN'
      && item.measured_at && !Number.isNaN(Date.parse(item.measured_at)),
      `Observation ${id}: missing verified clean Document Check commit or measurement timestamp`);
    observedCommits.add(item.app_commit.toLowerCase());
    const scope = sourceScope(item);
    failUnless(['PDF_TEMPLATE_ISOLATED', 'FILECHECK_GATEWAY_MOCK',
      'PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK', 'FILECHECK_LIVE_PROVIDER',
      'LEGACY_UNSCOPED'].includes(scope), `Observation ${id}: unknown measurement scope ${scope}`);
    scopeCounts[scope] = (scopeCounts[scope] || 0) + 1;
    if (item.measurement_scope) {
      failUnless(item.benchmark_run_mode === 'DEVELOPMENT' || item.benchmark_run_mode === 'OFFICIAL',
        `Observation ${id}: must explicitly identify DEVELOPMENT versus OFFICIAL run mode`);
      if (item.benchmark_run_mode === 'DEVELOPMENT')
        failUnless(!item.reference_freeze_sha256,
          `Observation ${id}: development probe cannot claim a frozen official reference`);
      if (item.benchmark_run_mode === 'OFFICIAL')
        failUnless(/^[0-9a-f]{64}$/i.test(item.reference_freeze_sha256 || ''),
          `Observation ${id}: official run lacks pre-run frozen key SHA`);
      failUnless(item.observation_status === 'SUCCESS' || item.observation_status === 'ERROR'
        || item.observation_status === 'UNAVAILABLE', `Observation ${id}: invalid technical run status`);
      failUnless(item.file_size_bytes && Number.isSafeInteger(Number(item.file_size_bytes))
        && Number(item.file_size_bytes) >= 0,
      `Observation ${id}: fixture physical byte length missing`);
      const physicalSize = require('node:fs').statSync(path.resolve(__dirname, fixtures.get(id).file)).size;
      failUnless(Number(item.file_size_bytes) === physicalSize,
        `Observation ${id}: actual fixture size cannot be replaced by simulated gateway metadata`);
      if (scope.includes('FILECHECK_GATEWAY_MOCK')) {
        const completedFilenameCase = item.filename_ignored === 'true'
          && item.filecheck_status === 'COMPLETED' && item.technical_flag === 'PDF Verified'
          && item.gateway_mock_evidence?.includes('metadata.name=HolidayRecipes.txt');
        failUnless(item.gateway_mock_evidence
          && (item.filecheck_status === 'BLOCKED' || completedFilenameCase),
          `Observation ${id}: gateway mock requires actual FileCheckService blocked or verified filename-acceptance response`);
        failUnless(item.source_mime_type?.startsWith('MOCK:'),
          `Observation ${id}: mocked MIME type must be labelled as simulated`);
        if (item.file_too_large === 'true')
          failUnless(Number(item.mock_metadata_size_bytes) > Number(item.file_limit_bytes),
            `Observation ${id}: size flag lacks out-of-limit simulated metadata`);
      }
      if (item.observation_status === 'SUCCESS' && item.check_error)
        throw new Error(`Observation ${id}: a completed classification cannot have an infrastructure check_error`);
    }
  }
  failUnless(observedCommits.size <= 1, 'Mixed production Document Check code commits cannot share a scoring run');
  const bySignal = {};
  const rows = [];
  let correct = 0;
  let completed = 0;
  for (const assertion of assertionMap.values()) {
    failUnless(fixtures.has(assertion.fixture_id), `Assertion fixture absent from manifest: ${assertion.fixture_id}`);
    failUnless(assertion.expected === 'true' || assertion.expected === 'false', `Invalid expected boolean: ${assertion.assertion_id}`);
    failUnless(assertion.authority, `Missing authority: ${assertion.assertion_id}`);
    const observedRow = observationMap.get(assertion.fixture_id);
    const classification = observedRow
      ? classify(assertion.signal, observedRow)
      : { status: 'NOT_RUN', detail: 'Fixture has no recorded observation' };
    const expected = assertion.expected === 'true';
    const match = classification.status === 'COMPLETED' ? expected === classification.value : false;
    if (classification.status === 'COMPLETED') completed++;
    if (match) correct++;
    const signalGroup = bySignal[assertion.signal] ??= { TP: 0, TN: 0, FP: 0, FN: 0, unassessable: 0 };
    const confusion = classification.status !== 'COMPLETED' ? null
      : expected ? (classification.value ? 'TP' : 'FN') : (classification.value ? 'FP' : 'TN');
    if (confusion) signalGroup[confusion]++;
    else signalGroup.unassessable++;
    rows.push({
      assertion_id: assertion.assertion_id, fixture_id: assertion.fixture_id,
      signal: assertion.signal, expected, observed: classification.status === 'COMPLETED' ? classification.value : null,
      status: classification.status, matches_expected: match, confusion, detail: classification.detail || '',
      fixture_sha256: fixtures.get(assertion.fixture_id).sha256,
      observation_timestamp: observedRow?.measured_at || null,
      app_commit: observedRow?.app_commit || null,
      human_label_review: assertion.review_status,
      measurement_scope: observedRow ? sourceScope(observedRow) : null,
      filecheck_status: observedRow?.filecheck_status || null,
      technical_flag: observedRow?.technical_flag || null
    });
  }
  for (const group of Object.values(bySignal)) {
    group.precision = metric(group.TP, group.TP + group.FP);
    group.recall = metric(group.TP, group.TP + group.FN);
    group.false_positive_rate = metric(group.FP, group.FP + group.TN);
    group.false_negative_rate = metric(group.FN, group.FN + group.TP);
  }
  const allLabelsReviewed = labelsReviewed(assertions, 'deterministic');
  const allFixtureLabelsReviewed = [...fixtures.values()].every(item => item.human_label_review === 'VERIFIED'
    && item.human_label_reviewer && !Number.isNaN(Date.parse(item.human_label_reviewed_at)));
  const preRunKey = allLabelsReviewed && allFixtureLabelsReviewed && assertions.every(item => {
    const observation = observationMap.get(item.fixture_id);
    const fixture = fixtures.get(item.fixture_id);
    return !observation || (Date.parse(item.reviewed_at) <= Date.parse(observation.measured_at)
      && Date.parse(fixture.human_label_reviewed_at) <= Date.parse(observation.measured_at));
  });
  const freeze = preRunFreeze(options, observations, assertions, fixtures, templateHash);
  const absentVariants = REQUIRED_VARIANTS.filter(id => !fixtures.has(id) || !assertions.some(a => a.fixture_id === id));
  const missingFamilyLabels = Array.from({ length: REQUIRED_FAMILIES }, (_, i) =>
    `STD-${String(i + 1).padStart(2, '0')}`).filter(id => !families.has(id) || !manifestFamilies.has(id));
  const unassertedManifestFixtures = [...fixtures.keys()].filter(id => !assertions.some(a => a.fixture_id === id));
  const missingObservedFixtures = [...fixtures.keys()].filter(id => !observationMap.has(id));
  const allPlannedCases = missingFamilyLabels.length === 0 && absentVariants.length === 0
    && unassertedManifestFixtures.length === 0;
  // All scheduled attempts can be complete even when the production checker cannot classify
  // some assertions. Those failures remain *inside* the primary denominator and may yield
  // a legitimate below-target research result after provenance/human gates are met.
  const completeExecution = allPlannedCases && missingObservedFixtures.length === 0
    && observations.length === fixtures.size && assertions.length > 0;
  const providerEndToEnd = observations.length > 0 && observations.every(row =>
    sourceScope(row) === 'FILECHECK_LIVE_PROVIDER' && row.provider_evidence_verified === 'true');
  const finalGate = allPlannedCases && preRunKey && freeze.valid
    && completeExecution && providerEndToEnd;
  return {
    type: 'STD_SYNTHETIC_DETERMINISTIC_ENGINEERING_SCORE',
    status: finalGate ? 'ELIGIBLE_FOR_RESEARCH_REVIEW' : 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT',
    scope: 'OFFLINE_PDF_INSPECTOR_TEMPLATE_COMPARATOR_WITH_EXPLICIT_GATEWAY_SIMULATION',
    limitations: [
      'Local PDF bytes do not establish Drive permission, sharing, metadata MIME, or provider size.',
      'Simulated FileCheckService gateway branches test production code behavior against mocked metadata/errors, not a real permission-denied or oversized Drive file.',
      'Component assertion agreement is not the SMART Goal 1 end-to-end Document Check accuracy result.',
      'Reviewer metadata requires authentic independent verification before a research claim.'
    ],
    gate: {
      planned_case_families: REQUIRED_FAMILIES, prepared_case_families: families.size,
      manifest_case_families: manifestFamilies.size,
      observed_case_families: observationFamilies.size,
      full_case_family_coverage: allPlannedCases,
      independent_human_labels_verified_before_run: preRunKey,
      verified_pre_run_reference_freeze: freeze.valid,
      reference_frozen_at: freeze.frozen_at,
      reference_freeze_detail: freeze.detail,
      complete_execution: completeExecution,
      all_fixtures_attempted_even_if_checks_failed: completeExecution,
      all_assertions_classified: completed === assertions.length,
      complete_provider_drive_document_check: providerEndToEnd,
      measurement_scopes: scopeCounts,
      unasserted_manifest_fixtures: unassertedManifestFixtures,
      missing_observation_fixtures: missingObservedFixtures,
      required_split_or_paired_variants: REQUIRED_VARIANTS,
      missing_required_variants: absentVariants,
      missing_planned_case_families: missingFamilyLabels
    },
    denominators: {
      frozen_applicable_assertions: assertions.length,
      completed_assertions: completed,
      failed_or_unassessable_assertions: assertions.length - completed
    },
    assertion_accuracy: metric(correct, assertions.length),
    execution_coverage: metric(completed, assertions.length),
    confusion_by_signal: bySignal,
    assertions: rows
  };
}

if (require.main === module) {
  try {
    const inputIndex = process.argv.indexOf('--observations');
    const outputIndex = process.argv.indexOf('--output');
    const freezeIndex = process.argv.indexOf('--freeze');
    failUnless(inputIndex > 0 && process.argv[inputIndex + 1],
      'Usage: node score-deterministic.cjs --observations <fresh-observation.csv> [--freeze <actual-pre-run-frozen-key.json>] [--output <report.json>]');
    failUnless(freezeIndex < 0 || process.argv[freezeIndex + 1], '--freeze requires an existing frozen-key JSON path');
    const report = score(readCsv(process.argv[inputIndex + 1]), readCsv(ASSERTIONS),
      freezeIndex < 0 ? {} : { freezePath: process.argv[freezeIndex + 1] });
    const json = JSON.stringify(report, null, 2) + '\n';
    if (outputIndex > 0) {
      failUnless(process.argv[outputIndex + 1], '--output requires a JSON path');
      failUnless(!fs.existsSync(process.argv[outputIndex + 1]), 'Refusing to overwrite an earlier scoring report');
      fs.writeFileSync(process.argv[outputIndex + 1], json);
    } else process.stdout.write(json);
  } catch (error) {
    console.error(`BENCHMARK NOT SCORED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { score, classify };
