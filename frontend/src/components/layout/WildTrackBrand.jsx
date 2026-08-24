import { Group, Text, ThemeIcon } from '@mantine/core';
import { FilePdf } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

export function WildTrackBrand({ compact = false, to = '/', subtitle = 'Capstone operations' }) {
  return (
    <Link className={`wt-brand ${compact ? 'is-compact' : ''}`} to={to} aria-label="WildTrack home">
      <ThemeIcon className="wt-brand-mark" size={compact ? 36 : 40} radius="sm" color="wildtrackGold.5" c="wildtrackMaroon.9">
        <FilePdf size={compact ? 19 : 22} weight="duotone" aria-hidden="true" />
      </ThemeIcon>
      <Group gap={0} className="wt-brand-copy">
        <Text component="strong" fw={800}>WildTrack</Text>
        {!compact ? <Text component="small" size="xs">{subtitle}</Text> : null}
      </Group>
    </Link>
  );
}
