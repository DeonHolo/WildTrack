/**
 * WildTrack MVP Evaluation builder
 *
 * Run createWildTrackMvpEvaluation() once from a standalone Google Apps Script
 * project. It creates:
 *   1) the complete Google Form,
 *   2) a linked response spreadsheet,
 *   3) an Objective 3 controlled-task log,
 *   4) an Objective 3 protocol sheet,
 *   5) a SETUP sheet containing the generated links.
 *
 * Re-running is guarded with Script Properties to reduce accidental duplicates.
 * Set FORCE_RECREATE to true only when you intentionally want a fresh copy.
 */

const CONFIG = Object.freeze({
  FORM_TITLE: 'WildTrack MVP Evaluation',
  RESPONSE_SHEET_TITLE: 'WildTrack MVP Evaluation - Responses',
  LIMIT_ONE_RESPONSE: true,
  FORCE_RECREATE: false,
  PUBLISH_FORM: true,
});

const PROP_FORM_ID = 'WILDTRACK_MVP_EVAL_FORM_ID';
const PROP_SHEET_ID = 'WILDTRACK_MVP_EVAL_SHEET_ID';

function createWildTrackMvpEvaluation() {
  const properties = PropertiesService.getScriptProperties();

  if (!CONFIG.FORCE_RECREATE) {
    const existing = getExistingArtifacts_(properties);
    if (existing) {
      logArtifacts_(existing.form, existing.spreadsheet);
      return existing;
    }
  }

  const spreadsheet = SpreadsheetApp.create(CONFIG.RESPONSE_SHEET_TITLE);
  const setupSheet = spreadsheet.getSheets()[0];
  setupSheet.setName('SETUP');

  const form = FormApp.create(CONFIG.FORM_TITLE)
    .setDescription([
      'We are evaluating the current WildTrack MVP.',
      '',
      'Students may also complete a separate controlled WildTrack submission and revision task. That task is untimed and is scored from the system result, not from your opinion ratings.',
      '',
      'Do not enter passwords, API keys, names, email addresses, student numbers, account usernames, or private document content in this form. Participation is voluntary. Written comments are optional.',
      '',
      'If you take part in the controlled student task, the research team may inspect the minimum WildTrack task record needed to verify that the submission was saved under the correct student, workspace, and deliverable. Raw task records remain access controlled and are reported only in de-identified or aggregate form.',
    ].join('\n'))
    .setCollectEmail(false)
    .setLimitOneResponsePerUser(CONFIG.LIMIT_ONE_RESPONSE)
    .setAllowResponseEdits(false)
    .setProgressBar(true)
    .setShuffleQuestions(false)
    .setPublishingSummary(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage(
      'Thank you. Your response has been submitted. Questionnaire feedback is analyzed separately from the controlled technical benchmarks and the student transaction-correctness task.'
    )
    .setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  // ---------------------------------------------------------------------------
  // Section 1: Consent
  // ---------------------------------------------------------------------------
  const consent = form.addMultipleChoiceItem()
    .setTitle(
      'Do you voluntarily agree to participate in this WildTrack MVP evaluation and allow your questionnaire responses and, when applicable, controlled WildTrack task evidence to be analyzed for the study?'
    )
    .setRequired(true);

  // ---------------------------------------------------------------------------
  // Section 2: Role
  // ---------------------------------------------------------------------------
  const rolePage = form.addPageBreakItem()
    .setTitle('Role')
    .setHelpText('Choose the current WildTrack workflow you can answer about today.');

  const role = form.addMultipleChoiceItem()
    .setTitle('Which role best describes the WildTrack workflow you can answer about today?')
    .setRequired(true);

  // ---------------------------------------------------------------------------
  // Section 3: Student basis
  // ---------------------------------------------------------------------------
  const studentBasisPage = form.addPageBreakItem()
    .setTitle('Student basis')
    .setHelpText('Answer only from the current WildTrack student workflow you actually used.');

  const studentBasis = form.addMultipleChoiceItem()
    .setTitle('Which best describes your WildTrack experience for this evaluation?')
    .setRequired(true);

  // ---------------------------------------------------------------------------
  // Section 4: Student feedback
  // ---------------------------------------------------------------------------
  const studentFeedbackPage = form.addPageBreakItem()
    .setTitle('Student feedback')
    .setHelpText(
      'These questions are supporting MVP feedback. Objective 3 correctness is scored separately from the controlled task record and WildTrack system evidence.'
    );

  addScale_(
    form,
    'Based on the WildTrack student workflow you just used, how clear was it where to find your current submission status?',
    'Not clear at all',
    'Very clear'
  );

  addScale_(
    form,
    'After submitting or editing a response, how clear was what WildTrack had saved and what you could do next?',
    'Not clear at all',
    'Very clear'
  );

  addCheckboxes_(
    form,
    'Which parts of the student workflow that you actually used or saw should be improved? Select all that apply.',
    [
      'Opening the correct submission form',
      'Entering and submitting a response',
      'Editing a saved response',
      'Current submission status wording',
      'Document Check information',
      'Adviser feedback',
      'Team submission progress',
      'Navigation',
      'No change needed',
    ],
    false,
    true
  );

  addParagraph_(
    form,
    'Is there anything about the WildTrack student workflow you would change or keep? Please comment only on features you actually used or saw. Do not include personal information.',
    false
  );

  // ---------------------------------------------------------------------------
  // Section 5: Adviser basis
  // This page break also terminates the preceding Student feedback section.
  // ---------------------------------------------------------------------------
  const adviserBasisPage = form.addPageBreakItem()
    .setTitle('Adviser basis')
    .setHelpText('Answer only from the current WildTrack adviser workflow you actually used or reviewed.')
    .setGoToPage(FormApp.PageNavigationType.SUBMIT);

  const adviserBasis = form.addMultipleChoiceItem()
    .setTitle('Have you used or reviewed the current WildTrack adviser workflow enough to comment on it?')
    .setRequired(true);

  // ---------------------------------------------------------------------------
  // Section 6: Adviser feedback
  // ---------------------------------------------------------------------------
  const adviserFeedbackPage = form.addPageBreakItem()
    .setTitle('Adviser feedback');

  addCheckboxes_(
    form,
    'Which parts of the current adviser workflow have you used or reviewed? Select all that apply.',
    [
      'Finding an assigned team or deliverable',
      'Opening a submitted artifact',
      'Reading the current review or decision state',
      'Viewing Document Check information',
      'Viewing available AI Review information',
      'Writing or updating student feedback',
      'Accepting or revoking acceptance',
    ],
    true,
    false
  );

  addScale_(
    form,
    'Overall, how clear were the current review state and the actions available to you?',
    'Not clear at all',
    'Very clear'
  );

  addCheckboxes_(
    form,
    'Which adviser tasks that you actually used or reviewed should be improved? Select all that apply.',
    [
      'Finding teams or deliverables',
      'Opening submitted artifacts',
      'Reading the current review state',
      'Viewing Document Check information',
      'Viewing AI Review information',
      'Writing or updating feedback',
      'Accepting or revoking acceptance',
      'Navigation',
      'No change needed',
    ],
    false,
    true
  );

  addParagraph_(
    form,
    'Is there anything about the adviser workflow you would change or keep? Do not include student names, emails, student numbers, or private document content.',
    false
  );

  // ---------------------------------------------------------------------------
  // Section 7: Admin / beneficiary basis
  // This page break terminates the preceding Adviser feedback section.
  // ---------------------------------------------------------------------------
  const adminBasisPage = form.addPageBreakItem()
    .setTitle('Admin or beneficiary basis')
    .setHelpText('Answer only from the current WildTrack Admin/beneficiary workflow you actually used or reviewed.')
    .setGoToPage(FormApp.PageNavigationType.SUBMIT);

  const adminBasis = form.addMultipleChoiceItem()
    .setTitle('Have you used or reviewed the current WildTrack Admin/beneficiary workflow enough to comment on it?')
    .setRequired(true);

  // ---------------------------------------------------------------------------
  // Section 8: Admin / beneficiary feedback
  // ---------------------------------------------------------------------------
  const adminFeedbackPage = form.addPageBreakItem()
    .setTitle('Admin or beneficiary feedback');

  addCheckboxes_(
    form,
    'Which parts of the current Admin/beneficiary workflow have you used or reviewed? Select all that apply.',
    [
      'Configuring deliverable forms',
      'Managing academic records or workspace data',
      'Reviewing submissions',
      'Reviewing or running Document Check',
      'Reviewing or running AI Review',
      'Accepting, revoking, or archiving submissions',
    ],
    true,
    false
  );

  addScale_(
    form,
    'Overall, how clear were the current state of the work and the actions available to you?',
    'Not clear at all',
    'Very clear'
  );

  addCheckboxes_(
    form,
    'Which Admin/beneficiary tasks that you actually used or reviewed should be improved? Select all that apply.',
    [
      'Configuring deliverable forms',
      'Managing academic records or workspace data',
      'Reviewing submissions',
      'Reviewing Document Check',
      'Reviewing AI Review',
      'Accepting, revoking, or archiving submissions',
      'Navigation',
      'No change needed',
    ],
    false,
    true
  );

  addParagraph_(
    form,
    'Is there anything about the Admin/beneficiary workflow you would change or keep? Do not include names, emails, student numbers, API keys, or private document content.',
    false
  );

  // ---------------------------------------------------------------------------
  // Section 9: No-use close
  // This page break terminates the preceding Admin feedback section.
  // ---------------------------------------------------------------------------
  const noUsePage = form.addPageBreakItem()
    .setTitle('No-use close')
    .setHelpText(
      'You indicated that you do not have enough current WildTrack use or review context for the role-specific questions. No additional research questions are required.'
    )
    .setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // ---------------------------------------------------------------------------
  // Section 10: Declined
  // This page break terminates the preceding No-use section.
  // ---------------------------------------------------------------------------
  const declinedPage = form.addPageBreakItem()
    .setTitle('Declined')
    .setHelpText('You chose not to participate. No research questions are required. Thank you.')
    .setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // ---------------------------------------------------------------------------
  // Routing
  // Set choices only after every target page exists.
  // ---------------------------------------------------------------------------
  consent.setChoices([
    consent.createChoice('Yes, I agree', rolePage),
    consent.createChoice('No, I do not agree', declinedPage),
  ]);

  role.setChoices([
    role.createChoice('Student', studentBasisPage),
    role.createChoice('Adviser', adviserBasisPage),
    role.createChoice('Admin or beneficiary', adminBasisPage),
    role.createChoice(
      'I have not used or reviewed WildTrack enough to answer about one of these roles',
      noUsePage
    ),
  ]);

  studentBasis.setChoices([
    studentBasis.createChoice(
      'I completed or attempted the controlled WildTrack student submission task for this evaluation',
      studentFeedbackPage
    ),
    studentBasis.createChoice(
      'I have used the current WildTrack student workflow outside the controlled task and can give feedback about what I actually used',
      studentFeedbackPage
    ),
    studentBasis.createChoice(
      'I have not used the current student workflow enough to comment',
      noUsePage
    ),
  ]);

  adviserBasis.setChoices([
    adviserBasis.createChoice('Yes', adviserFeedbackPage),
    adviserBasis.createChoice('No', noUsePage),
  ]);

  adminBasis.setChoices([
    adminBasis.createChoice('Yes', adminFeedbackPage),
    adminBasis.createChoice('No', noUsePage),
  ]);

  // Publishing became an explicit state in newer Forms. New forms are normally
  // published already, but this makes the intended state explicit when supported.
  if (CONFIG.PUBLISH_FORM) {
    if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
        form.supportsAdvancedResponderPermissions()) {
      form.setPublished(true);
    } else {
      form.setAcceptingResponses(true);
    }
  }

  createObjective3TaskLog_(spreadsheet);
  createObjective3Protocol_(spreadsheet);
  writeSetupSheet_(setupSheet, form, spreadsheet);

  properties.setProperties({
    [PROP_FORM_ID]: form.getId(),
    [PROP_SHEET_ID]: spreadsheet.getId(),
  });

  logArtifacts_(form, spreadsheet);

  return {
    form,
    spreadsheet,
    editUrl: form.getEditUrl(),
    liveUrl: form.getPublishedUrl(),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

/**
 * Prints the URLs of the already-created artifacts without making a duplicate.
 */
function showWildTrackMvpEvaluationLinks() {
  const existing = getExistingArtifacts_(PropertiesService.getScriptProperties());
  if (!existing) {
    throw new Error('No saved WildTrack evaluation artifacts found. Run createWildTrackMvpEvaluation() first.');
  }
  logArtifacts_(existing.form, existing.spreadsheet);
}

/**
 * Clears only the Apps Script guard. It does NOT delete any Form or Spreadsheet.
 * After running this, createWildTrackMvpEvaluation() may create a fresh copy.
 */
function clearWildTrackMvpEvaluationGuard() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_FORM_ID);
  PropertiesService.getScriptProperties().deleteProperty(PROP_SHEET_ID);
  console.log('Creation guard cleared. Existing Google files were not deleted.');
}

function getExistingArtifacts_(properties) {
  const formId = properties.getProperty(PROP_FORM_ID);
  const sheetId = properties.getProperty(PROP_SHEET_ID);
  if (!formId || !sheetId) return null;

  try {
    return {
      form: FormApp.openById(formId),
      spreadsheet: SpreadsheetApp.openById(sheetId),
    };
  } catch (error) {
    console.warn('Saved artifact IDs could not be reopened; a fresh copy will be created. ' + error);
    return null;
  }
}

function addMultipleChoice_(form, title, choices, required, helpText) {
  const item = form.addMultipleChoiceItem()
    .setTitle(title)
    .setChoiceValues(choices)
    .setRequired(Boolean(required));

  if (helpText) item.setHelpText(helpText);
  return item;
}

function addCheckboxes_(form, title, choices, required, allowOther) {
  return form.addCheckboxItem()
    .setTitle(title)
    .setChoiceValues(choices)
    .setRequired(Boolean(required))
    .showOtherOption(Boolean(allowOther));
}

function addParagraph_(form, title, required) {
  return form.addParagraphTextItem()
    .setTitle(title)
    .setRequired(Boolean(required));
}

function addScale_(form, title, leftLabel, rightLabel) {
  return form.addScaleItem()
    .setTitle(title)
    .setBounds(1, 5)
    .setLabels(leftLabel, rightLabel)
    .setRequired(true);
}

function createObjective3TaskLog_(spreadsheet) {
  const name = 'Objective 3 Task Log';
  const existing = spreadsheet.getSheetByName(name);
  if (existing) spreadsheet.deleteSheet(existing);

  const sheet = spreadsheet.insertSheet(name);
  const headers = [
    'task_observation_id',
    'consent_confirmed',
    'canonical_student_key_raw',
    'workspace_id',
    'deliverable_id',
    'task_protocol_version',
    't1_started',
    't1_required_rule_blocked',
    't1_no_incorrect_persist',
    't1_association_correct',
    't1_values_correct',
    't1_visible_state_correct',
    't1_pass',
    't2_started',
    't2_association_correct',
    't2_changed_value_correct',
    't2_unchanged_values_preserved',
    't2_revision_correct',
    't2_visible_state_correct',
    't2_pass',
    'task_execution_error',
    'withdrawal_or_nonresearch_stop',
    'evidence_reference',
    'researcher_note',
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setWrap(true);
  sheet.setFrozenRows(1);

  // Boolean checklist columns. canonical_student_key_raw is intentionally NOT
  // a checkbox and must remain access controlled.
  const checkboxColumns = [
    2,  // consent_confirmed
    7, 8, 9, 10, 11, 12, 13,
    14, 15, 16, 17, 18, 19, 20,
    22, // withdrawal_or_nonresearch_stop
  ];
  checkboxColumns.forEach((column) => {
    sheet.getRange(2, column, 200, 1).insertCheckboxes();
  });

  sheet.getRange('A1').setNote(
    'RESTRICTED RESEARCH LOG. Do not publish raw Student Numbers/account identifiers. Use task_observation_id in cleaned/public analysis.'
  );
  sheet.getRange('C1').setNote(
    'Restricted raw canonical student key used only to verify unique participant/record association. Do not copy this field into public analysis.'
  );
  sheet.getRange('M1').setNote(
    'T1 passes only when every applicable frozen T1 assertion passes.'
  );
  sheet.getRange('T1').setNote(
    'T2 passes only when every applicable frozen T2 assertion passes.'
  );

  sheet.autoResizeColumns(1, headers.length);
}

function createObjective3Protocol_(spreadsheet) {
  const name = 'Objective 3 Protocol';
  const existing = spreadsheet.getSheetByName(name);
  if (existing) spreadsheet.deleteSheet(existing);

  const sheet = spreadsheet.insertSheet(name);
  const rows = [
    ['WildTrack Objective 3', 'Student submission transaction correctness'],
    ['Status', 'Proposed protocol. Freeze before real collection.'],
    ['Working target', 'STU_TXN_accuracy >= 95% (project-defined working threshold; not adviser-approved)'],
    ['', ''],
    ['T1 - Initial submission', ''],
    ['1', 'Student opens the existing Refactored SRS form in the current imported MVP Validation workspace.'],
    ['2', 'Student first attempts submission without the required Google Drive PDF link.'],
    ['3', 'Verify WildTrack blocks that attempt and does not create/overwrite an incorrect response.'],
    ['4', 'Student pastes the Google Drive link to their own existing Refactored SRS PDF, chooses Initial submission for the required Validation step field, and submits. WildTrack does not receive a file upload.'],
    ['5', 'Verify correct student/workspace/deliverable association, saved SRS link, Validation step value, Document Check state, and student-visible readback.'],
    ['', ''],
    ['T2 - Material revision', ''],
    ['1', 'Student reopens the same saved response.'],
    ['2', 'Student changes only Validation step from Initial submission to Revised submission and leaves the SRS PDF link unchanged.'],
    ['3', 'Student saves the revision.'],
    ['4', 'Verify the intended value changed, unchanged values were preserved, response identity remained correct, revision behavior matched expectation, and the student-visible state/readback matches the stored revision.'],
    ['', ''],
    ['Scoring', 'Each T1/T2 transaction passes only if every applicable frozen assertion passes.'],
    ['Primary metric', 'STU_TXN_accuracy = C_STU_TXN / N_STU_TXN'],
    ['Important', 'System/runtime failures stay visible in the denominator. Questionnaire clarity ratings do not score Objective 3. The task is untimed.'],
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange('A1:B1').setFontWeight('bold');
  sheet.getRange('A5:B5').setFontWeight('bold');
  sheet.getRange('A12:B12').setFontWeight('bold');
  sheet.getRange(1, 1, rows.length, 2).setWrap(true);
  sheet.setColumnWidth(1, 190);
  sheet.setColumnWidth(2, 820);
}

function writeSetupSheet_(sheet, form, spreadsheet) {
  sheet.clear();

  const values = [
    ['WildTrack MVP Evaluation - Setup', ''],
    ['Form edit URL', form.getEditUrl()],
    ['Live respondent URL', form.getPublishedUrl()],
    ['Response spreadsheet URL', spreadsheet.getUrl()],
    ['Form ID', form.getId()],
    ['Spreadsheet ID', spreadsheet.getId()],
    ['Limit to 1 response', CONFIG.LIMIT_ONE_RESPONSE ? 'ON' : 'OFF'],
    ['Collect email addresses', 'OFF'],
    ['Questionnaire purpose', 'Supporting role-based MVP feedback only'],
    ['Objective 3 evidence', 'Separate controlled student task log + WildTrack system/readback evidence'],
    ['Privacy reminder', 'Keep this spreadsheet access-controlled. The Objective 3 Task Log may contain restricted raw student-record keys.'],
    ['Next step', 'Open the Form edit URL, preview every route once, then freeze the wording/settings before participant collection.'],
  ];

  sheet.getRange(1, 1, values.length, 2).setValues(values);
  sheet.getRange('A1:B1').setFontWeight('bold');
  sheet.getRange(1, 1, values.length, 2).setWrap(true);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 900);
  sheet.setFrozenRows(1);
}

function logArtifacts_(form, spreadsheet) {
  console.log('WildTrack MVP Evaluation created/found.');
  console.log('EDIT FORM: ' + form.getEditUrl());
  console.log('LIVE FORM: ' + form.getPublishedUrl());
  console.log('RESPONSES / TASK LOG: ' + spreadsheet.getUrl());
}
