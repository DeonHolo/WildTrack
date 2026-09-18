# Copy-ready Google Forms questionnaire

**Status:** proposed research instrument for the WildTrack MVP evaluation round. It is not adviser-approved, is not yet published, and is not evidence that anyone has responded.

This is the respondent-facing Google Form to build manually. It supplies role-specific MVP feedback. It does **not** score Document Check accuracy, AI Review accuracy, or Objective 3 student transaction correctness. Objective 3 is scored from the separate controlled WildTrack task log and system evidence.

## Form title and description

**Title:** WildTrack MVP Evaluation

**Description shown to respondents:**

"We are evaluating the current WildTrack MVP. Students may also complete a separate controlled WildTrack submission and revision task. That task is untimed and is scored from the system result, not from your opinion ratings.

Do not enter passwords, API keys, names, email addresses, student numbers, account usernames, or private document content in this form. Participation is voluntary. Written comments are optional.

If you take part in the controlled student task, the research team may inspect the minimum WildTrack task record needed to verify that the submission was saved under the correct student, workspace, and deliverable. Raw task records remain access controlled and are reported only in de-identified or aggregate form."

## Section 1 - Consent

Question type: **Multiple choice, required**

Question:

"Do you voluntarily agree to participate in this WildTrack MVP evaluation and allow your questionnaire responses and, when applicable, controlled WildTrack task evidence to be analyzed for the study?"

Options and routing:

- "Yes, I agree" -> Section 2, Role
- "No, I do not agree" -> Section 10, Declined

## Section 2 - Role

Question type: **Multiple choice, required**

Question:

"Which role best describes the WildTrack workflow you can answer about today?"

Options and routing:

- "Student" -> Section 3, Student basis
- "Adviser" -> Section 5, Adviser basis
- "Admin or beneficiary" -> Section 7, Admin or beneficiary basis
- "I have not used or reviewed WildTrack enough to answer about one of these roles" -> Section 9, No-use close

## Section 3 - Student basis

Question type: **Multiple choice, required**

Question:

"Which best describes your WildTrack experience for this evaluation?"

Options and routing:

- "I completed or attempted the controlled WildTrack student submission task for this evaluation" -> Section 4, Student feedback
- "I have used the current WildTrack student workflow outside the controlled task and can give feedback about what I actually used" -> Section 4, Student feedback
- "I have not used the current student workflow enough to comment" -> Section 9, No-use close

The first option identifies the intended Objective 3 participant group. The questionnaire response itself is supporting evidence only; Objective 3 correctness is scored from the separate task record.

## Section 4 - Student feedback

### Finding the current submission status

Question type: **Linear scale, required**

Question:

"Based on the WildTrack student workflow you just used, how clear was it where to find your current submission status?"

Scale: **1 to 5**

- 1 label: "Not clear at all"
- 5 label: "Very clear"

### Understanding what happened after saving

Question type: **Linear scale, required**

Question:

"After submitting or editing a response, how clear was what WildTrack had saved and what you could do next?"

Scale: **1 to 5**

- 1 label: "Not clear at all"
- 5 label: "Very clear"

### Student workflow areas

Question type: **Checkboxes, optional**

Question:

"Which parts of the student workflow that you actually used or saw should be improved? Select all that apply."

Options:

- Opening the correct submission form
- Entering and submitting a response
- Editing a saved response
- Current submission status wording
- Document Check information
- Adviser feedback
- Team submission progress
- Navigation
- No change needed
- Other

Do not add AI Review explanation or submission/history options unless those features become student-visible before the instrument is frozen.

### Optional student comment

Question type: **Paragraph, optional**

Question:

"Is there anything about the WildTrack student workflow you would change or keep? Please comment only on features you actually used or saw. Do not include personal information."

End-of-section action: **Submit form.**

## Section 5 - Adviser basis

Question type: **Multiple choice, required**

Question:

"Have you used or reviewed the current WildTrack adviser workflow enough to comment on it?"

Options and routing:

- "Yes" -> Section 6, Adviser feedback
- "No" -> Section 9, No-use close

## Section 6 - Adviser feedback

### Adviser workflow exposure

Question type: **Checkboxes, required**

Question:

"Which parts of the current adviser workflow have you used or reviewed? Select all that apply."

Options:

- Finding an assigned team or deliverable
- Opening a submitted artifact
- Reading the current review or decision state
- Viewing Document Check information
- Viewing available AI Review information
- Writing or updating student feedback
- Accepting or revoking acceptance

### Adviser workflow clarity

Question type: **Multiple choice, required**

Question:

"Overall, how clear were the current review state and the actions available to you?"

Options:

- "1 - Not clear at all"
- "2"
- "3"
- "4"
- "5 - Very clear"

### Adviser task areas

Question type: **Checkboxes, optional**

Question:

"Which adviser tasks that you actually used or reviewed should be improved? Select all that apply."

Options:

- Finding teams or deliverables
- Opening submitted artifacts
- Reading the current review state
- Viewing Document Check information
- Viewing AI Review information
- Writing or updating feedback
- Accepting or revoking acceptance
- Navigation
- No change needed
- Other

### Optional adviser comment

Question type: **Paragraph, optional**

Question:

"Is there anything about the adviser workflow you would change or keep? Do not include student names, emails, student numbers, or private document content."

End-of-section action: **Submit form.**

## Section 7 - Admin or beneficiary basis

Question type: **Multiple choice, required**

Question:

"Have you used or reviewed the current WildTrack Admin/beneficiary workflow enough to comment on it?"

Options and routing:

- "Yes" -> Section 8, Admin or beneficiary feedback
- "No" -> Section 9, No-use close

## Section 8 - Admin or beneficiary feedback

### Admin/beneficiary workflow exposure

Question type: **Checkboxes, required**

Question:

"Which parts of the current Admin/beneficiary workflow have you used or reviewed? Select all that apply."

Options:

- Configuring deliverable forms
- Managing academic records or workspace data
- Reviewing submissions
- Reviewing or running Document Check
- Reviewing or running AI Review
- Accepting, revoking, or archiving submissions

### Admin/beneficiary workflow clarity

Question type: **Multiple choice, required**

Question:

"Overall, how clear were the current state of the work and the actions available to you?"

Options:

- "1 - Not clear at all"
- "2"
- "3"
- "4"
- "5 - Very clear"

### Admin/beneficiary task areas

Question type: **Checkboxes, optional**

Question:

"Which Admin/beneficiary tasks that you actually used or reviewed should be improved? Select all that apply."

Options:

- Configuring deliverable forms
- Managing academic records or workspace data
- Reviewing submissions
- Reviewing Document Check
- Reviewing AI Review
- Accepting, revoking, or archiving submissions
- Navigation
- No change needed
- Other

### Optional Admin/beneficiary comment

Question type: **Paragraph, optional**

Question:

"Is there anything about the Admin/beneficiary workflow you would change or keep? Do not include names, emails, student numbers, API keys, or private document content."

End-of-section action: **Submit form.**

## Section 9 - No-use close

Section description only:

"You indicated that you do not have enough current WildTrack use or review context for the role-specific questions. No additional research questions are required."

End-of-section action: **Submit form.**

## Section 10 - Declined

Section description only:

"You chose not to participate. No research questions are required. Thank you."

End-of-section action: **Submit form.**

Decline rows are excluded from participant counts and all research denominators.

## Global confirmation message

Set the Google Forms confirmation message to:

"Thank you. Your response has been submitted. Questionnaire feedback is analyzed separately from the controlled technical benchmarks and the student transaction-correctness task."

## Google Forms settings

1. Keep **Collect email addresses** off.
2. Turn on **Limit to 1 response** if the participant group can sign in with Google. Google currently documents that this requires sign-in but does not record usernames unless email collection is enabled: https://support.google.com/docs/answer/2839588
3. Do not add file-upload questions, quiz grading, answer keys, or timing.
4. Do not show researcher item codes such as C1, C2, S1, or D3 in respondent-facing question titles.
5. Optional paragraph questions must remain optional. Do not require respondents to type "None."
6. If Limit to 1 response cannot be used, do not replace it with a self-created participant code. Preserve raw timestamps, review obvious duplicate submissions conservatively, and report that survey-row uniqueness could not be fully verified.

## Exact routing map

| Section | Answer | Destination |
|---|---|---|
| 1 Consent | Yes | 2 Role |
| 1 Consent | No | 10 Declined |
| 2 Role | Student | 3 Student basis |
| 2 Role | Adviser | 5 Adviser basis |
| 2 Role | Admin or beneficiary | 7 Admin/beneficiary basis |
| 2 Role | insufficient context | 9 No-use close |
| 3 Student basis | controlled task | 4 Student feedback |
| 3 Student basis | other current use | 4 Student feedback |
| 3 Student basis | insufficient use | 9 No-use close |
| 4 Student feedback | section action | Submit form |
| 5 Adviser basis | Yes | 6 Adviser feedback |
| 5 Adviser basis | No | 9 No-use close |
| 6 Adviser feedback | section action | Submit form |
| 7 Admin/beneficiary basis | Yes | 8 Admin/beneficiary feedback |
| 7 Admin/beneficiary basis | No | 9 No-use close |
| 8 Admin/beneficiary feedback | section action | Submit form |
| 9 No-use close | section action | Submit form |
| 10 Declined | section action | Submit form |

## Manual construction and dry-run checklist

1. Create all ten sections before adding routing.
2. Put Consent alone in Section 1.
3. Use answer-based routing only on Consent, Role, Student basis, Adviser basis, and Admin/beneficiary basis.
4. Verify that Student, Adviser, Admin/beneficiary, no-use, and decline routes can all submit without encountering another role's required question.
5. Verify that no respondent-facing title contains internal research IDs.
6. Verify that AI Review explanation and submission/history do not appear as student workflow options unless the deployed student UI changes before collection.
7. Submit one dummy row for each route before recruitment. Clearly tag or delete dummy rows so they cannot enter the participant dataset.
8. Freeze the final wording and settings before real collection. Any later change requires an instrument version note.
