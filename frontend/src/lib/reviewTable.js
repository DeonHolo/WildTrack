import {
  aiReviewableSubmissionFields,
  artifactAiReviewStatus,
  artifactDocumentCheckStatus,
  findStudent,
  reviewableSubmissionFields
} from './workflow.js';

const textOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const statusOrders = {
  documentCheck: ['Ready for review', 'Needs attention', 'Outdated', 'Not checked', 'Not applicable'],
  aiReview: [
    'Needs attention', 'No issues', 'Retry required', 'Reviewing', 'Outdated', 'Not reviewed', 'Not applicable'
  ],
  decision: ['Received', 'Needs Review', 'Accepted', 'Archived']
};

export function resolveReviewDeliverable(response, state, deliverable) {
  return state?.deliverables?.find((item) => item.id === response.deliverableId) || deliverable;
}

export function reviewDecisionStatus(response) {
  return response.archiveStatus === 'Archived'
    ? 'Archived'
    : response.reviewStatus || response.primaryStatus || 'Received';
}

export function aggregateDocumentStatus(response, deliverable) {
  const fields = reviewableSubmissionFields(deliverable);
  if (!fields.length) return 'Not applicable';
  const statuses = fields.map((field) => artifactDocumentCheckStatus(response, field));
  if (statuses.includes('Needs attention')) return 'Needs attention';
  if (statuses.includes('Outdated')) return 'Outdated';
  if (statuses.every((status) => status === 'Ready for review')) return 'Ready for review';
  return 'Not checked';
}

export function aggregateAiStatus(response, deliverable) {
  const fields = aiReviewableSubmissionFields(deliverable);
  if (!fields.length) return 'Not applicable';
  const statuses = fields.map((field) => artifactAiReviewStatus(response, field));
  if (statuses.includes('Retry required')) return 'Retry required';
  if (statuses.includes('Reviewing')) return 'Reviewing';
  if (statuses.includes('Needs attention')) return 'Needs attention';
  if (statuses.includes('Outdated')) return 'Outdated';
  if (statuses.every((status) => status === 'No issues')) return 'No issues';
  return 'Not reviewed';
}

function sortValue(response, state, deliverable, column) {
  if (column === 'submitted') {
    const timestamp = response.updatedAt || response.submittedAt;
    const value = timestamp ? new Date(timestamp).getTime() : NaN;
    return Number.isFinite(value) ? value : null;
  }
  if (column === 'decision') return reviewDecisionStatus(response);
  if (column === 'student' || column === 'team') {
    const student = findStudent(state?.students || [], response.studentNumber);
    return column === 'student'
      ? student?.name || response.studentName || response.studentNumber
      : student?.teamCode || response.teamCode;
  }
  const rowDeliverable = resolveReviewDeliverable(response, state, deliverable);
  if (column === 'deliverable') return rowDeliverable?.shortTitle || rowDeliverable?.title;
  if (column === 'documentCheck') return aggregateDocumentStatus(response, rowDeliverable);
  if (column === 'aiReview') return aggregateAiStatus(response, rowDeliverable);
  return null;
}

function compareValues(first, second, column) {
  const order = statusOrders[column];
  if (order) {
    const firstRank = order.indexOf(first);
    const secondRank = order.indexOf(second);
    const difference = (firstRank < 0 ? order.length : firstRank) - (secondRank < 0 ? order.length : secondRank);
    if (difference) return difference;
  }
  return typeof first === 'number' && typeof second === 'number'
    ? first - second
    : textOrder.compare(String(first), String(second));
}

function isMissing(value) {
  return value == null || (typeof value === 'string' && !value.trim());
}

export function sortReviewResponses(responses, state, deliverable, sort = { column: 'submitted', direction: 'desc' }) {
  const { column, direction } = sort;
  const multiplier = direction === 'desc' ? -1 : 1;
  return responses.map((response, index) => ({ response, index, value: sortValue(response, state, deliverable, column) }))
    .sort((first, second) => {
      const firstMissing = isMissing(first.value);
      const secondMissing = isMissing(second.value);
      // Missing data stays at the end even when the selected direction reverses.
      if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
      const difference = firstMissing ? 0 : compareValues(first.value, second.value, column) * multiplier;
      return difference || textOrder.compare(String(first.response.id || ''), String(second.response.id || '')) || first.index - second.index;
    })
    .map(({ response }) => response);
}
