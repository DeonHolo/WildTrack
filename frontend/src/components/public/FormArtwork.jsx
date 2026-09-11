import { Box, Text } from '@mantine/core';
import { STUDENT_ARTWORK } from '../../lib/studentArtwork.js';

export function FormArtwork({ success = false, artwork: artworkOverride = null, ariaLabel, mascotClassName = '', children }) {
  const artwork = artworkOverride || (success
    ? STUDENT_ARTWORK.submissionSuccess
    : STUDENT_ARTWORK.submissionForm);

  return (
    <Box
      className={`wt-form-artwork${success ? ' is-success' : ''}`}
      component={ariaLabel ? 'section' : 'div'}
      aria-label={ariaLabel}
    >
      <div className="wt-artwork-copy">
        {children || <Text component="strong">{success ? 'Submission recorded' : 'Submit with a clear trail'}</Text>}
      </div>
      <div
        className={`wt-artwork-mascot ${mascotClassName}`.trim()}
        role="img"
        aria-label={artwork.alt}
        style={{
          backgroundImage: `url("${artwork.src}")`,
          backgroundPosition: artwork.position,
          backgroundSize: artwork.size
        }}
      />
    </Box>
  );
}
