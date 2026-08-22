import { Box, Text } from '@mantine/core';
import { STUDENT_ARTWORK } from '../../lib/studentArtwork.js';

export function FormArtwork({ success = false }) {
  const artwork = success
    ? STUDENT_ARTWORK.submissionSuccess
    : STUDENT_ARTWORK.submissionForm;

  return (
    <Box className={`wt-form-artwork${success ? ' is-success' : ''}`}>
      <div className="wt-artwork-copy">
        <Text component="span" className="wt-artwork-kicker">WildTrack academic workflow</Text>
        <Text component="strong">{success ? 'Submission recorded' : 'Submit with a clear trail'}</Text>
      </div>
      <div
        className="wt-artwork-mascot"
        role="img"
        aria-label={artwork.alt}
        style={{
          backgroundImage: `url("${artwork.src}")`,
          backgroundPosition: artwork.position
        }}
      />
    </Box>
  );
}
