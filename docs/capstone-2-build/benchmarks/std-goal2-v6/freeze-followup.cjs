'use strict';

/**
 * One-time, project-defined reference freeze for a NEW, isolated Goal 2 experiment.
 * This script NEVER calls Gemini, creates reviewer identities, or changes a reference
 * after observing a provider report. Running this script does NOT certify correctness.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../../..');
const TYPE = 'GOAL2_V6_PRE_RUN_PROJECT_REFERENCE_FREEZE';
const METHOD = 'PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW';
const HASH64 = /^[0-9a-f]{64}$/i;
const HASH40 = /^[0-9a-f]{40}$/i;
const fail = (check, detail) => { if (!check) throw new Error(detail); };
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const hashFile = file => hash(fs.readFileSync(file));
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function within(base, candidate, description) {
  fail(typeof candidate === 'string' && candidate && !path.isAbsolute(candidate),
    `${description}: relative file path required`);
  const target = path.resolve(base, candidate);
  fail(target.startsWith(base + path.sep) && fs.statSync(target).isFile(),
    `${description}: file must exist inside ${base}`);
  const realBase = fs.realpathSync(base);
  const realTarget = fs.realpathSync(target);
  fail(realTarget.startsWith(realBase + path.sep),
    `${description}: symbolic link may not resolve outside isolated synthetic benchmark folder`);
  return target;
}

function sourceConfig(manifest) {
  const file = key => manifest[key] || manifest.source_files?.[key];
  const instructions = manifest.instructions;
  const mapped = instructions?.mapped?.filename || instructions?.mapped?.file;
  const noTemplateGeneric = instructions?.no_template_generic?.filename;
  const noTemplateExplicit = instructions?.no_template_explicit?.filename;
  return {
    instructions: {
      mapped: mapped || file('instructions_filename') || 'STD_V6_INSTRUCTIONS.txt',
      no_template_generic: noTemplateGeneric || 'NO_TEMPLATE_GENERIC_INSTRUCTIONS.txt',
      no_template_explicit: noTemplateExplicit || 'NO_TEMPLATE_EXPLICIT_INSTRUCTIONS.txt'
    },
    template: manifest.template_filename || manifest.template?.filename
      || file('official_template') || file('template_file') || 'fixtures/G2-01.pdf'
  };
}

function fixturesOf(manifest) {
  const cases = manifest.fixtures || manifest.cases;
  fail(Array.isArray(cases) && cases.length > 0, 'Manifest requires a nonempty fixtures/cases array');
  const ids = new Set();
  return cases.map((fixture, index) => {
    const id = fixture.fixture_id || fixture.case_id;
    fail(/^G2-\d{2}(?:-[a-z0-9-]+)?$/.test(id || '') && !ids.has(id),
      `Invalid or duplicated fixture ID at row ${index + 1}`);
    ids.add(id);
    return { ...fixture, fixture_id: id,
      filename: fixture.filename || fixture.file || fixture.pdf_file };
  });
}

function sourceTextFile(manifest, fixture) {
  return fixture.source_text_file || fixture.extracted_text_file
    || `source-text/${fixture.fixture_id}.txt`;
}

/** Return exact expected input/source hashes; no PDF/network access is made. */
function validatePlan(options = {}) {
  const directory = path.resolve(options.directory || HERE);
  fail(directory === HERE, 'Goal 2 v6 freeze is restricted to its isolated benchmark directory');
  const manifestPath = within(directory, 'manifest.json', 'manifest');
  const manifest = readJson(manifestPath);
  const referencePath = within(directory, 'REFERENCE.json', 'separate pre-run project-defined reference');
  const reference = readJson(referencePath);
  const fixtures = fixturesOf(manifest);
  fail(manifest.status === 'PREPARED_BEFORE_ANY_V6_PROVIDER_ATTEMPT'
    && manifest.official_template_is_safe_synthetic === true
    && manifest.planned_attempts === 10 && fixtures.length === 10,
  'Only the prospectively prepared new ten-case fictional synthetic v6 reference can be frozen');
  fail(reference.status === 'PROJECT_DEFINED_SOURCE_REFERENCE_PREPARED_NOT_RUN_FROZEN'
    && reference.no_provider_output_available_at_preparation === true
    && reference.previous_pilot_results_not_used_for_labels === true
    && /NOT_INDEPENDENT_HUMAN/.test(reference.method || ''),
  'Reference must remain the documented project-defined pre-run AI-assisted record, not retroactive human-ground-truth');
  const config = sourceConfig(manifest);
  const instructionsPath = Object.fromEntries(Object.entries(config.instructions)
    .map(([key, file]) => [key, within(directory, file, `${key} configured instructions`)]));
  const templatePath = within(directory, config.template, 'mapped official template');
  const instructions = Object.fromEntries(Object.entries(instructionsPath)
    .map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));
  const templateHash = hashFile(templatePath);
  fail(Object.values(instructions).every(s => s.trim()), 'Every configured instruction must be nonempty');
  fail(!reference.reference_method || reference.reference_method === METHOD,
    'Reference may only claim project-defined AI-assisted method; no invented human reviewer');
  const suppliedDecisions = Array.isArray(reference.decisions)
    ? reference.decisions : fixtures.flatMap(f => (f.expected_decisions || []).map(d => ({
      ...d, fixture_id: f.fixture_id
    })));
  const decisions = suppliedDecisions.map(d => ({
      ...d,
      rationale: d.reference_rationale || d.rationale,
      source_kind: d.source_kind || (d.authority_source === 'official_template' || d.authority_source === 'template'
        ? 'official_template' : d.authority_source === 'deliverable_instructions' || d.authority_source === 'instructions'
          ? 'deliverable_instructions' : 'pdf'),
      source_excerpt: d.source_excerpt || d.authority_excerpt || d.document_evidence_excerpt,
      source_reference: d.source_reference || d.filename || d.fixture_id
    }));
  fail(Array.isArray(decisions) && decisions.length > 0,
    'A nonempty pre-run binary issue/clean checklist is required');
  const decisionIds = new Set();
  const caseIds = fixtures.map(f => f.fixture_id);
  const caseSet = new Set(caseIds);
  const fixtureSha = {};
  const sourceTextSha = {};
  const fixtureText = {};
  for (const item of fixtures) {
    const file = within(directory, item.filename, item.fixture_id + ' PDF');
    fail(file.toLowerCase().endsWith('.pdf') && path.relative(directory, file).split(path.sep)[0] === 'fixtures',
      `${item.fixture_id}: only new isolated synthetic fixtures/ PDFs may be sent to Gemini`);
    fail(item.synthetic !== false && manifest.synthetic_only !== false,
      `${item.fixture_id}: only explicitly fictional synthetic fixtures are allowed`);
    const actual = hashFile(file);
    fail(HASH64.test(item.sha256 || '') && item.sha256.toLowerCase() === actual,
      `${item.fixture_id}: fixture bytes do not match prepared manifest SHA-256`);
    fixtureSha[item.fixture_id] = actual;
    const sourcePath = path.join(directory, sourceTextFile(manifest, item));
    if (fs.existsSync(sourcePath)) {
      const source = within(directory, sourceTextFile(manifest, item),
        item.fixture_id + ' PDFBox-extracted PDF text');
      const raw = fs.readFileSync(source, 'utf8');
      fail(raw.trim(), `${item.fixture_id}: missing/non-readable extracted source text`);
      sourceTextSha[item.fixture_id] = hashFile(source);
      if (item.source_text_sha256)
        fail(item.source_text_sha256 === sourceTextSha[item.fixture_id],
          `${item.fixture_id}: extracted text SHA drift`);
      fixtureText[item.fixture_id] = raw;
    }
  }
  const templateTextPath = path.join(directory, manifest.template_text_file || 'source-text/OFFICIAL_TEMPLATE.txt');
  const templateText = fs.existsSync(templateTextPath) ? fs.readFileSync(templateTextPath, 'utf8') : '';
  const templateTextSha = templateText ? hashFile(templateTextPath) : null;
  const registryFile = within(directory, manifest.source_text_hashes_filename || 'source-text-hashes.json',
    'PDFBox-extracted source text SHA registry');
  const registry = readJson(registryFile);
  fail(Array.isArray(registry.entries) && registry.entries.length === fixtures.length + 1,
    'PDFBox source-text registry must contain every planned PDF and template');
  const seenText = new Set();
  for (const entry of registry.entries) {
    fail(!seenText.has(entry.fixture_id), 'Duplicate extracted-text registry ID');
    seenText.add(entry.fixture_id);
    const mapped = entry.fixture_id === 'SAFE_SYNTHETIC_MAPPED_TEMPLATE';
    const pdfSha = mapped ? templateHash : fixtureSha[entry.fixture_id];
    const textSha = mapped ? templateTextSha : sourceTextSha[entry.fixture_id];
    fail(pdfSha && textSha && entry.source_pdf_sha256 === pdfSha && entry.sha256 === textSha,
      `Source-text registry does not match frozen PDF/text SHA for ${entry.fixture_id}`);
    fail(hashFile(within(directory, entry.filename, 'registered PDFBox text')) === textSha,
      `Extracted text changed for ${entry.fixture_id}`);
  }
  fail(templateTextSha && Object.keys(sourceTextSha).length === fixtures.length,
    'Every source PDF and template must have pre-frozen PDFBox-extracted text');
  const decisionCount = new Map(caseIds.map(id => [id, 0]));
  for (const d of decisions) {
    fail(d && typeof d.decision_id === 'string' && d.decision_id.trim()
      && !decisionIds.has(d.decision_id), 'Reference has a missing/duplicate decision_id');
    decisionIds.add(d.decision_id);
    fail(caseSet.has(d.fixture_id), `Reference decision ${d.decision_id}: unknown fixture`);
    fail(['present', 'absent'].includes(d.expected),
      `Reference decision ${d.decision_id}: expected must be present/absent`);
    fail(d.criterion && d.rationale && d.source_excerpt && d.source_reference
      && ['pdf', 'official_template', 'deliverable_instructions'].includes(d.source_kind),
      `Reference decision ${d.decision_id}: missing criterion, rationale, or source proof`);
    const fixture = fixtures.find(f => f.fixture_id === d.fixture_id);
    const inManifest = (fixture.expected_decisions || []).find(row => row.decision_id === d.decision_id);
    fail(inManifest
      && inManifest.expected === d.expected && inManifest.criterion === d.criterion
      && inManifest.authority_source === d.authority_source
      && inManifest.authority_excerpt === d.authority_excerpt
      && inManifest.document_evidence_excerpt === d.document_evidence_excerpt
      && inManifest.reference_rationale === d.reference_rationale
      && d.source_pdf_sha256 === fixtureSha[d.fixture_id]
      && d.template_mapped === fixture.template_mapped
      && d.instructions_filename === fixture.instructions_filename,
    `Reference decision ${d.decision_id}: the separate pre-run decision differs from the fixture manifest/source context`);
    fail(d.source_kind !== 'official_template' || fixture.template_mapped !== false,
      `Reference decision ${d.decision_id}: cannot use an unmapped template as authority`);
    const instructionName = fixture.instructions_filename || manifest.instructions_filename
      || config.instructions.mapped;
    const instructionKey = Object.entries(config.instructions)
      .find(([, filename]) => filename === instructionName)?.[0];
    const suppliedInstruction = instructions[instructionKey];
    fail(suppliedInstruction, `${fixture.fixture_id}: unknown instructions_key`);
    const authority = d.source_kind === 'pdf' ? fixtureText[d.fixture_id]
      : d.source_kind === 'official_template' ? templateText : suppliedInstruction;
    if (authority) fail(normalize(authority).includes(normalize(d.source_excerpt)),
      `Reference decision ${d.decision_id}: exact excerpt not in actually supplied source`);
    // The PDF evidence is a different input from the authority excerpt; both must be
    // checked when PDFBox source text is available, never conflate the two.
    if (d.document_evidence_excerpt && fixtureText[d.fixture_id])
      fail(normalize(fixtureText[d.fixture_id]).includes(normalize(d.document_evidence_excerpt)),
        `Reference decision ${d.decision_id}: PDF evidence quote not found in submitted PDF`);
    decisionCount.set(d.fixture_id, decisionCount.get(d.fixture_id) + 1);
  }
  fail([...decisionCount.values()].every(n => n > 0),
    'Every planned fixture requires at least one PRE-RUN issue/clean binary decision');
  return {
    directory, manifest, reference, decisions, fixtures, caseIds, fixtureSha, sourceTextSha,
    manifest_sha256: hashFile(manifestPath), reference_sha256: hashFile(referencePath),
    instructions_sha256: Object.fromEntries(Object.entries(instructionsPath)
      .map(([key, file]) => [key, hashFile(file)])), template_sha256: templateHash,
    template_text_sha256: templateTextSha, source_text_hashes_sha256: hashFile(registryFile),
    sourceText: fixtureText, templateText, instructions
  };
}

function freeze(options = {}) {
  fail(options.output && typeof options.output === 'string',
    'Usage: node freeze-followup.cjs --output <NEW frozen-key.json> --runner <new JUnit runner Java file> --provider-cache-version <actual version>');
  const output = path.resolve(options.output);
  fail(output.startsWith(ROOT + path.sep) && !fs.existsSync(output),
    'Freeze output must be NEW inside the repository: existing frozen data cannot be overwritten');
  const prepared = validatePlan(options);
  fail(options.runner && options.providerCacheVersion,
    'Exact runner Java source and real provider cache version are mandatory before freeze');
  const runner = path.resolve(options.runner);
  fail(runner.startsWith(ROOT + path.sep)
    && runner.endsWith('.java') && fs.statSync(runner).isFile(),
    'Runner must be the existing opt-in Java source inside repository');
  const scorer = path.join(HERE, 'score-followup.cjs');
  fail(fs.existsSync(scorer), 'Freeze cannot precede creation of deterministic scorer');
  const git = (...args) => cp.execFileSync('git', args,
    { cwd: ROOT, encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  fail(HASH40.test(commit), 'Source commit must be exact Git HEAD SHA-1');
  const clean = git('status', '--porcelain', '--untracked-files=no', '--',
    'backend/src/main/java/com/capvault/backend/aireview',
    path.relative(ROOT, runner), path.relative(ROOT, scorer),
    path.relative(ROOT, path.join(HERE, 'manifest.json')),
    path.relative(ROOT, path.join(HERE, 'REFERENCE.json')));
  fail(!clean, 'Commit production reviewer, runner, scorer and reference source before official freeze');
  const preparationFiles = [
    'backend/src/main/java/com/capvault/backend/aireview',
    'backend/src/main/java/com/capvault/backend/filecheck/PdfInspector.java',
    path.relative(ROOT, runner),
    path.relative(ROOT, HERE)
  ];
  const pending = git('status', '--porcelain', '--untracked-files=all', '--', ...preparationFiles);
  fail(!pending, 'All new fictional PDFs, PDFBox extracts, rules, runner, scorer and production reviewer must be COMMITTED before freeze');
  fail(options.promptVersion === 'wildtrack-academic-review-v5',
    'This isolated follow-up evaluates production v5 only, never rewrites earlier v3/v4 outcomes');
  fail(options.model === 'gemini-3.1-flash-lite',
    'Unexpected provider model for pre-run reference');
  fail(/^gemini-3\.1-flash-lite:/.test(options.providerCacheVersion),
    'Provider cache version must be exact actual GeminiAiReviewProvider.cacheVersion()');
  const key = {
    type: TYPE, status: 'FROZEN_PROJECT_DEFINED', reference_method: METHOD,
    methodology_note: 'AI-assisted, project-defined pre-run binary decisions. NOT independent human/expert validation.',
    frozen_at: new Date().toISOString(), app_commit: commit,
    model: options.model, prompt_version: options.promptVersion,
    provider_cache_version: options.providerCacheVersion,
    manifest_sha256: prepared.manifest_sha256,
    reference_sha256: prepared.reference_sha256,
    protocol_sha256: hashFile(within(HERE, 'GOAL2_V6_EVALUATION_PROTOCOL.md',
      'prospectively declared v6 follow-up protocol')),
    instructions_sha256: prepared.instructions_sha256,
    template_sha256: prepared.template_sha256,
    template_text_sha256: prepared.template_text_sha256,
    source_text_hashes_sha256: prepared.source_text_hashes_sha256,
    fixture_sha256: prepared.fixtureSha, source_text_sha256: prepared.sourceTextSha,
    runner_sha256: hashFile(runner), score_sha256: hashFile(scorer),
    case_ids: prepared.caseIds, planned_case_count: prepared.caseIds.length,
    planned_decision_count: prepared.decisions.length,
    input_scope: 'New fictional synthetic STD PDFs; real Gemini provider plus production v5 postprocessor, NOT end-to-end Drive/UI/cache'
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(key, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return key;
}

if (require.main === module) {
  try {
    const value = key => { const idx = process.argv.indexOf('--' + key);
      return idx < 0 ? undefined : process.argv[idx + 1]; };
    const key = freeze({
      output: value('output'), runner: value('runner'),
      providerCacheVersion: value('provider-cache-version'),
      promptVersion: value('prompt-version'), model: value('model')
    });
    console.log(`Goal 2 v6 project reference FROZEN before provider requests at ${key.frozen_at}; `
      + 'no manual reviewer or provider run was claimed.');
  } catch (error) {
    console.error('GOAL 2 V6 NOT FROZEN: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { freeze, validatePlan, fixturesOf, sourceConfig, sourceTextFile,
  hash, hashFile, normalize, within, TYPE, METHOD, HERE, ROOT };
