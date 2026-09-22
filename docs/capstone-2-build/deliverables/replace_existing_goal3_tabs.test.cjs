'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'replace_existing_goal3_tabs.gs'), 'utf8');
function fakeEnvironment({approve = true, wrongHeaders = false, corruptArchive = false} = {}) {
  const actions = [];
  class Sheet {
    constructor(name, values, owner) {
      this.name = name;
      this.rows = values.map(row => [...row]);
      this.owner = owner;
      this.notes = {};
    }
    getName() { return this.name; }
    setName(name) {
      assert(!this.owner.sheets.some(sheet => sheet !== this && sheet.name === name));
      this.name = name; actions.push('rename:' + name); return this;
    }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(1, ...this.rows.map(row => row.length)); }
    getDataRange() { return {getValues: () => this.rows.map(row => [...row]), getFormulas: () => this.rows.map(row => row.map(() => ''))}; }
    getRange(...args) {
      const sheet = this;
      const key = args[0];
      return {
        getValue() { return sheet.rows[0]?.[0] ?? ''; },
        setValues(rows) {
          assert(typeof key === 'number');
          if (key === 1) sheet.rows = rows.map(row => [...row]);
          return this;
        },
        getValues() { return sheet.rows.map(row => [...row]); },
        setFormula(text) { sheet.formula = text; return this; },
        setDataValidation() { return this; },
        setFontWeight() { return this; },
        setBackground() { return this; },
        setFontColor() { return this; },
        setWrap() { return this; },
        setNote(text) { sheet.notes[key] = text; return this; },
      };
    }
    copyTo(owner) {
      const clone = new Sheet('Copy of ' + this.name, this.rows, owner);
      if (corruptArchive && this.name === 'Objective 3 Task Log') clone.rows[1][1] = 'unexpected';
      owner.sheets.push(clone);
      actions.push('copied:' + this.name);
      return clone;
    }
    hideSheet() { this.hidden = true; actions.push('hidden:' + this.name); return this; }
    setFrozenRows() {}
    setColumnWidth() {}
  }
  const ss = {
    name: 'WildTrack MVP Evaluation - Responses',
    sheets: [],
    getName() {return this.name;},
    getSheetByName(name) {return this.sheets.find(sheet => sheet.name === name) || null;},
    insertSheet(name) {
      const sheet = new Sheet(name, [], this);
      this.sheets.push(sheet);
      actions.push('inserted:' + name);
      return sheet;
    },
    deleteSheet(sheet) {
      assert(this.sheets.includes(sheet));
      this.sheets.splice(this.sheets.indexOf(sheet), 1);
      actions.push('deleted:' + sheet.getName());
    },
  };
  ss.sheets.push(new Sheet('Form Responses 1', [
    ['Timestamp', 'Consent', 'Role'], ['2026-09-19 7:15', 'Yes, I agree', 'Student'],
  ], ss));
  ss.sheets.push(new Sheet('Objective 3 Task Log', [
    [wrongHeaders ? 'unexpected' : 'task_observation_id', 'consent_confirmed', 't1_pass'],
    ['OLD-001', true, false],
  ], ss));
  ss.sheets.push(new Sheet('Objective 3 Protocol', [
    [wrongHeaders ? 'unexpected' : 'WildTrack Objective 3', 'Student submission transaction correctness'],
    ['T1 - Initial submission', 'Legacy protocol'], ['T2 - Material revision', 'Legacy edit task'],
  ], ss));
  const rawSource = ss.getSheetByName('Form Responses 1');
  const rawSnapshot = JSON.stringify(rawSource.rows);
  const logs = [];
  const globals = {
    console: {log: message => logs.push(message)},
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => ({
        ButtonSet: {YES_NO: 'YES_NO'},
        Button: {YES: 'YES'},
        alert: () => approve ? 'YES' : 'NO',
      }),
      newDataValidation: () => ({
        requireValueInList() {return this;},
        setAllowInvalid() {return this;},
        build() {return {};},
      }),
      flush() {},
    },
    LockService: {getDocumentLock: () => ({tryLock: () => true, releaseLock: () => actions.push('unlock')})},
    Utilities: {formatDate: () => '20260922-094500'},
    Session: {getScriptTimeZone: () => 'Asia/Manila'},
  };
  const context = vm.createContext(globals);
  vm.runInContext(source + '\n globalThis.calls = {previewGoal3TabReplacement, replaceGoal3TabsInExistingSheet};', context);
  return {ss, actions, logs, calls: context.calls, rawSnapshot, rawSource};
}

test('read-only preview sees the original tabs and real response source', () => {
  const env = fakeEnvironment();
  const info = env.calls.previewGoal3TabReplacement();
  assert.equal(info.existingTaskLogEnteredRows, 1);
  assert.equal(info.existingFormResponseRows, 1);
  assert.deepEqual(env.actions, []);
  assert.equal(env.rawSnapshot, JSON.stringify(env.rawSource.rows));
});
test('declining confirmation does not mutate any sheet or source', () => {
  const env = fakeEnvironment({approve: false});
  env.calls.replaceGoal3TabsInExistingSheet();
  assert.deepEqual(env.actions, []);
  assert.equal(env.rawSnapshot, JSON.stringify(env.rawSource.rows));
});
test('unexpected v1 headers cause preflight rejection BEFORE any changes', () => {
  const env = fakeEnvironment({wrongHeaders: true});
  assert.throws(() => env.calls.replaceGoal3TabsInExistingSheet(), /already been replaced or edited/);
  assert.deepEqual(env.actions, []);
});
test('archive content mismatch halts before deleting original tabs', () => {
  const env = fakeEnvironment({corruptArchive: true});
  assert.throws(() => env.calls.replaceGoal3TabsInExistingSheet(), /Archive verification FAILED/);
  assert.equal(env.ss.getSheetByName('Objective 3 Task Log').rows[1][1], true);
  assert(env.ss.getSheetByName('Objective 3 Protocol'));
  assert(!env.actions.some(item => item.startsWith('deleted:')));
  assert.equal(env.rawSnapshot, JSON.stringify(env.rawSource.rows));
});
test('replaces only the two active Goal 3 tabs AFTER preserving hidden archives', () => {
  const env = fakeEnvironment();
  env.calls.replaceGoal3TabsInExistingSheet();
  assert.equal(env.rawSnapshot, JSON.stringify(env.rawSource.rows));
  assert.equal(env.ss.getSheetByName('Objective 3 Task Log').getRange('A1').getValue(), 'observation_id');
  assert.equal(env.ss.getSheetByName('Objective 3 Protocol').getRange('A1').getValue(), 'WildTrack Objective 3 - REVISED');
  const archives = env.ss.sheets.filter(sheet => sheet.name.startsWith('ARCHIVE Obj3'));
  assert.equal(archives.length, 2);
  assert(archives.every(sheet => sheet.hidden));
  const legacyLog = archives.find(sheet => sheet.name.includes('Task Log'));
  assert.equal(legacyLog.rows[1][0], 'OLD-001');
  assert.deepEqual(legacyLog.rows[1].slice(1), [true, false]);
  const firstDelete = env.actions.findIndex(item => item.startsWith('deleted:'));
  assert(firstDelete > env.actions.findIndex(item => item.startsWith('hidden:ARCHIVE Obj3 old Protocol')));
  assert(firstDelete > env.actions.findIndex(item => item.startsWith('inserted:__GOAL3_V2_NEW_PROTOCOL__')));
  const newLog = env.ss.getSheetByName('Objective 3 Task Log');
  assert(newLog.formula.includes('(M2:M="PASS")'));
  assert(!newLog.formula.includes('(N2:N="PASS")')); // readback is supporting only
  for (const column of ['D', 'F', 'P', 'Q']) {
    assert(newLog.formula.includes('(' + column + '2:' + column + '<>"")'));
  }
  assert.throws(() => env.calls.replaceGoal3TabsInExistingSheet(), /already been replaced or edited/);
});
test('migration script cannot create Form or directly edit the Form response tab', () => {
  assert.doesNotMatch(source, /\bFormApp\b/);
  assert.doesNotMatch(source, /getSheetByName\(GOAL3_TABS_V2\.RAW\)\.clear/);
  assert.doesNotMatch(source, /deleteSheet\(.*RAW/);
});
