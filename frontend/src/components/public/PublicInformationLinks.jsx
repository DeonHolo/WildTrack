import { Anchor, Group } from '@mantine/core';
import { Link } from 'react-router-dom';

export function PublicInformationLinks() {
  return <Group component="nav" aria-label="WildTrack information" justify="center" gap="md">
    <Anchor component={Link} to="/about" size="sm">About WildTrack</Anchor>
    <Anchor component={Link} to="/privacy" size="sm">Privacy</Anchor>
    <Anchor component={Link} to="/terms" size="sm">Terms</Anchor>
  </Group>;
}
