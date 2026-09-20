'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { catalog, designs, newFiles, NOTICE, hash } = require('./generate-goal1-additional-fixtures.cjs');

const source = __dirname;
const root = path.resolve(source, '../../../..');
const folder = path.join(source, 'fixtures');
const metadata = JSON.parse(fs.readFileSync(path.join(source, 'goal1-condition-authority.json'), 'utf8'));
const allManifest = fs.readFileSync(path.join(source, 'manifest.csv'), 'utf8');
const allHashes = fs.readFileSync(path.join(source, 'fixture-hashes.sha256'), 'utf8');
// This is the last committed pre-expansion source revision. Using HEAD would
// compare the current enlarged catalog against itself after the new fixtures
// are committed, erasing our ability to verify the eleven frozen old entries.
const PRE_GOAL1_BASELINE = '70fbf3a057b09a88fe165eece819dc4348a6fc9c';

function invoke(exe,args,opts={}) {
  const out = spawnSync(exe,args,{
    encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,cwd:root,...opts
  });
  if(out.error||out.status!==0) throw new Error(exe+' failed: '+String(out.error||out.stderr||out.stdout));
  return out.stdout;
}
function old(name) {
  return invoke('git',['show',PRE_GOAL1_BASELINE+':docs/capstone-2-build/benchmarks/std/'+name]);
}
function csv(line) {
  const result=[];let token='';let quoted=false;
  for(let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"') {
      if(quoted&&line[i+1]==='"'){token+='"';i++;}
      else quoted=!quoted;
    } else if(c===','&&!quoted){result.push(token);token='';}
    else token+=c;
  }
  result.push(token);
  assert.equal(quoted,false,'unterminated CSV quote');
  return result;
}
function rows() {
  const list=allManifest.trimEnd().split(/\r?\n/).slice(1).map(csv);
  assert.ok(list.every(row=>row.length===9));
  return list;
}
function inspectionMap() {
  const home=process.env.USERPROFILE||process.env.HOME;
  assert.ok(home,'Local PDFBox classpath requires USERPROFILE/HOME');
  const base=path.join(home,'.m2','repository','org','apache','pdfbox');
  const jars=['pdfbox','pdfbox-io','fontbox'].map(n=>path.join(base,n,'3.0.3',n+'-3.0.3.jar'));
  jars.push(path.join(home,'.m2','repository','commons-logging','commons-logging','1.3.5','commons-logging-1.3.5.jar'));
  assert.ok(jars.every(file=>fs.existsSync(file)),'Cached PDFBox 3.0.3 unavailable: no fake PDF assertions');
  const files=[...new Set([...newFiles(),'STD-06-control_default-style.pdf'])].map(name=>path.join(folder,name));
  const text=invoke(process.env.JAVA||'java',['-cp',jars.join(path.delimiter),'--source','21',
    path.join(source,'goal1-inspect-pdfs.java'),...files]);
  const result=new Map();
  for(const line of text.trim().split(/\r?\n/)) {
    const [filename,status,pages,characters,encoded]=line.split('|');
    assert.ok(encoded!==undefined,'Unexpected PDFBox response: '+line.slice(0,100));
    result.set(filename,{status,pages:Number(pages),characters:Number(characters),
      text:Buffer.from(encoded,'base64').toString('utf8')});
  }
  assert.equal(result.size,files.length);
  return result;
}
// One PDFBox process inspects all fresh PDFs; no Gemini, network, or original private PDF.
let inspections;
function inspect(name) {return (inspections??=inspectionMap()).get(name);}

test('old frozen manifest/hash prefixes are unchanged, including official template and old PDF bytes',()=>{
  const priorManifest=old('manifest.csv');
  const priorHashes=old('fixture-hashes.sha256');
  // Git blobs store LF while this Windows working-tree CSV originally used
  // CRLF. Compare its original checkout representation, not a line-ending
  // artifact introduced by git show.
  const originalCheckoutCsv=priorManifest.replace(/\r?\n/g,'\r\n');
  assert.ok(allManifest.startsWith(originalCheckoutCsv),'original eleven manifest entries were modified');
  assert.ok(allHashes.startsWith(priorHashes),'original official-template/ten-fixture SHA entries changed');
  const originalLines=priorHashes.trimEnd().split(/\r?\n/);
  assert.equal(originalLines.length,11);
  for(const record of originalLines) {
    const match=record.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match,'original SHA format');
    assert.equal(hash(fs.readFileSync(path.join(root,match[2]))),match[1],
      'original template/fixture bytes changed: '+match[2]);
  }
});

test('19 new planned conditions have distinct canonical IDs, pending human review, and 18 new filenames',()=>{
  const baseline=old('manifest.csv').trimEnd().split(/\r?\n/).length-1;
  const additions=rows().slice(baseline);
  assert.equal(baseline,11);
  assert.equal(additions.length,19);
  assert.equal(rows().length,30,'11 unchanged original conditions + 19 new conditions');
  assert.deepEqual(new Set(additions.map(row=>row[0])).size,19);
  assert.deepEqual(new Set(additions.map(row=>row[1])).size,18);
  assert.deepEqual(additions.filter(row=>row[0].startsWith('STD-19-')).map(row=>row[1]),
    ['fixtures/STD-19_incomplete-base.pdf','fixtures/STD-19_incomplete-base.pdf']);
  assert.ok(additions.every(row=>row[3]==='true'&&row[6]==='PENDING'&&row[7]===''&&row[8]===''));
  assert.ok(additions.every(row=>!row.join(' ').match(/^(VERIFIED|PASSED|HUMAN_APPROVED)$/i)));
  for(const [id,file] of catalog)assert.ok(additions.some(row=>row[0]===id&&row[1]==='fixtures/'+file));
  assert.ok(additions.some(row=>row[0]==='STD-06-control'));
});

test('all new actual bytes match newly appended SHA entries without overwriting old file entries',()=>{
  const prior=old('fixture-hashes.sha256').trimEnd().split(/\r?\n/).length;
  const fresh=allHashes.trimEnd().split(/\r?\n/).slice(prior);
  assert.equal(fresh.length,18);
  assert.equal(new Set(fresh).size,18);
  for(const entry of fresh) {
    const match=entry.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match);
    assert.ok(match[2].startsWith('docs/capstone-2-build/benchmarks/std/fixtures/STD-'));
    assert.equal(hash(fs.readFileSync(path.join(root,match[2]))),match[1]);
  }
  assert.deepEqual(new Set(fresh.map(row=>row.split('  ')[1])).size,18);
});

test('PDFBox finds 15 readable compact files, genuine password, corrupt, non-PDF; no real oversize/access claim',()=>{
  const actual=[...new Set([...newFiles(),'STD-06-control_default-style.pdf'])];
  assert.equal(actual.length,18);
  for(const filename of actual) {
    const result=inspect(filename);
    assert.ok(result,filename);
    if(filename==='STD-17_password-protected.pdf'){
      assert.equal(result.status,'ENCRYPTED');assert.equal(result.characters,0);
    }else if(filename==='STD-15_corrupt.pdf'){
      assert.equal(result.status,'CORRUPT');assert.equal(result.pages,0);
    }else if(filename==='STD-15_non-pdf.pdf'){
      assert.equal(result.status,'NOT_PDF');assert.equal(result.pages,0);
    }else{
      assert.equal(result.status,'READABLE',filename);
      assert.ok(result.pages>=1,filename);
      if(filename==='STD-14_minimal-text.pdf')assert.ok(result.text.trim().length<=20);
      else assert.ok(result.text.length>50,filename);
      assert.ok(result.text.length<100000,filename);
      if(!filename.startsWith('STD-16_')&&!filename.startsWith('STD-17-oversized')&&
          filename!=='STD-14_minimal-text.pdf')assert.ok(result.text.includes('FICTIONAL SYNTHETIC BENCHMARK ONLY'));
      assert.doesNotMatch(result.text,/capvault|schedEase|2526-sem2|@gmail\.com/i);
    }
  }
  for(const filename of ['STD-16_access-mock-reference.pdf','STD-17-oversized-metadata-reference.pdf'])
    assert.ok(fs.statSync(path.join(folder,filename)).size<1_000_000,
      filename+' is explicitly compact: not proof of a >25 MB PDF');
});

test('STD-06 default versus reformatted has identical invented words and changed physical pagination',()=>{
  const original=inspect('STD-06-control_default-style.pdf');
  const styled=inspect('STD-06_reformatted-complete.pdf');
  // PDFBox wraps an identical 'QR-04' token as 'QR- 04' on the larger-font
  // PDF, and long hyphenated strings may wrap at line boundaries.
  const canonical=t=>t.replace(/-\s+(?=[a-z0-9])/gi,'-').replace(/\s+/g,' ').trim();
  assert.equal(canonical(styled.text),canonical(original.text),'formatting variant must have the SAME text');
  assert.notEqual(styled.pages,original.pages,'pagination variation must be real');
  assert.ok(styled.pages>original.pages);
});

test('controlled section and explanatory contrasts survive real PDF text extraction',()=>{
  const half=inspect('STD-04_half-complete.pdf').text;
  assert.ok((half.match(/PLACEHOLDER:/g)||[]).length>=8);
  assert.ok(half.includes('QueueBoard is a fictional'));
  const empty=inspect('STD-13_one-section-empty.pdf').text;
  const expected=empty.indexOf('3.1.3 Expected Outputs & Pass/Fail Criteria',empty.indexOf('Table of Contents'));
  assert.ok(expected>=0);
  const second=empty.indexOf('3.1.3 Expected Outputs & Pass/Fail Criteria',expected+1);
  assert.ok(second>=0);
  assert.ok(empty.slice(second,second+160).includes('3.1.4 Test Procedure'),'existing heading, zero body');
  assert.ok(inspect('STD-20_embedded-instruction.pdf').text.includes('UNTRUSTED DOCUMENT TEXT'));
  assert.ok(inspect('STD-22_missing-traceability.pdf').text
    .replace(/-\s+(?=[a-z0-9])/gi,'-').replace(/\s+/g,' ')
    .includes('NO updated-SRS/feature-to-test mapping'));
  assert.ok(inspect('STD-23_happy-path-only.pdf').text.includes('ONLY the happy-path'));
  const unexplained=inspect('STD-25_unexplained-mismatch.pdf').text;
  const explained=inspect('STD-25_resolved-mismatch.pdf').text;
  assert.ok(unexplained.includes('FICTIONAL MISMATCH'));
  assert.ok(explained.includes('FICTIONAL MISMATCH'));
  assert.ok(unexplained.includes('NO INCIDENT EXPLANATION'));
  assert.ok(!unexplained.includes('SYNTHETIC PROPOSED RESOLUTION'));
  assert.ok(explained.replace(/\s+/g,' ').includes('SYNTHETIC PROPOSED RESOLUTION'));
});

test('paired STD-19 authority scenarios share exactly one PDF and differ only by explicit instructions',()=>{
  const cases=metadata.conditions.filter(item=>item.fixture_id.startsWith('STD-19-'));
  assert.equal(cases.length,2);
  assert.equal(cases[0].file,cases[1].file);
  assert.equal(cases[0].sha256,cases[1].sha256);
  assert.equal(cases[0].sha256,hash(fs.readFileSync(path.join(source,cases[0].file))));
  assert.ok(cases.every(item=>item.template_mapped===false&&item.human_label_review==='PENDING'));
  assert.ok(!cases[0].instructions.includes('must include a Test Approach section'));
  assert.ok(cases[1].instructions.includes('must include a Test Approach section'));
  assert.ok(inspect('STD-19_incomplete-base.pdf').text.includes('Test Approach'));
});

test('filename/access/oversize simulations are explicitly not reported as real gateway observations',()=>{
  const byId=new Map(metadata.conditions.map(item=>[item.fixture_id,item]));
  for(const id of ['STD-11','STD-16','STD-17-oversized']){
    const item=byId.get(id);
    assert.ok(item);
    assert.equal(item.status,'NOT_EXERCISED');
    assert.ok(item.mock_type.startsWith('FILECHECK_GATEWAY_'));
    assert.ok(item.limitation.length>25);
  }
  assert.equal(byId.get('STD-11').mock_mime_type,'application/pdf');
  assert.equal(byId.get('STD-16').mock_exception,'GoogleDriveUnavailableException');
  assert.equal(byId.get('STD-17-oversized').mock_metadata_size_expression,
    'GoogleDriveProperties.maximumFileSizeBytes() + 1');
  assert.ok(inspect('STD-16_access-mock-reference.pdf').status==='READABLE');
  assert.ok(inspect('STD-17-oversized-metadata-reference.pdf').status==='READABLE');
});

test('old generator is not a dependency and this new generator refuses to overwrite existing inputs',()=>{
  const script=fs.readFileSync(path.join(source,'generate-goal1-additional-fixtures.cjs'),'utf8');
  assert.doesNotMatch(script,/require\(['"]\.\/generate-fixtures\.cjs['"]\)/);
  assert.ok(script.includes('Create-only refusal'));
  assert.equal(designs.length,14);
  assert.ok(NOTICE.includes('NOT observed software execution'));
});
