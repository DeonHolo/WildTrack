'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('./score-lib.cjs');
const { score } = require('./score-ai-reference.cjs');

const benchmark = __dirname;
const pilot = path.join(benchmark, 'results/goal2-20260921');
const archive = path.join(benchmark, 'archives/goal2-20260921');
const sourceFields = [
  ['ai-checklist.csv', 'checklist_sha256'],
  ['manifest.csv', 'manifest_sha256'],
  ['fixture-hashes.sha256', 'fixture_hashes_sha256'],
  ['STD_AI_INSTRUCTIONS.txt', 'instructions_sha256'],
  ['GOAL2_REFERENCE_CHECKLIST.md', 'protocol_sha256']
];

test('the old Goal 2 source snapshot matches its own frozen key, not the expanded Goal 1 catalog', () => {
  const key = JSON.parse(fs.readFileSync(path.join(pilot, 'frozen-key.json'), 'utf8'));
  for (const [filename, field] of sourceFields)
    assert.equal(sha256(path.join(archive, filename)), key[field], `historic ${filename}`);
  assert.notEqual(sha256(path.join(benchmark, 'manifest.csv')), key.manifest_sha256,
    'new Goal 1 fixture rows must not silently alter old Goal 2 frozen reference');
});

test('archive-backed historic Goal 2 scorer reproduces the original published score exactly', () => {
  const inputPath = path.join(pilot, 'ai-run-record.json');
  const record = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const original = fs.readFileSync(path.join(pilot, 'ai-score.json'), 'utf8');
  assert.equal(JSON.stringify(score(record, { inputPath, sourceSnapshot: archive }), null, 2) + '\n',
    original);
  assert.throws(() => score(record, { inputPath }), /Frozen Goal 2 key mismatch/,
    're-scoring a historic pilot against the expanded Goal 1 catalog must fail closed');
});
