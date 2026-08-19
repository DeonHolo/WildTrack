import { Badge } from '@mantine/core';

const STATUS_COLORS = {
  Accepted: 'green',
  Archived: 'wildtrackMaroon',
  Received: 'blue',
  'Needs Review': 'orange',
  'Needs attention': 'orange',
  'Ready for review': 'green',
  'Not checked': 'gray',
  'Not applicable': 'gray',
  'Could not check': 'red',
  Outdated: 'yellow',
  Checking: 'blue',
  Reviewed: 'wildtrackMaroon',
  'Not reviewed': 'gray'
};

export function ReviewStatusBadge({ label }) {
  return (
    <Badge color={STATUS_COLORS[label] || 'gray'} variant="light" radius="sm" size="sm" className="wt-review-status">
      {label}
    </Badge>
  );
}
