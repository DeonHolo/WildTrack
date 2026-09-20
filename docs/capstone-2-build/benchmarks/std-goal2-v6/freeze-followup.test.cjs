'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./freeze-followup.cjs');

test('new planned synthetic Goal2 cohort source+PDFBox extracts are fully bound without running Gemini', () => {
  const prepared = f.validatePlan();
  assert.deepEqual(prepared.caseIds, Array.from({ length: 10 },
    (_, i) => `G2-${String(i + 1).padStart(2, '0')}`));
  assert.equal(prepared.decisions.length, 10);
  assert.equal(Object.keys(prepared.fixtureSha).length, 10);
  assert.equal(Object.keys(prepared.sourceTextSha).length, 10);
  assert.match(prepared.template_text_sha256, /^[0-9a-f]{64}$/);
  assert.match(prepared.source_text_hashes_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(prepared.instructions_sha256).sort(),
    ['mapped', 'no_template_explicit', 'no_template_generic']);
  assert.deepEqual(prepared.fixtures.filter(v => !v.template_mapped).map(v => v.fixture_id),
    ['G2-09', 'G2-10']);
  assert.equal(prepared.reference.previous_pilot_results_not_used_for_labels, true);
  assert.equal(prepared.reference.no_provider_output_available_at_preparation, true);
  for (const decision of prepared.decisions) {
    const item = prepared.fixtures.find(v => v.fixture_id === decision.fixture_id);
    assert.equal(decision.expected === 'present' || decision.expected === 'absent', true);
    assert.equal(item.sha256, prepared.fixtureSha[decision.fixture_id]);
    assert.equal(item.source_text_sha256, prepared.sourceTextSha[decision.fixture_id]);
    assert.equal(decision.source_kind === 'official_template' && !item.template_mapped, false);
  }
});

test('fixture ID uniqueness and unsafe/duplicate source paths cannot become a pre-run key', () => {
  assert.throws(() => f.fixturesOf({ fixtures: [
    { fixture_id: 'G2-01', filename: 'fixtures/a.pdf' },
    { fixture_id: 'G2-01', filename: 'fixtures/b.pdf' }
  ] }), /duplicated fixture ID/i);
  assert.throws(() => f.fixturesOf({ fixtures: [
    { fixture_id: 'STD-01', filename: 'fixtures/a.pdf' }
  ] }), /Invalid or duplicated fixture ID/);
  assert.throws(() => f.within(f.HERE, '../std/results/goal2-20260921/frozen-key.json',
    'historical source'), /inside|file must exist/);
});

test('ordinary tests never create a frozen project reference or infer reviewer identity', () => {
  assert.throws(() => f.freeze({}), /--output/);
  const existing = path.join(f.HERE, 'manifest.json');
  const earlierHash = f.hashFile(existing);
  assert.throws(() => f.freeze({ output: existing }), /must be NEW/);
  assert.equal(f.hashFile(existing), earlierHash);
  const actualFreeze = path.join(f.HERE, 'results', 'frozen-key.json');
  assert.equal(fs.existsSync(actualFreeze), false,
    'No future run/review key is fabricated by the offline test suite');
});

test('source claim checks use exact configured instruction and PDF excerpts, not arbitrary quote strings', () => {
  const plan = f.validatePlan();
  const first = plan.decisions[0];
  assert.equal(plan.instructions.mapped.toLowerCase().replace(/\s+/g, ' ')
    .includes(first.source_excerpt.toLowerCase().replace(/\s+/g, ' ')), true);
  assert.equal(f.normalize(plan.sourceText[first.fixture_id])
    .includes(f.normalize(first.document_evidence_excerpt)), true);
  assert.equal(f.normalize(plan.sourceText[first.fixture_id])
    .includes(f.normalize('A fabricated quote never supplied by the fictional PDF')), false);
});
