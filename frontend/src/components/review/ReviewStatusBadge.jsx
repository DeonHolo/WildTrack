const STATUS_TONES = {
  Accepted: 'success',
  Archived: 'maroon',
  Received: 'info',
  'Needs Review': 'warning',
  'Needs attention': 'warning',
  'Ready for review': 'success',
  'Not checked': 'neutral',
  'Not applicable': 'neutral',
  'Could not check': 'danger',
  Outdated: 'warning',
  Checking: 'info',
  Reviewed: 'maroon',
  'Not reviewed': 'neutral'
};

export function ReviewStatusBadge({ label }) {
  return (
    <span className="wt-review-status" data-tone={STATUS_TONES[label] || 'neutral'}>
      <span className="wt-review-status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
