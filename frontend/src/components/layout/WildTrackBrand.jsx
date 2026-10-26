import { Group, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { WildTrackMark } from './WildTrackMark.jsx';

export function WildTrackBrand({ compact = false, to = '/', subtitle = 'Capstone operations' }) {
  return (
    <Link className={`wt-brand ${compact ? 'is-compact' : ''}`} to={to} aria-label="WildTrack home">
      <WildTrackMark className="wt-brand-mark" size={compact ? 36 : 40} />
      <Group gap={0} className="wt-brand-copy">
        <Text component="strong" fw={800}>WildTrack</Text>
        {!compact && subtitle ? <Text component="small" size="xs">{subtitle}</Text> : null}
      </Group>
    </Link>
  );
}
