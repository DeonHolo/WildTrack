# Copy-ready Google Forms questionnaire

**Status:** proposed research instrument for the WildTrack MVP evaluation round. It is not adviser-approved, is not yet published, and is not evidence that anyone has responded.

This file is the exact hosted respondent questionnaire to build manually in Google Forms. It is separate from WildTrack's own deliverable form editor.

## Form title and description

**Title:** WildTrack MVP Evaluation: Submission Status, Review, and Workflow

**Description:** We are evaluating the WildTrack capstone submission workflow and related review features. Complete the form at your own pace; the study does not require timed observation. Some student questions use fictional situations so that status interpretation can be scored consistently. Do not upload a PDF or grade a document in this form. Do not enter a password, API key, name, email address, student number, account username, or private document content. Participation is voluntary. Consenting role routes include a short written-feedback prompt; if you have nothing to add, you may type "None." A non-identifying participant code is requested only to review accidental duplicate submissions.

## Section 1 - Consent

This section contains only C1 so that a person who declines is not trapped by later required questions. Google Forms applies answer-based navigation at section boundaries.

**C1 - Consent (Multiple choice, required).**

Question: "Do you voluntarily agree to participate in this WildTrack MVP evaluation and allow your responses to be analyzed for the study? Quantitative results will be reported in aggregate, and written feedback will be de-identified and paraphrased unless separate permission for a direct quotation is obtained."

Options and routing:

- "Yes, I agree" -> Section 2, Participant code and role
- "No, I do not agree" -> Section 12, Declined

Use "Go to section based on answer." Google documents that answer-based section routing is available for multiple choice and dropdown questions and that an answer may route to Submit form: https://support.google.com/docs/answer/141062

## Section 2 - Participant code and role

**C2 - Participant code (Short answer, required).**

Question: "Create a six-character participant code using any three letters followed by any three digits that you can recognize if you need to identify your own response later. Example: MAP482. Do not use your initials, birthday, student number, email, username, or any other identifying information."

Response validation: regular expression matching three letters followed by three digits. Accept either uppercase or lowercase during entry; normalize to uppercase for analysis.

Research use: duplicate review only. The code is not a verified identity.

**C3 - Role (Multiple choice, required).**

Question: "Which role best describes the WildTrack workflow you can answer about today?"

Options and routing:

- "Student" -> Section 3, Student basis
- "Adviser" -> Section 7, Adviser basis
- "Admin or beneficiary" -> Section 9, Admin or beneficiary basis
- "I have not used or reviewed WildTrack and none of these roles applies to what I can answer" -> Section 11, No-use close

## Section 3 - Student basis

**C4_STU - Student response basis (Multiple choice, required).**

Question: "Which best describes your basis for answering the student questions?"

Options and routing:

- "I have used or reviewed the current WildTrack MVP" -> Section 4, Student current-use feedback
- "I have not used the current MVP, but I can answer the five fictional status/next-action scenarios" -> Section 5, Five student scenarios
- "I cannot answer the current-use questions or the fictional scenarios" -> Section 11, No-use close

The first option is coded as actual-use. The second is coded as scenario-only. These groups are reported separately.

## Section 4 - Student current-use feedback

Only actual-use students reach this section. At the end of the section, continue to Section 5.

**S1 - Status visibility (Linear scale 1-5, required).**

Question: "Based on the current WildTrack MVP you used or reviewed, how clear is it where to find the current status of a submission?"

Scale labels: 1 "Not clear at all"; 5 "Very clear."

**S2 - Next-action visibility (Linear scale 1-5, required).**

Question: "Based on the current WildTrack MVP you used or reviewed, how clear is the next action you should take after viewing a submission status, Document Check result, or adviser remark?"

Scale labels: 1 "Not clear at all"; 5 "Very clear."

**S3 - Student workflow areas (Checkboxes, optional).**

Question: "Which parts of the student workflow would you improve? Select all that apply."

Options:

- Status wording
- Next-action guidance
- Adviser remarks
- Document Check explanation
- AI Review explanation
- Submission history
- Navigation
- No change needed
- Other

If "No change needed" is selected with another improvement option, preserve the raw response and flag the combination for qualitative review rather than silently rewriting it.

**S4 - Student qualitative feedback (Paragraph, required).**

Question: "What was the most confusing, difficult, or useful part of the WildTrack student workflow, and what should be changed or retained? If you have nothing to add, type None. Do not include names, emails, student numbers, or private document content."

## Section 5 - Five student status/next-action scenarios

Section description shown to respondents:

"The five situations below are fictional and independent. Choose the one option that correctly identifies both the state described and the immediate next action. Document Check and AI Review are advisory; a checker result is not the same as staff acceptance. The researcher answer key is stored separately and is not shown before submission."

Every scenario S5-S9 is **Multiple choice, required**, with one answer only.

**S5 - Scenario 1: Submitted.**

Question: "Mia saves a WildTrack response successfully. The confirmation and student dashboard show Submitted. No Document Check result, adviser remark, staff acceptance, or archive record is shown. Which status and immediate next action best match this situation?"

Options:

- A. "Submitted only; monitor for a later check, remark, or staff review and revise only if new feedback requires it."
- B. "Checked and accepted; archive the file immediately."
- C. "Accepted; no staff review can change this state."
- D. "Archived; edit the historical snapshot to continue the submission."

**S6 - Scenario 2: Document Check completed with attention needed.**

Question: "Noah's student dashboard still shows Submitted. A separate Document Check result says File needs attention because a required section may be missing. No Accepted label is shown. Which status and immediate next action best match this situation?"

Options:

- A. "Accepted; the Document Check result is the final staff decision."
- B. "Submitted with an advisory Document Check finding; read the finding, correct or clarify the issue, and save a revised response if needed."
- C. "Archived; start a new project because a checker ran."
- D. "Not submitted; ignore the checker result because no response exists."

**S7 - Scenario 3: Adviser revision request.**

Question: "Ari's current student status is Submitted. An adviser-visible feedback item says, 'Please correct the methodology section and submit the revision.' The response is not marked Accepted. Which status and immediate next action best match this situation?"

Options:

- A. "Submitted with revision requested; correct the methodology section and save the revised response for another review."
- B. "Accepted; the adviser remark means the current version passed."
- C. "Archived; open the historical snapshot and overwrite it."
- D. "AI-approved; wait for AI Review to create staff acceptance automatically."

**S8 - Scenario 4: Accepted current version.**

Question: "Lee's latest saved response is labeled Accepted. A Document Check result is also visible for the PDF. Which status and immediate next action best match this situation?"

Options:

- A. "Accepted by a separate staff decision for the current saved version; keep the accepted response unless a course instruction requires another change, because a later material edit may require review again."
- B. "Only checked; acceptance cannot exist while a Document Check result is visible."
- C. "Only submitted; the Accepted label merely confirms that the form saved."
- D. "Archived; the active response must be restored before it can be viewed."

**S9 - Scenario 5: Archived historical snapshot.**

Question: "Kai is viewing Archive History. It contains a read-only snapshot created from an earlier accepted response. WildTrack also keeps the current active response separately, and an old archive snapshot remains part of history even if acceptance is later revoked. Which status and immediate next action best match the snapshot?"

Options:

- A. "Current active response; edit the archived snapshot to make the next revision."
- B. "Archived historical snapshot; use the current active response for new work and use the snapshot only as historical reference/evidence."
- C. "Document Check passed; every archive entry is a current checker result."
- D. "Pending submission; rerun AI Review until the archive entry becomes editable."

At the end of Section 5, continue to Section 6.

## Section 6 - Student closeout

**S10 - Scenario confidence (Linear scale 1-5, required).**

Question: "How confident are you that you understood the five fictional situations?"

Scale labels: 1 "Not confident"; 5 "Very confident."

This is supporting feedback only and is not scored as correctness.

**S11 - Scenario qualitative feedback (Paragraph, required).**

Question: "Which scenario, status label, or next-action instruction was hardest to interpret, and why? If none was unclear, type None. Do not include personal information."

End-of-section action: Submit form.

## Section 7 - Adviser basis

**C4_ADV - Adviser response basis (Multiple choice, required).**

Question: "Which best describes your basis for answering the adviser questions?"

Options and routing:

- "I have used or reviewed the current WildTrack MVP adviser workflow" -> Section 8, Adviser workflow feedback
- "I have not used or reviewed the current WildTrack MVP enough to comment" -> Section 11, No-use close

## Section 8 - Adviser workflow feedback

**A1 - Adviser scope (Multiple choice, required).**

Question: "Which adviser workflow have you used or reviewed?"

Options:

- Reviewing assigned student submissions
- Reading remarks and status history
- Both

**A2 - Review-state clarity (Linear scale 1-5, required).**

Question: "How clear is the separation among a submitted response, an advisory Document Check result, a staff acceptance decision, and an archived historical record?"

Scale labels: 1 "Not clear at all"; 5 "Very clear."

**A3 - Adviser task areas (Checkboxes, optional).**

Question: "Which adviser tasks should be easier to complete? Select all that apply."

Options:

- Finding assigned teams
- Reading current status
- Adding or preserving remarks
- Comparing versions
- Understanding advisory check results
- No change needed
- Other

**A4 - Adviser qualitative feedback (Paragraph, required).**

Question: "From the adviser workflow you used or reviewed, what should WildTrack change and what should it retain? If you have nothing to add, type None. Do not include student names, emails, student numbers, or private document content."

End-of-section action: Submit form.

## Section 9 - Admin or beneficiary basis

**C4_ADM - Admin/beneficiary response basis (Multiple choice, required).**

Question: "Which best describes your basis for answering the Admin/beneficiary questions?"

Options and routing:

- "I have used or reviewed the current WildTrack Admin/beneficiary workflow" -> Section 10, Admin or beneficiary workflow feedback
- "I have not used or reviewed the current WildTrack MVP enough to comment" -> Section 11, No-use close

## Section 10 - Admin or beneficiary workflow feedback

**D1 - Admin/beneficiary scope (Multiple choice, required).**

Question: "Which workflow have you used or reviewed?"

Options:

- Managing users or academic records
- Reviewing submissions and reports
- Both

**D2 - Decision clarity (Linear scale 1-5, required).**

Question: "How clear is the separation between advisory Document Check or AI Review output and the separate staff acceptance decision?"

Scale labels: 1 "Not clear at all"; 5 "Very clear."

**D3 - Admin task areas (Checkboxes, optional).**

Question: "Which tasks should be easier to complete? Select all that apply."

Options:

- Managing users
- Managing teams or deliverables
- Importing or correcting academic records
- Reviewing Document Check results
- Reviewing AI Review reports
- Accepting or archiving submissions
- No change needed
- Other

**D4 - Admin/beneficiary qualitative feedback (Paragraph, required).**

Question: "From the Admin/beneficiary workflow you used or reviewed, what should WildTrack change and what should it retain? If you have nothing to add, type None. Do not include names, emails, student numbers, API keys, or private document content."

End-of-section action: Submit form.

## Section 11 - No-use close

Section description only:

"You indicated that you do not have enough current WildTrack use/review context for the role-specific questions. No irrelevant research questions are required. If you are a Student who can answer the five fictional scenarios without current MVP use, return to the Student basis question and choose the scenario-only option. Otherwise, submit the form."

End-of-section action: Submit form.

Rows reaching this section are coded as no-use exits. They are not inserted into the Objective 3 student denominator or a role-specific current-use denominator.

## Section 12 - Declined

Section description only:

"You chose not to participate. No research questions are required. Thank you."

End-of-section action: Submit form.

Decline rows are retained only as a record of the consent choice if Google Forms records the submission. They are excluded from participant counts and all research denominators.

## Global confirmation message

Set the Google Forms confirmation message to:

"Thank you. The form has been submitted. Only consenting, eligible responses will be analyzed for the WildTrack MVP evaluation. Technical checker accuracy is evaluated separately with controlled benchmark fixtures; this form does not ask participants to grade PDFs."

Google Forms provides one form-level confirmation message, so role-specific and decline messages belong in the final section descriptions above rather than being treated as different post-submit confirmations.

## Exact Google Forms routing map

| Section | Routing question or section action | Answer | Destination |
|---|---|---|---|
| 1 Consent | C1 | Yes | 2 Participant code and role |
| 1 Consent | C1 | No | 12 Declined |
| 2 Participant code and role | C3 | Student | 3 Student basis |
| 2 Participant code and role | C3 | Adviser | 7 Adviser basis |
| 2 Participant code and role | C3 | Admin or beneficiary | 9 Admin or beneficiary basis |
| 2 Participant code and role | C3 | no applicable role/use | 11 No-use close |
| 3 Student basis | C4_STU | current MVP use/review | 4 Student current-use feedback |
| 3 Student basis | C4_STU | scenario-only | 5 Five student scenarios |
| 3 Student basis | C4_STU | cannot answer | 11 No-use close |
| 4 Student current-use feedback | section action | all | 5 Five student scenarios |
| 5 Five student scenarios | section action | all | 6 Student closeout |
| 6 Student closeout | section action | all | Submit form |
| 7 Adviser basis | C4_ADV | current MVP use/review | 8 Adviser workflow feedback |
| 7 Adviser basis | C4_ADV | insufficient use/review | 11 No-use close |
| 8 Adviser workflow feedback | section action | all | Submit form |
| 9 Admin/beneficiary basis | C4_ADM | current MVP use/review | 10 Admin/beneficiary feedback |
| 9 Admin/beneficiary basis | C4_ADM | insufficient use/review | 11 No-use close |
| 10 Admin/beneficiary feedback | section action | all | Submit form |
| 11 No-use close | section action | all | Submit form |
| 12 Declined | section action | all | Submit form |

## Manual Google Forms setup checklist

1. Create all 12 sections in the exact order above before adding routing.
2. Put C1 alone in Section 1. Do not put any other required question in the consent section.
3. Use Multiple choice for C1, C3, C4_STU, C4_ADV, and C4_ADM. Enable "Go to section based on answer" and set every destination exactly as shown in the routing table. Google states this feature is available only for Multiple choice and Dropdown questions: https://support.google.com/docs/answer/141062
4. Set each non-branching section's bottom action exactly as shown. Do not rely on the default "Continue to next section" for a route that should submit.
5. Set requiredness exactly as stated. Declined and no-use sections contain no questions. Optional checkbox items remain optional. Required paragraphs explicitly allow "None" so respondents are not pushed to invent criticism.
6. Keep "Collect email addresses" off. Google documents Verified and Responder input as explicit email-collection settings that add email data to responses: https://support.google.com/docs/answer/139706
7. Do not enable file upload, respondent-visible answer keys, quiz grading, or timing. Do not require sign-in solely for duplicate control.
8. Do not put the researcher key into question descriptions, feedback, or a quiz answer display. The frozen key belongs in SCORING_AND_CODEBOOK.md.
9. Before participant collection, preview and submit six dry-run routes: student actual-use, student scenario-only, adviser, Admin/beneficiary, no-use, and decliner. Verify that no route displays or requires another role's questions.

## Researcher-only key location

The respondent-facing form ends above. The correct options and rationales for S5-S9 are maintained separately in SCORING_AND_CODEBOOK.md and must be frozen before collection.
