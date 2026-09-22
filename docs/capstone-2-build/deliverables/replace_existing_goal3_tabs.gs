/**
 * ONE-TIME, OWNER-REQUESTED MIGRATION IN THE EXISTING RESPONSE SPREADSHEET.
 *
 * Run previewGoal3TabReplacement() first. Then run replaceGoal3TabsInExistingSheet()
 * in the Apps Script project BOUND TO the EXISTING WildTrack MVP Evaluation -
 * Responses spreadsheet. No Form is created/edited; Form Responses 1 is never
 * touched. The existing Objective 3 Task Log and Objective 3 Protocol are
 * copied to dated hidden archive sheets BEFORE the original active tabs are
 * removed; two new tabs with the original names are then installed.
 *
 * This is not the original create_wildtrack_mvp_evaluation.gs. NEVER rerun its
 * form/sheet creation methods. Do not share an existing restricted response
 * spreadsheet with people who should not see archived raw task evidence.
 */
const GOAL3_TABS_V2 = Object.freeze({
  RAW: 'Form Responses 1',
  LOG: 'Objective 3 Task Log',
  PROTOCOL: 'Objective 3 Protocol',
  NEW_LOG: '__GOAL3_V2_NEW_LOG__',
  NEW_PROTOCOL: '__GOAL3_V2_NEW_PROTOCOL__',
  ARCHIVE_LOG: 'ARCHIVE Obj3 old Task Log',
  ARCHIVE_PROTOCOL: 'ARCHIVE Obj3 old Protocol',
  EXPECTED_LOG_HEADER: 'task_observation_id',
  EXPECTED_PROTOCOL_CELL: 'WildTrack Objective 3',
});

function goal3Source_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run only in the existing, bound response spreadsheet.');
  if (!ss.getSheetByName(GOAL3_TABS_V2.RAW)) {
    throw new Error('Form Responses 1 is absent; this is NOT the verified existing response spreadsheet.');
  }
  const log = ss.getSheetByName(GOAL3_TABS_V2.LOG);
  const protocol = ss.getSheetByName(GOAL3_TABS_V2.PROTOCOL);
  if (!log || !protocol) throw new Error('Expected BOTH original Goal 3 tabs; no changes made.');
  if (String(log.getRange('A1').getValue()) !== GOAL3_TABS_V2.EXPECTED_LOG_HEADER ||
    String(protocol.getRange('A1').getValue()) !== GOAL3_TABS_V2.EXPECTED_PROTOCOL_CELL) {
    throw new Error('One or both original tabs have already been replaced or edited. STOP; no changes made.');
  }
  if (ss.getSheetByName(GOAL3_TABS_V2.NEW_LOG) ||
      ss.getSheetByName(GOAL3_TABS_V2.NEW_PROTOCOL)) {
    throw new Error('An earlier interrupted migration left staging tabs. STOP; reconcile by hand.');
  }
  return {ss, log, protocol};
}

function goal3HistoricalRows_(sheet) {
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(row =>
    row.some(value => value !== '' && value !== null && value !== false)).length;
}

function previewGoal3TabReplacement() {
  const source = goal3Source_();
  const summary = {
    spreadsheet: source.ss.getName(),
    existingTaskLogEnteredRows: goal3HistoricalRows_(source.log),
    existingProtocolRows: source.protocol.getLastRow(),
    existingFormResponseRows: source.ss.getSheetByName(GOAL3_TABS_V2.RAW).getLastRow() - 1,
    action: 'BACK UP both original Goal 3 tabs into hidden ARCHIVE copies, then replace their active names',
    untouched: ['Form Responses 1', 'published Google Form', 'other spreadsheet tabs'],
    warning: 'No sheet changed in preview. Confirm old log/consent data and permissions before replacement.',
  };
  console.log(JSON.stringify(summary));
  return summary;
}

function goal3ArchiveName_(ss, prefix) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  let name = prefix + ' ' + stamp;
  let suffix = 1;
  while (ss.getSheetByName(name)) name = prefix + ' ' + stamp + '-' + suffix++;
  return name; // Google Sheets sheet names <=100 chars; these names are short.
}

function goal3CopyArchive_(ss, original, prefix) {
  const snapshot = original.copyTo(ss);
  snapshot.setName(goal3ArchiveName_(ss, prefix));
  const sourceData = original.getDataRange();
  const archiveData = snapshot.getDataRange();
  if (snapshot.getRange('A1').getValue() !== original.getRange('A1').getValue() ||
      snapshot.getLastRow() !== original.getLastRow() ||
      snapshot.getLastColumn() !== original.getLastColumn() ||
      JSON.stringify(sourceData.getValues()) !== JSON.stringify(archiveData.getValues()) ||
      JSON.stringify(sourceData.getFormulas()) !== JSON.stringify(archiveData.getFormulas())) {
    throw new Error('Archive verification FAILED. Original tabs are intact; stop and inspect copied sheets.');
  }
  snapshot.hideSheet();
  return snapshot;
}

function goal3InstallProtocol_(sheet) {
  const rows = [
    ['WildTrack Objective 3 - REVISED', 'Initial saved student response correctness (post-distribution protocol amendment, 2026-09-22)'],
    ['Status', 'REVISED WORKING PROTOCOL. Requires course/adviser endorsement and genuinely eligible consent; original T1/T2 protocol preserved in hidden dated ARCHIVE.'],
    ['Target', '>=95% of eligible verified INITIAL SAVED Refactored SRS records meet all required evidence-backed checks. Not the success rate of all attempted submissions.'],
    ['Unit', 'One justified, consenting eligible student initial SAVED record in the active Semester 1 validation workspace. Do not force students to revise or resubmit.'],
    ['Inclusion rule', 'Record actual consent for this scope, genuine original initial saved state, correct student/workspace/deliverable and an explicit selected cohort. One per eligible student.'],
    ['Consent', 'The original Form refers to controlled-task evidence. Ordinary noncontrolled submissions require a genuine lawful/academic consent basis before being included.'],
    ['Previously viewed', 'Mark PRE_AMENDMENT_SEEN vs NEW_POST_AMENDMENT in the Task Log. Earlier displayed records are NOT a fresh unseen holdout.'],
    ['Required checks', 'FIVE primary checks: student association; Semester 1 workspace; Refactored SRS deliverable; actual initial persisted response/version; original saved PDF link and fields. Student-visible readback is separate SUPPORTING evidence when available; no retroactive screenshot requirement.'],
    ['Unverified', 'If initial version, independent student association or required readback cannot be verified, mark that check UNVERIFIED. A Revised submission label with revision 1 and no history is NOT a proven revision or initial state.'],
    ['Primary numerator', 'Count consented INCLUDED rows whose FIVE primary checks all genuinely PASS. The derived result in Task Log excludes supporting readback.'],
    ['Primary denominator', 'Count all consented INCLUDED rows explicitly selected by the frozen inclusion rule, including FAIL and UNVERIFIED. Break failures vs unavailable evidence out separately.'],
    ['Primary metric', 'C_INITIAL / N_INITIAL if N_INITIAL > 0; otherwise NOT ESTIMABLE. Compare with >=95% ONLY within the limited saved-record scope. Supporting readback is a separate observation.'],
    ['Not assessed by this score', 'Form attempts that never persisted, intentionally blank links, DOCX/non-PDF failures, artificial revisions and the success rate of all started transactions.'],
    ['Separate researcher checks', 'Use consented/permitted researcher account with fictional files for blank-link rejection, non-PDF/DOCX handling and real edit/revision preservation. Do not count researcher runs as student participants.'],
    ['Questionnaire', 'Existing Form and Form Responses 1 stay unchanged. After submitting or editing does NOT require a revision. Ratings/checkboxes never constitute system correctness.'],
    ['Historical data', 'The prior Objective 3 Task Log and Objective 3 Protocol are copied to hidden dated ARCHIVE sheets before replacement. Do not silently rewrite old T1/T2 evidence or scores.'],
    ['Privacy', 'This spreadsheet may contain restricted source-response IDs and archived student keys. Keep access restricted; never publish raw IDs/PDFs or copy them into a public report.'],
    ['Working result', 'PENDING real eligible consent, inclusion and independently reviewed system evidence. The earlier Admin Validation Study Overall pass is T1+T2 only and CANNOT be reused as initial-record correctness.'],
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#17324D').setFontColor('#FFFFFF');
  sheet.getRange(1, 1, rows.length, 2).setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 215);
  sheet.setColumnWidth(2, 920);
  sheet.getRange('B18').setNote('No output from the original binary T1/T2 overallPass can be reused as this revised Goal 3 result.');
}

function goal3InstallLog_(sheet) {
  const headers = [
    'observation_id', 'observed_at', 'consent_scope_verified', 'consent_evidence_reference',
    'student_alias', 'response_id_RESTRICTED', 'cohort_selection', 'first_viewed_phase',
    'student_association', 'workspace_match', 'deliverable_match',
    'initial_saved_version', 'pdf_link_and_values', 'student_visible_readback',
    'derived_initial_result', 'initial_version_evidence_reference',
    'system_evidence_reference', 'researcher_note',
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#17324D').setFontColor('#FFFFFF').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 145);
  sheet.setColumnWidth(4, 230);
  sheet.setColumnWidth(16, 240);
  sheet.setColumnWidth(17, 240);
  sheet.setColumnWidth(18, 280);
  const dropdown = values => SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(false).build();
  sheet.getRange('C2:C500').setDataValidation(dropdown(['CONFIRMED', 'PENDING', 'NOT_AUTHORIZED']));
  sheet.getRange('G2:G500').setDataValidation(dropdown(['INCLUDED', 'OUT_OF_SCOPE', 'PENDING']));
  sheet.getRange('H2:H500').setDataValidation(dropdown(['PRE_AMENDMENT_SEEN', 'NEW_POST_AMENDMENT', 'UNKNOWN']));
  sheet.getRange('I2:M500').setDataValidation(dropdown(['PASS', 'FAIL', 'UNVERIFIED']));
  sheet.getRange('N2:N500').setDataValidation(dropdown(['PASS', 'FAIL', 'UNVERIFIED', 'NOT_OBSERVED']));
  // No pre-filled checkbox FALSE values: missing checks are UNKNOWN, never failures.
  // Auto-result only when the entire evidenced checklist passes; do not give a
  // PASS for blank consent, unselected records, missing evidence, or absent IDs.
  sheet.getRange('O2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF((C2:C<>"CONFIRMED")+(G2:G<>"INCLUDED"),"NOT_IN_COHORT",' +
    'IF((I2:I="FAIL")+(J2:J="FAIL")+(K2:K="FAIL")+(L2:L="FAIL")+(M2:M="FAIL"),"FAIL",' +
    'IF((D2:D<>"")*(F2:F<>"")*(P2:P<>"")*(Q2:Q<>"")*' +
    '(I2:I="PASS")*(J2:J="PASS")*(K2:K="PASS")*(L2:L="PASS")*(M2:M="PASS"),"PASS","UNVERIFIED")))))'
  );
  sheet.getRange('A1').setNote('One initial saved record per genuinely eligible consenting student. Pseudonymous observation_id only; do not infer the initial state from the current Revised submission choice.');
  sheet.getRange('C1').setNote('CONFIRMED must genuinely cover analysis of this initial saved record, including ordinary out-of-task submissions where applicable. Do not automatically inherit old controlled-task consent.');
  sheet.getRange('F1').setNote('Restricted internal response ID. Keep the whole source/response spreadsheet access-controlled; never copy identifiers into public analysis.');
  sheet.getRange('G1').setNote('INCLUDED only after a fixed cohort rule and actual consent; the denominator retains selected FAIL and UNVERIFIED records.');
  sheet.getRange('L1').setNote('The original initial persisted version/state must be observable; current Revised submission + revision 1 with zero history is NOT evidence of an initial submission.');
  sheet.getRange('N1').setNote('Optional supporting observation. If actual student-visible readback was NOT observed, mark NOT_OBSERVED; the primary saved-record correctness result does NOT require a retrospective student screenshot.');
  sheet.getRange('O1').setNote('Derived: 5/5 PRIMARY checks PASS with consent reference, response ID, initial-version and system-evidence references => PASS; any primary FAIL => FAIL; otherwise UNVERIFIED; missing consent/inclusion => NOT_IN_COHORT. Supporting readback (N) is separate.');
}

function replaceGoal3TabsInExistingSheet() {
  const source = goal3Source_(); // preflight before ANY write
  const response = SpreadsheetApp.getUi().alert(
    'Replace the TWO OLD Goal 3 tabs?',
    'The old tabs (and ALL their existing data) will be copied into HIDDEN date-stamped ARCHIVE tabs. ' +
    'The old active tabs will then be deleted and replaced with initial-saved-record protocol/log. ' +
    'Form Responses 1, the published Form and all unrelated tabs stay untouched. Continue?',
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (response !== SpreadsheetApp.getUi().Button.YES) {
    console.log('Cancelled; all original tabs and responses untouched.');
    return;
  }
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(30000)) throw new Error('Could not lock the existing spreadsheet.');
  try {
    // Recheck inside lock after the user has confirmed; dialogs may suspend
    // the Apps Script server execution and do not preserve an acquired lock.
    goal3Source_();
    const oldLog = source.ss.getSheetByName(GOAL3_TABS_V2.LOG);
    const oldProtocol = source.ss.getSheetByName(GOAL3_TABS_V2.PROTOCOL);
    const archivedLog = goal3CopyArchive_(source.ss, oldLog, GOAL3_TABS_V2.ARCHIVE_LOG);
    const archivedProtocol = goal3CopyArchive_(source.ss, oldProtocol, GOAL3_TABS_V2.ARCHIVE_PROTOCOL);

    // Construct both replacements BEFORE deleting either original. If creation
    // fails, original tabs and archived copies are still intact.
    const newLog = source.ss.insertSheet(GOAL3_TABS_V2.NEW_LOG);
    const newProtocol = source.ss.insertSheet(GOAL3_TABS_V2.NEW_PROTOCOL);
    goal3InstallLog_(newLog);
    goal3InstallProtocol_(newProtocol);
    SpreadsheetApp.flush();
    if (archivedLog.getRange('A1').getValue() !== GOAL3_TABS_V2.EXPECTED_LOG_HEADER ||
        archivedProtocol.getRange('A1').getValue() !== GOAL3_TABS_V2.EXPECTED_PROTOCOL_CELL) {
      throw new Error('Archived originals cannot be verified; originals remain untouched. STOP.');
    }
    source.ss.deleteSheet(oldLog);
    source.ss.deleteSheet(oldProtocol);
    newLog.setName(GOAL3_TABS_V2.LOG);
    newProtocol.setName(GOAL3_TABS_V2.PROTOCOL);
    console.log('Goal 3 tabs replaced. Historical data archived in hidden tabs: ' +
      archivedLog.getName() + ', ' + archivedProtocol.getName() +
      '. Form Responses 1 and the Form were not changed. Do not rerun original Form-creation script.');
  } finally {
    lock.releaseLock();
  }
}
