'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'prepare_existing_response_analysis.gs'), 'utf8');
function load(extra = {}) {
  const context = vm.createContext({...extra, console: {log() {}}});
  vm.runInContext(source + '\n globalThis.underTest = {wildtrackHeaderMap_,wildtrackClassifyRow_,wildtrackSource_,previewWildTrackResponseAnalysis,prepareWildTrackResponseAnalysis};', context);
  return context.underTest;
}
const questions = [
  'Timestamp',
  'Do you voluntarily agree to participate in this WildTrack MVP evaluation and allow your questionnaire responses to be analyzed?',
  'Which role best describes the WildTrack workflow you can answer about today?',
  'Which best describes your WildTrack experience for this evaluation?',
  'Based on the WildTrack student workflow you just used, how clear was it where to find your current submission status?',
  'After submitting or editing a response, how clear was what WildTrack had saved and what you could do next?',
  'Is there anything about the WildTrack student workflow you would change or keep?',
  'Have you used or reviewed the current WildTrack adviser workflow enough to comment on it?',
  'Overall, how clear were the current review state and the actions available to you?',
  'Is there anything about the adviser workflow you would change or keep?',
  'Have you used or reviewed the current WildTrack Admin/beneficiary workflow enough to comment on it?',
  'Overall, how clear were the current state of the work and the actions available to you?',
  'Is there anything about the Admin/beneficiary workflow you would change or keep?',
];
const student = [
  new Date('2026-09-19T10:00:00Z'), 'Yes, I agree', 'Student',
  'I completed or attempted the controlled WildTrack student submission task for this evaluation',
  '1 - Not clear at all', '5 - Very clear', 'No private text here', '', '', '', '', '', '',
];
test('header mapping uses question identity, not physical position', () => {
  const {wildtrackHeaderMap_, wildtrackClassifyRow_} = load();
  const extended = questions.slice();
  const reordered = student.slice();
  extended.splice(4, 0, 'For this evaluation, did you complete both steps?');
  reordered.splice(4, 0, 'Completed both');
  const map = wildtrackHeaderMap_(extended);
  const record = wildtrackClassifyRow_(reordered, map, 22);
  assert.equal(record[0], 'Q-0022');
  assert.equal(record[3], 'CONS_Y');
  assert.equal(record[4], 'ROLE_STU');
  assert.equal(record[6], 1);
  assert.equal(record[7], 5);
  assert.equal(record[11], 'ELIGIBLE');
  assert.equal(record[12], 'YES'); // only presence, never copies raw comments
  assert(!JSON.stringify(record).includes('No private text'));
});
test('blank consent and incomplete routed questions are NOT invented participants', () => {
  const {wildtrackHeaderMap_, wildtrackClassifyRow_} = load();
  const map = wildtrackHeaderMap_(questions);
  const unknown = student.slice();
  unknown[1] = '';
  assert.equal(wildtrackClassifyRow_(unknown, map, 2)[11], 'NEEDS_REVIEW');
  const incomplete = student.slice();
  incomplete[5] = '';
  assert.equal(wildtrackClassifyRow_(incomplete, map, 3)[11], 'NEEDS_REVIEW');
  const declined = student.slice();
  declined[1] = 'No, I do not agree';
  declined[2] = '';
  assert.equal(wildtrackClassifyRow_(declined, map, 4)[11], 'DECLINED');
  const noUse = student.slice();
  noUse[2] = 'I have not used or reviewed WildTrack enough to answer about one of these roles';
  assert.equal(wildtrackClassifyRow_(noUse, map, 5)[11], 'NO_USE');
});
test('ambiguous or missing survey headers abort before touching sheets', () => {
  const {wildtrackHeaderMap_} = load();
  assert.throws(() => wildtrackHeaderMap_(questions.slice(0, 3)), /Expected exactly one/);
  assert.throws(() => wildtrackHeaderMap_(questions.concat(questions[4])), /Expected exactly one/);
});
test('preview reads existing Form_Responses without creating or changing any sheet', () => {
  const values = [questions, [], student];
  let modifications = 0;
  const raw = {
    getName: () => 'Form_Responses',
    getLastRow: () => values.length,
    getLastColumn: () => questions.length,
    getRange(row, col, countRows, countCols) {
      return {
        getValues: () => values.slice(row - 1, row - 1 + countRows)
          .map(v => Array.from({length: countCols}, (_, i) => v[col - 1 + i] ?? '')),
        setValues: () => {modifications++; throw new Error('Do not write to raw');},
      };
    },
  };
  const spreadsheet = {
    getSheetByName: name => name === 'Form_Responses' ? raw : null,
    insertSheet: () => {modifications++; throw new Error('No new sheets in preview');},
  };
  const {previewWildTrackResponseAnalysis} = load({
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet},
  });
  const counts = previewWildTrackResponseAnalysis();
  assert.equal(counts.ELIGIBLE, 1);
  assert.equal(counts.NEEDS_REVIEW, 0);
  assert.equal(modifications, 0);
});
