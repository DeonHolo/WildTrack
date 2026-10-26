# Batch 1: live user checks

This batch changes adviser-preview safety and screen readability. It does not add the workbook import, new template review pipeline or durable archive; those are later batches.

Use the Admin account and the existing saved results. No new AI batch is needed for these checks.

## 1. Preview another adviser without changing their work

**Story:** As Admin, I want to inspect another adviser's teams while keeping the preview read-only.

1. Open My advised teams and choose View another adviser.
2. Select an adviser who has a team with a submitted response.
3. Open that team's deliverable. Open a saved Document Check, file history or AI Review if available.
4. Return using Back to my teams. Open the normal Review page.

**Expected:** The preview says Read-only adviser preview. There is no feedback editor, Accept/Revoke action, new Document Check, rerun or AI generation. Saved reports and PDF links remain readable; Check again is unavailable inside the saved check. Normal Admin Review still has its usual actions. You can check button availability without submitting a real decision.

## 2. Paste spreadsheet cells without guessing what Tab means

**Story:** As Admin, I want to copy roster cells from Excel or Google Sheets into Academic Data.

1. Select and copy an existing student's cells in your spreadsheet, including column headers if convenient.
2. Open Academic Data → Students → Paste rows and paste the cells.
3. Read the preview, then press Tab from the text box.
4. Cancel the preview if you are only checking the interface.

**Expected:** Instructions say select/copy/paste, identify required columns and explain the optional header row. Recognised headers can be in a different order. The row preview identifies updates or validation errors. Tab moves focus to the next control. Nothing is saved by cancelling.

## 3. Read a saved AI report without a date taking its own band

**Story:** As reviewer, I want the document overview and review date together.

1. In Review, open a response with a saved AI Review and document overview.
2. Choose View AI Review.
3. Inspect the heading, date, Open PDF and close control.
4. Narrow the browser window.

**Expected:** On a wide window, Reviewed on sits to the right of Document overview. On a narrow window it wraps cleanly, with no overlap or smaller body text. Open PDF stays in the modal header beside close. Historical reports keep their historical date and warning rather than claiming to be the latest result.

## 4. Tell file screening from AI questions

**Story:** As reviewer, I want short labels with different meanings.

1. Find a Document Check whose previous label was Ready for review or Looks substantially filled.
2. Find a saved AI Review with unresolved checks, previously labelled Needs manual verification.
3. Open both reports.

**Expected:** Document Check shows green Looks filled: the file passed screening for access, readability and substance. AI shows amber Check in PDF: inspect the specified questions before deciding. Neither label accepts or grades the document. The AI report uses a count such as 2 items to check. Sorting and the saved results retain the same meaning.

## 5. Read a long latest-activity entry

**Story:** As Admin, I want to see the latest deliverable and date for a selected student.

1. Open Tracker and select a student with a submission.
2. Look at Latest in the selected-student summary.
3. Narrow the browser window; use a student/deliverable with a long title if available.

**Expected:** The latest deliverable and date remain available in the layout instead of ending in an ellipsis. Text wraps without colliding with the summary counts.

## 6. Check the narrow review table and sidebar

**Story:** As Admin, I want complete statuses and useful navigation in a smaller window.

1. Open Review and inspect rows with different Document Check and AI results.
2. Narrow the browser window and scroll the table where needed.
3. Open Academic Data and inspect the Admin sidebar.

**Expected:** Status dots and labels stay aligned inside their cells; long text does not bleed into the next column. Academic Data no longer has the writeback sentence. The Admin sidebar no longer has Capstone operations or the access/workspace footer. Workspace navigation remains available.

## Reporting a problem

For each story, record Pass or Needs fixing, the page/step and what happened. A screenshot is useful for clipping or alignment. Keep feedback about these two tickets together so the next release can address the batch as a whole.
