import { Text, Title } from '@mantine/core';
import { STUDENT_ARTWORK } from '../../lib/studentArtwork.js';

export function StudentWelcomeBanner({ student, rows }) {
  const submittedCount = rows.filter((row) => row.status !== 'Not submitted').length;
  const allSubmitted = rows.length > 0 && submittedCount === rows.length;
  const nextDeliverable = rows.find((row) => row.status === 'Not submitted')?.deliverable;
  const firstName = getFirstName(student.name);
  const artwork = allSubmitted
    ? STUDENT_ARTWORK.dashboardComplete
    : STUDENT_ARTWORK.dashboardWelcome;

  return (
    <section className={`wt-student-welcome${allSubmitted ? ' is-complete' : ''}`} aria-label="Student dashboard welcome">
      <div className="wt-student-welcome-copy">
        <Text className="wt-student-welcome-kicker">Your capstone workspace</Text>
        <Title order={2}>Welcome back, {firstName}</Title>
        <Text className="wt-student-welcome-progress">
          {submittedCount} of {rows.length} deliverables submitted
        </Text>
        <Text className="wt-student-welcome-next">
          {nextDeliverable
            ? <>Next to submit: <strong>{nextDeliverable.shortTitle}</strong></>
            : <strong>All current deliverables have a response.</strong>}
        </Text>
      </div>

      <div
        className="wt-student-welcome-art"
        role="img"
        aria-label={artwork.alt}
        style={{
          backgroundImage: `url("${artwork.src}")`,
          backgroundPosition: artwork.position
        }}
      />
    </section>
  );
}

function getFirstName(name) {
  const normalized = String(name || '').trim();
  const givenNames = normalized.includes(',') ? normalized.split(',').slice(1).join(',').trim() : normalized;
  const first = givenNames.split(/\s+/).find(Boolean) || 'Student';
  return first.toLocaleLowerCase().replace(/(^|[-'])\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}
