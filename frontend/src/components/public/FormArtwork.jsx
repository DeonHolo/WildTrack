import { Box, Text } from '@mantine/core';
import { FilePdf, ListChecks } from '@phosphor-icons/react';

export function FormArtwork({ label = 'WildTrack submission form header', success = false }) {
  return (
    <Box className={`wt-form-artwork${success ? ' is-success' : ''}`} role="img" aria-label={label}>
      <div className="wt-artwork-copy" aria-hidden="true">
        <Text component="span" className="wt-artwork-kicker">WildTrack academic workflow</Text>
        <Text component="strong">{success ? 'Submission recorded' : 'Submit with a clear trail'}</Text>
      </div>
      <div className="wt-artwork-sheet" aria-hidden="true">
        <FilePdf weight="duotone" />
        <span />
        <span />
        <span />
      </div>
      <div className="wt-artwork-check" aria-hidden="true"><ListChecks weight="duotone" /></div>
    </Box>
  );
}
