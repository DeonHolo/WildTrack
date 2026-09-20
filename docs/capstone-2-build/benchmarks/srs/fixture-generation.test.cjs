'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spec, heading, caseData, htmlFor, SYNTHETIC } = require('./generate-fixtures.cjs');
const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function one(type) { return spec.find(item => item.type === type); }
function sectionExists(type, key) { return caseData(type).find(item => item.key === key).body; }
function tocExists(type, key) { return caseData(type).find(item => item.key === key).toc; }

test('six distinct wholly synthetic cases have a single sanitized template mapping', () => {
  assert.equal(spec.length, 6);
  assert.equal(new Set(spec.map(item => item.id)).size, 6);
  assert.equal(manifest.status, 'PLANNED_EXPECTATIONS_NO_OBSERVED_CHECKER_SCORES');
  assert.equal(manifest.synthetic_only, true);
  assert.equal(manifest.official_template_standin, 'fixtures/SRS-01_template-only.pdf');
  assert.equal(manifest.fixtures.length, 6);
  assert.ok(manifest.fixtures.every(item =>
    item.synthetic && item.mapped_template === 'SRS-01_template-only.pdf' &&
    typeof item.expected_observation === 'string' && item.expected_observation.length > 20));
});

test('heading inventory is anchored to representative SRS template sections', () => {
  for (const key of ['intro', 'purpose', 'scope', 'terms', 'refs', 'overall',
    'perspective', 'users', 'constraints', 'assumptions', 'specifics', 'interfaces',
    'hardware', 'software', 'communications', 'functional', 'module', 'transaction',
    'useCase', 'activity', 'wireframe', 'nfr', 'performance', 'security', 'reliability']) {
    assert.ok(heading[key], 'missing template representative ' + key);
  }
  assert.equal(heading.constraints, '2.4. Constraints');
  assert.equal(heading.communications, '3.1.3. Communications interfaces');
  assert.equal(heading.nfr, '3.4 Non-functional requirements');
});

test('template-only fixture has headings but no fictional completed requirements', () => {
  assert.ok(caseData('template_only').every(s => s.toc && s.body &&
    s.text.startsWith('PLACEHOLDER:')));
  assert.ok(htmlFor(one('template_only')).includes('for QueueLab (fictional sample)'));
});

test('completed is a synthetic populated control, never actual completed student work', () => {
  const populated = caseData('completed');
  assert.ok(populated.every(s => s.toc && s.body && !s.text.includes('PLACEHOLDER:')));
  assert.match(populated.find(s => s.key === 'functional').text, /FR-01:/);
  assert.match(populated.find(s => s.key === 'security').text, /NFR-02:/);
  assert.match(htmlFor(one('completed')), /SYNTHETIC NON-STUDENT BENCHMARK/);
});

test('partial case retains real fictional content and two explicit unfilled areas', () => {
  const partial = caseData('partial');
  assert.ok(partial.find(s => s.key === 'purpose').text.startsWith('Document the QueueLab'));
  for (const key of ['constraints', 'functional']) {
    assert.equal(partial.find(s => s.key === key).body, true);
    assert.match(partial.find(s => s.key === key).text, /PLACEHOLDER/);
  }
  assert.equal(partial.filter(s => s.text.includes('PLACEHOLDER:')).length, 2);
});

test('TOC-only heading is present in contents but absent from body; section-missing removes both', () => {
  assert.equal(tocExists('toc_only', 'constraints'), true);
  assert.equal(sectionExists('toc_only', 'constraints'), false);
  const tocOnlyHtml = htmlFor(one('toc_only'));
  assert.equal((tocOnlyHtml.match(/2\.4\. Constraints/g) || []).length, 1);
  assert.equal(tocExists('section_missing', 'communications'), false);
  assert.equal(sectionExists('section_missing', 'communications'), false);
  assert.equal(sectionExists('section_missing', 'hardware'), true);
  assert.equal(sectionExists('section_missing', 'software'), true);
  assert.ok(!htmlFor(one('section_missing')).includes(heading.communications));
});

test('bogus-requirement injection occurs only in submitted body and cannot become template authority', () => {
  const attack = caseData('bogus').find(s => s.key === 'functional').text;
  assert.match(attack, /UNTRUSTED DOCUMENT-EMBEDDED EVALUATOR INSTRUCTION/);
  assert.match(attack, /Section 4 Quantum Registry Certification/);
  assert.ok(!htmlFor(one('template_only')).includes('Quantum Registry'));
  assert.ok(!htmlFor(one('completed')).includes('Quantum Registry'));
  assert.ok(!fs.readFileSync(path.join(root, 'SRS_AI_INSTRUCTIONS.txt'), 'utf8')
    .includes('Quantum Registry'));
});

test('generated files exist, are PDFs with matching manifest hashes, and contain no private text in authored HTML', () => {
  const forbidden = [/capvault/i, /skysync/i, /wheels on go/i, /2526-sem/i,
    /@(?:gmail|yahoo|outlook)\./i, /student number\s*[:=]\s*\d/i];
  for (const item of spec) {
    const authored = htmlFor(item);
    assert.ok(authored.includes(SYNTHETIC));
    for (const sensitive of forbidden) assert.doesNotMatch(authored, sensitive);
    const planned = manifest.fixtures.find(row => row.fixture_id === item.id);
    assert.ok(planned);
    const bytes = fs.readFileSync(path.join(root, 'fixtures', planned.filename));
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(bytes.length > 10000);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), planned.sha256);
  }
});
