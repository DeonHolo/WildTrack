'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const folder = path.join(__dirname,'results/srs-followup-20260921');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
const saved = JSON.parse(fs.readFileSync(path.join(folder,'attempts.json'),'utf8'));
const frozen = JSON.parse(fs.readFileSync(path.join(folder,'frozen-key.json'),'utf8'));
const score = JSON.parse(fs.readFileSync(path.join(folder,'scenario-audit.json'),'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('all six source-safe SRS PDFs and project-defined reference were frozen before the real one-shot calls',()=>{
  assert.equal(manifest.fixtures.length,6);
  assert.equal(saved.attempts.length,6);
  assert.equal(frozen.methodology,'PROJECT_DEFINED_REFERENCE_AI_ASSISTED');
  assert.equal(sha(path.join(__dirname,'manifest.json')),frozen.manifest_sha256);
  assert.equal(sha(path.join(__dirname,'SOURCE_PROOF.md')),frozen.reference_sha256);
  assert.equal(sha(path.join(__dirname,'SRS_AI_INSTRUCTIONS.txt')),frozen.instructions_sha256);
  assert.equal(sha(path.join(__dirname,'fixtures/SRS-01_template-only.pdf')),frozen.template_sha256);
  for(const f of manifest.fixtures){
    assert.equal(sha(path.join(__dirname,'fixtures',f.filename)),f.sha256);
    assert.equal(frozen.fixture_sha256[f.fixture_id],f.sha256);
    const run=saved.attempts.find(a=>a.fixture_id===f.fixture_id);
    assert.ok(run);
    assert.ok(Date.parse(run.attempted_at)>Date.parse(frozen.frozen_at));
    assert.equal(run.app_commit,frozen.app_commit);
    assert.equal(run.fixture_sha256,f.sha256);
    assert.equal(run.generation_requests_sent,1);
    assert.equal(run.response_http_status,200);
    assert.equal(run.outcome,'fresh_success');
  }
});

test('all six actual raw HTTP/model/final WildTrack outputs are preserved with original SHA-256',()=>{
  for(const a of saved.attempts){
    const prefix=path.join(folder,a.fixture_id);
    assert.equal(sha(path.join(prefix,'raw-provider-response.json')),a.raw_provider_sha256);
    assert.equal(sha(path.join(prefix,'raw-report.json')),a.raw_report_sha256);
    assert.equal(sha(path.join(prefix,'production-filtered-report.json')),a.production_filtered_report_sha256);
    const parsed=JSON.parse(fs.readFileSync(path.join(prefix,'production-filtered-report.json'),'utf8'));
    assert.ok(Array.isArray(parsed.findings));
    assert.ok(Array.isArray(parsed.missingRequiredSections));
  }
});

test('the two missed SRS body sections are reported as not observed, without changing the old STD pilot',()=>{
  assert.equal(score.actual_fresh_provider_reports,6);
  assert.equal(score.observed_conditions,4);
  assert.equal(score.condition_denominator,6);
  for(const id of ['SRS-04','SRS-05']){
    assert.equal(score.rows.find(row=>row.fixture_id===id).observed,'criterion_not_observed');
  }
  const std=JSON.parse(fs.readFileSync(path.join(__dirname,'../std/results/goal2-20260921/ai-score.json'),'utf8'));
  assert.equal(std.checklist_agreement.numerator,7);
  assert.equal(std.checklist_agreement.denominator,10);
  assert.equal(std.claim_traceability.numerator,24);
  assert.equal(std.claim_traceability.denominator,43);
  const offline=cp.execFileSync(process.execPath,
    [path.join(__dirname,'evaluate-srs-followup.cjs'),'--verify'],{encoding:'utf8'});
  assert.match(offline,/4\/6/);
});
