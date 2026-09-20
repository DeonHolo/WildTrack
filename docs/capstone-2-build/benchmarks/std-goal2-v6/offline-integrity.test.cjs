'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {scenarios,bodyHeads,NOTICE,TEMPLATE,MAPPED,NO_TEMPLATE,NO_TEMPLATE_EXPLICIT,
  hash,canon,extracted}=require('./generate-fixtures.cjs');
const ROOT=__dirname;
const json=relative=>JSON.parse(fs.readFileSync(path.join(ROOT,relative),'utf8'));
const doc=relative=>fs.readFileSync(path.join(ROOT,relative));
const manifest=json('manifest.json');
const reference=json('REFERENCE.json');
const hashes=json('source-text-hashes.json');
const pdfs=[TEMPLATE,...manifest.fixtures.map(e=>e.filename)];
let observations;
function inspect(){
  if(!observations)observations=extracted(pdfs.map(name=>path.join(ROOT,name)));
  return observations;
}
const text=filename=>inspect().get(path.basename(filename)).text;
const decisions=()=>manifest.fixtures.flatMap(e=>e.expected_decisions.map(d=>({...d,fixture_id:e.fixture_id})));

test('strictly new 10-case v6 identity; five positive issue and five clean controls',()=>{
  assert.equal(manifest.benchmark_id,'std-goal2-v6');
  assert.equal(reference.benchmark_id,'std-goal2-v6');
  assert.equal(manifest.planned_attempts,10);
  assert.equal(manifest.fixtures.length,10);
  assert.deepEqual(manifest.fixtures.map(row=>row.fixture_id),
    Array.from({length:10},(_,i)=>'G2-'+String(i+1).padStart(2,'0')));
  assert.equal(new Set(manifest.fixtures.map(row=>row.filename)).size,10);
  assert.equal(new Set(decisions().map(row=>row.decision_id)).size,10);
  assert.equal(decisions().filter(row=>row.expected==='present').length,5);
  assert.equal(decisions().filter(row=>row.expected==='absent').length,5);
  assert.equal(manifest.status,'PREPARED_BEFORE_ANY_V6_PROVIDER_ATTEMPT');
  assert.equal(reference.status,'PROJECT_DEFINED_SOURCE_REFERENCE_PREPARED_NOT_RUN_FROZEN');
  assert.equal(reference.no_provider_output_available_at_preparation,true);
  assert.equal(reference.decisions.length,10);
  assert.ok(!Object.hasOwn(manifest,'actual_provider_score'));
  assert.equal(manifest.official_template_is_safe_synthetic,true);
});

test('all 11 isolated new PDF files and mapped inputs are byte-hash-locked to manifest',()=>{
  assert.equal(manifest.template_filename,TEMPLATE);
  assert.equal(manifest.template_sha256,hash(doc(TEMPLATE)));
  assert.equal(manifest.template.sha256,manifest.template_sha256);
  assert.equal(manifest.instructions_filename,MAPPED);
  for(const [key,name] of [
    ['mapped',MAPPED],['no_template_generic',NO_TEMPLATE],['no_template_explicit',NO_TEMPLATE_EXPLICIT]
  ]){
    assert.equal(manifest.instructions[key].filename,name);
    assert.equal(manifest.instructions[key].sha256,hash(doc(name)));
  }
  for(const row of manifest.fixtures) {
    assert.ok(/^fixtures\/G2-\d\d_[a-z0-9-]+\.pdf$/.test(row.filename));
    assert.equal(row.sha256,hash(doc(row.filename)));
    assert.equal(row.expected_decisions.length,1);
    assert.ok(row.expected_observation.length>=20);
    assert.ok(row.instructions_filename===MAPPED||
      row.instructions_filename===NO_TEMPLATE||
      row.instructions_filename===NO_TEMPLATE_EXPLICIT);
    assert.equal(row.template_mapped,row.instructions_filename===MAPPED);
  }
});

test('actual PDFBox text was extracted from every safe PDF and retained with its source hashes',()=>{
  assert.equal(inspect().size,11);
  assert.equal(hashes.entries.length,11);
  assert.equal(manifest.source_text_hashes_sha256,hash(doc('source-text-hashes.json')));
  const template=hashes.entries.find(x=>x.fixture_id==='SAFE_SYNTHETIC_MAPPED_TEMPLATE');
  assert.ok(template);
  assert.equal(template.filename,'source-text/OFFICIAL_TEMPLATE.txt');
  for(const row of hashes.entries) {
    const parsed=inspect().get(path.basename(row.source_pdf_filename));
    assert.ok(parsed&&parsed.pages>=1);
    assert.equal(row.source_pdf_sha256,hash(doc(row.source_pdf_filename)));
    assert.equal(row.sha256,hash(doc(row.filename)));
    assert.equal(doc(row.filename).toString('utf8'),parsed.text);
    assert.ok(canon(parsed.text).includes(canon(NOTICE)));
    assert.doesNotMatch(parsed.text,/@gmail|2526-sem|capvault|schedEase/i);
  }
  for(const row of manifest.fixtures){
    const source=hashes.entries.find(x=>x.fixture_id===row.fixture_id);
    assert.ok(source);
    assert.equal(row.source_text_filename,source.filename);
    assert.equal(row.source_text_sha256,source.sha256);
  }
});

test('every predeclared decision quote appears in extracted PDF and actually supplied authority',()=>{
  const byId=new Map(reference.decisions.map(d=>[d.fixture_id,d]));
  assert.equal(byId.size,10);
  for(const row of manifest.fixtures) {
    const declared=row.expected_decisions[0];
    const stored=byId.get(row.fixture_id);
    assert.ok(stored);
    assert.equal(stored.decision_id,declared.decision_id);
    assert.equal(stored.source_pdf_sha256,row.sha256);
    assert.equal(stored.template_mapped,row.template_mapped);
    assert.equal(stored.instructions_filename,row.instructions_filename);
    assert.equal(stored.source_excerpt_verified_with_pdfbox,true);
    assert.ok(canon(text(row.filename)).includes(canon(declared.document_evidence_excerpt)),
      'document excerpt not in PDF '+row.fixture_id);
    const permitted=declared.authority_source==='official_template'?
      text(TEMPLATE):doc(row.instructions_filename).toString('utf8');
    assert.ok(canon(permitted).includes(canon(declared.authority_excerpt)),
      'authority excerpt missing from supplied source '+row.fixture_id);
    assert.ok(stored.reference_rationale.length>=30);
    assert.ok(['present','absent'].includes(stored.expected));
  }
});

test('body-vs-TOC, present-but-empty and optionals match controlled source layout',()=>{
  const intro='1.1 System Overview';
  const section='1.2 Test Approach';
  const count=(name,term)=>text(manifest.fixtures.find(x=>x.fixture_id===name).filename)
    .split(/\r?\n/).filter(line=>line.trim()===term||line.trim().startsWith(term+' ........')).length;
  assert.equal(count('G2-01',section),2,'positive control TOC and body');
  assert.equal(count('G2-02',section),0,'fully omitted TOC and body');
  assert.equal(count('G2-03',section),1,'TOC entry without body');
  assert.equal(count('G2-04',section),2,'present body heading with incomplete content');
  assert.ok(text(manifest.fixtures[3].filename).includes(
    'PLACEHOLDER: The fictional test approach has not been written'));
  assert.equal(count('G2-05','2.2 Optional Illustration (Optional)'),0);
  assert.ok(text(manifest.fixtures[4].filename).includes(intro));
  assert.ok(doc(MAPPED).toString('utf8').includes('is optional and may be omitted'));
});

test('template example identity, wrong document and injected instruction stay source-scoped',()=>{
  const official=text(TEMPLATE);
  assert.ok(official.includes('SampleHarbor'));
  assert.ok(!text(manifest.fixtures.find(x=>x.fixture_id==='G2-06').filename).includes('SampleHarbor'));
  assert.ok(text(manifest.fixtures.find(x=>x.fixture_id==='G2-06').filename).includes('Project: QueueBoard'));
  assert.ok(text(manifest.fixtures.find(x=>x.fixture_id==='G2-07').filename).includes('Marketing Campaign Plan'));
  assert.ok(text(manifest.fixtures.find(x=>x.fixture_id==='G2-08').filename).includes('Quantum Ledger Certification'));
  assert.ok(!official.includes('Quantum Ledger Certification'));
  assert.ok(!doc(MAPPED).toString('utf8').includes('Quantum Ledger Certification'));
});

test('no-template controls cannot silently inherit mapped-template instructions',()=>{
  const nine=manifest.fixtures.find(e=>e.fixture_id==='G2-09');
  const ten=manifest.fixtures.find(e=>e.fixture_id==='G2-10');
  assert.equal(nine.template_mapped,false);
  assert.equal(ten.template_mapped,false);
  assert.equal(nine.instructions_filename,NO_TEMPLATE);
  assert.equal(ten.instructions_filename,NO_TEMPLATE_EXPLICIT);
  assert.ok(doc(NO_TEMPLATE_EXPLICIT).toString('utf8').includes(
    'explicitly requires a BODY section named "Test Approach"'));
  assert.ok(!doc(NO_TEMPLATE).toString('utf8').includes('explicitly requires a BODY section'));
  assert.ok(!text(ten.filename).split(/\r?\n/).some(line=>
    line.trim()==='Test Approach'||line.trim()==='1.2 Test Approach'));
});

test('generator remains isolated and create-only with no provider/old source dependencies',()=>{
  const script=doc('generate-fixtures.cjs').toString('utf8');
  assert.ok(script.includes('Refusing to overwrite a previously generated v6 PDF'));
  assert.ok(script.includes('Refusing to overwrite an existing v6 manifest/reference'));
  assert.equal(scenarios.length,10);
  assert.equal(bodyHeads.length,11);
  assert.doesNotMatch(script,/require\([^)]*(?:old|\/std\/|\/srs\/|Gemini|score-ai|provider-responses)/i);
});
