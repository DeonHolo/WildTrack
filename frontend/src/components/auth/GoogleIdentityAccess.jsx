import { Alert, Text, Title } from '@mantine/core';
import { WarningCircle } from '@phosphor-icons/react';
import { GoogleSignInButton } from './GoogleSignInButton.jsx';

export function GoogleIdentityAccess({
  title = 'Continue with Google',
  description = 'Open your WildTrack dashboard to check submissions, tracker progress, and adviser feedback.',
  error = '',
  embedded = false,
  onAuthenticated
}) {
  return (
    <section
      className={`wt-google-access${embedded ? ' is-embedded' : ''}`}
      aria-labelledby="wildtrack-google-access-title"
    >
      <div className="wt-google-access-intro">
        <Title order={embedded ? 2 : 1} id="wildtrack-google-access-title">
          {title}
        </Title>
        <Text className="wt-google-access-description">{description}</Text>
      </div>

      <div className="wt-google-access-action">
        <GoogleSignInButton enableOneTap autoSelect onAuthenticated={onAuthenticated} />
      </div>

      {error ? (
        <Alert
          className="wt-google-access-error"
          color="red"
          variant="light"
          icon={<WarningCircle size={19} />}
          role="alert"
        >
          {error}
        </Alert>
      ) : null}
    </section>
  );
}
