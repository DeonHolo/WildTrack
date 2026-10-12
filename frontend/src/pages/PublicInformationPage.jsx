import { Anchor, Button, Container, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PublicInformationLinks } from '../components/public/PublicInformationLinks.jsx';

const contact = 'holodeon@gmail.com';
const pages = {
  about: {
    title: 'About WildTrack',
    introduction: 'A capstone workspace for student deliverables, faculty feedback and project records.',
    sections: [
      ['Submit and track deliverables', 'Students use Google sign-in to access their class workspace, submit deliverable forms with Google Drive links, and follow their team’s submission status and feedback.'],
      ['Review academic work', 'Administrators and advisers review the work assigned to them. Document Check inspects submitted PDFs and compares their structure with official templates. When enabled, AI Review sends the PDF and review instructions to Google Gemini for feedback that faculty can evaluate.'],
      ['See recorded file history', 'WildTrack records PDF checks after submission. File History shows those checks and the changes WildTrack observed between them. It does not capture every edit or provide a complete editing history.'],
      ['Use your Google account', 'Google sign-in identifies your account for the academic workspace. Our privacy policy explains how WildTrack uses account and submitted-file information and how to contact the administrator.']
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    introduction: 'How WildTrack uses account, submission and Google Drive information for its academic workflows.',
    sections: [
      ['Account and academic information', 'WildTrack uses your Google account identifier, name and email to identify your account and its workspace access. Academic records can include your student number, team, project details, submission answers and links, submission times, feedback and review decisions.'],
      ['Submitted Drive files and recorded checks', 'WildTrack retrieves submitted files according to their Google Drive sharing permissions. Google can return file identifiers, creation and modification times, file sizes, content checksums, and available owner or editor names and email addresses. WildTrack uses this information for PDF checks and to record observed changes after submission. WildTrack does not edit your Drive files.'],
      ['PDF contents and AI Review', 'Document Check retrieves configured submission PDFs to inspect their contents and compare them with official templates. When a staff member runs an enabled AI Review, the submitted PDF, its extracted text, deliverable instructions and comparison template are sent to Google Gemini. Review results are saved with the academic record. Google processes those requests under its service terms.'],
      ['Access and service providers', 'Workspace access controls determine which students, advisers and administrators can view academic records and recorded file checks. Google provides sign-in, Drive and Gemini services; Vercel and Heroku host the application and its supporting services. A file’s separate Google Drive sharing settings also control who can open it outside WildTrack.'],
      ['Storage and operational records', 'WildTrack saves submission links, recorded check history, feedback and review records. Historical connection records may remain on the server until removed by an administrator. Your browser can store session cookies, workspace selections, cached information and draft responses to keep your work available. Operational records can include request times, error categories and network information used to investigate failures.'],
      ['Your controls and deletion requests', 'You can remove WildTrack’s Google permissions through your Google Account connections. Signing out or removing Google permission does not itself delete existing academic records. Contact the administrator below to request removal of account or Google-related data; academic records are managed by the workspace administrator.'],
      ['Limited use of Google data', 'Google account and submitted-file data are used for the academic functions described here. WildTrack’s use and transfer of Google API information follows the Google API Services User Data Policy, including its Limited Use requirements.']
    ]
  },
  terms: {
    title: 'Terms of Use',
    introduction: 'Conditions for using WildTrack’s academic workspaces and review features.',
    sections: [
      ['Academic workspace access', 'Use WildTrack for the classes, teams and records you are authorized to access. Use your own Google account and provide accurate identity and submission information. Workspace administrators manage access and academic records.'],
      ['Submitted work and links', 'Submit work you are authorized to share for academic review. You are responsible for the document contents and the Google Drive sharing permissions needed for your class’s submission and review workflow.'],
      ['Google authorization', 'Google sign-in identifies your account. You can withdraw previously granted Google permissions through Google Account connections; removing permission does not automatically delete academic records.'],
      ['Checks, AI feedback and history', 'Document Check, AI Review and file history support faculty review. They can be incomplete or inaccurate and do not prove authorship, a complete editing history or academic acceptance. Faculty remain responsible for academic decisions.'],
      ['Data and access requests', 'The Privacy Policy describes how WildTrack handles account and submission data. Contact the administrator about access, incorrect records or data-removal requests. Signing out or withdrawing Google permission does not automatically remove academic records.']
    ]
  }
};

export function PublicInformationPage({ page }) {
  const information = pages[page];
  return <Container component="main" size="md" py="xl">
    <Stack gap="xl">
      <Group justify="space-between" wrap="wrap">
        <Anchor component={Link} to="/about" fw={800} size="xl">WildTrack</Anchor>
        <Button component={Link} to="/login">Open WildTrack</Button>
      </Group>
      <Divider />
      <Stack gap="xs">
        <Title order={1}>{information.title}</Title>
        <Text size="lg" c="dimmed">{information.introduction}</Text>
        {page !== 'about' ? <Text size="sm" c="dimmed">Effective 12 October 2026</Text> : null}
      </Stack>
      {information.sections.map(([title, body]) => <Paper key={title} withBorder p={{ base: 'md', sm: 'lg' }} radius="md">
        <Stack gap="sm"><Title order={2} size="h3">{title}</Title><Text lh={1.7}>{body}</Text></Stack>
      </Paper>)}
      {page === 'privacy' ? <Text size="sm">
        <Anchor href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</Anchor>
        {' · '}<Anchor href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Manage Google connections</Anchor>
      </Text> : null}
      <Text>Contact the WildTrack administrator: <Anchor href={`mailto:${contact}`}>{contact}</Anchor></Text>
      <Divider />
      <PublicInformationLinks />
    </Stack>
  </Container>;
}
