import { deliverableUsesDocumentCheck, findStudent, isDocumentCheckCurrent } from './workflow.js';

const FLAGGED_STATUSES = new Set([
  'Template-like',
  'Too Short',
  'Template Headings Missing',
  'Not PDF',
  'Inaccessible',
  'Invalid Drive Link',
  'Download Disabled',
  'File Too Large',
  'Download Failed',
  'Password Protected',
  'Corrupt PDF'
]);

export const REVIEW_FILTERS = ['Pending', 'Flagged', 'Accepted', 'Archived', 'All'];

export function isFlaggedResponse(response) {
  return (response.flags || []).some((flag) => FLAGGED_STATUSES.has(flag));
}

export function needsReviewAction(response, documentCheckRequired = true) {
  if (response.reviewStatus === 'Accepted' || response.archiveStatus === 'Archived') return false;
  return isFlaggedResponse(response)
    || (documentCheckRequired && !isDocumentCheckCurrent(response))
    || response.reviewStatus === 'Needs Review'
    || response.reviewStatus === 'Received';
}

export function buildDeliverableReviewSummaries({ deliverables, attempts, expectedStudents }) {
  const expectedStudentNumbers = new Set(expectedStudents.map((student) => student.studentNumber));
  return deliverables.map((deliverable) => {
    const responses = attempts.filter((response) => response.deliverableId === deliverable.id);
    const documentCheckRequired = deliverableUsesDocumentCheck(deliverable);
    const receivedStudentNumbers = new Set(responses.map((response) => response.studentNumber || `response:${response.id}`));
    const submittedExpectedStudents = [...expectedStudentNumbers].filter((studentNumber) => receivedStudentNumbers.has(studentNumber)).length;
    const accepted = responses.filter((response) => response.reviewStatus === 'Accepted').length;
    const archived = responses.filter((response) => response.archiveStatus === 'Archived').length;
    const unchecked = documentCheckRequired ? responses.filter((response) => (
      response.reviewStatus !== 'Accepted'
      && response.archiveStatus !== 'Archived'
      && !isDocumentCheckCurrent(response)
    )).length : 0;
    const needsAction = responses.filter((response) => needsReviewAction(response, documentCheckRequired)).length;
    return {
      deliverable,
      responses,
      expected: expectedStudents.length,
      received: receivedStudentNumbers.size,
      missing: Math.max(0, expectedStudents.length - submittedExpectedStudents),
      unchecked,
      needsAction,
      accepted,
      archived
    };
  });
}

export function filterReviewResponses({ responses, students, deliverable, filter, query }) {
  let rows = responses;
  const documentCheckRequired = deliverableUsesDocumentCheck(deliverable);
  if (filter === 'Pending') rows = rows.filter((response) => needsReviewAction(response, documentCheckRequired));
  if (filter === 'Flagged') rows = rows.filter((response) => response.reviewStatus !== 'Accepted' && isFlaggedResponse(response));
  if (filter === 'Accepted') rows = rows.filter((response) => response.reviewStatus === 'Accepted');
  if (filter === 'Archived') rows = rows.filter((response) => response.archiveStatus === 'Archived');

  const needle = query.trim().toLowerCase();
  if (needle) {
    rows = rows.filter((response) => {
      const student = findStudent(students, response.studentNumber);
      const haystack = `${student?.name || response.studentName || ''} ${student?.teamCode || response.teamCode || ''} ${response.studentNumber || ''}`;
      return haystack.toLowerCase().includes(needle);
    });
  }

  return [...rows].sort((first, second) => (
    new Date(second.updatedAt || second.submittedAt) - new Date(first.updatedAt || first.submittedAt)
  ));
}
