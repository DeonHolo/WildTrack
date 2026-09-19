import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { Alert, Button, Container, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { StudentDeliverableList } from '../components/student/StudentDeliverableList.jsx';
import { StudentProfileSummary } from '../components/student/StudentProfileSummary.jsx';
import { StudentProgressPanel } from '../components/student/StudentProgressPanel.jsx';
import { StudentWelcomeBanner } from '../components/student/StudentWelcomeBanner.jsx';
import { StudentWorkspacePicker } from '../components/student/StudentWorkspacePicker.jsx';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import {
  artifactDocumentCheck,
  artifactDocumentCheckStatus,
  findStudent,
  getActiveTrackerColumns,
  getIdentityStudents,
  getProjectMetadata,
  getPublishedDeliverables,
  getWorkspacePublicKey,
  isUsableAdviserName,
  normalizeStudentNumber
} from '../lib/workflow.js';
import { emptyStudentDashboardState, loadStudentDashboard } from '../lib/studentDashboardClient.js';
import { submissionArtifactFields } from '../lib/submissionArtifacts.js';

export function StudentStatusPage() {
  const {
    account: sessionAccount,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice,
    workspaceCatalogStatus,
    workspaceCatalogError,
    refreshWorkspaceCatalog,
    refreshSession
  } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const {
    data: state,
    status: dashboardStatus,
    error: dashboardError,
    reload: refreshDashboard
  } = useWorkspaceResource(activeWorkspaceId, loadStudentDashboard, emptyStudentDashboardState, 'student-dashboard');
  const [signInError, setSignInError] = useState('');
  const activeAccount = sessionAccount;
  const identityStudents = useMemo(() => getIdentityStudents(state.rosterOptions), [state.rosterOptions]);
  const currentAssociation = state.association;
  const studentNumber = currentAssociation?.studentNumber || '';
  const student = useMemo(() => findStudent(state.students, studentNumber) || (currentAssociation ? {
    studentNumber: currentAssociation.studentNumber,
    name: currentAssociation.studentName,
    teamCode: currentAssociation.teamCode
  } : null), [currentAssociation, state.students, studentNumber]);
  const project = useMemo(() => student ? getProjectMetadata(state, student.teamCode) : null, [state, student]);
  const adviserLabel = isUsableAdviserName(project?.adviserName)
    ? project.adviserName
    : isUsableAdviserName(student?.adviser)
      ? student.adviser
      : 'Unassigned';
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const activeColumns = useMemo(() => getActiveTrackerColumns(state), [state]);
  const deliverableRows = useMemo(() => {
    if (!student || !activeAccount) return [];
    const published = getPublishedDeliverables(state);
    const studentResponseIds = new Set(state.attempts
      .filter((response) => normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(student.studentNumber))
      .map((response) => response.deliverableId));
    const historical = state.deliverables.filter((deliverable) => (
      studentResponseIds.has(deliverable.id) && !published.some((item) => item.id === deliverable.id)
    ));

    return [...published, ...historical].map((deliverable) => {
      // The scoped endpoint redacts owner identities and values on private responses.
      // Session accounts expose email, while response owner keys prefer subject.
      const ownedResponse = state.attempts.find((response) => (
        response.deliverableId === deliverable.id &&
        normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(student.studentNumber) &&
        response.googleEmailSnapshot?.trim().toLowerCase() === activeAccount.email.trim().toLowerCase()
      ));
      const recorded = state.attempts.some((response) => (
        response.deliverableId === deliverable.id &&
        normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(student.studentNumber)
      ));
      return buildStudentDeliverableRow(
        deliverable,
        ownedResponse,
        recorded,
        buildDeliverableTeamProgress(state, student, deliverable.id)
      );
    });
  }, [activeAccount, state, student]);
  const isLoading = dashboardStatus === 'loading';
  const loadError = dashboardError;

  useEffect(() => {
    setSignInError('');
  }, [isCurrentScope]);

  if (!activeAccount) {
    return (
      <SignedOutDashboard
        error={signInError}
        onAuthenticated={async () => {
          setSignInError('');
          const current = await refreshSession();
          if (!current?.authenticated) setSignInError('Google sign-in could not be verified. Try again.');
        }}
      />
    );
  }
  if (workspaceCatalogStatus === 'loading' && !activeWorkspaceId) return <LoadingDashboard />;
  if ((workspaceCatalogStatus === 'error' && !activeWorkspaceId) || !workspaces?.length || needsWorkspaceChoice) {
    return (
      <DashboardContainer>
        <Paper className="wt-student-connect wt-student-connect-column" withBorder radius="sm" p="lg">
          <Stack gap="lg">
            <header className="wt-student-page-heading">
              <Title order={1}>Choose your workspace</Title>
              <Text c="dimmed">Select your capstone class before connecting your student record.</Text>
            </header>
            {workspaceCatalogStatus === 'error' ? (
              <>
                <Alert color="red" role="alert">{workspaceCatalogError || 'Workspaces could not be loaded.'}</Alert>
                <Button variant="default" onClick={refreshWorkspaceCatalog}>Try again</Button>
              </>
            ) : workspaces?.length ? <StudentWorkspacePicker /> : (
              <>
                <Text>No workspaces are available yet. Ask your instructor for a class link, or check again later.</Text>
                <Button variant="default" onClick={refreshWorkspaceCatalog}>Check again</Button>
              </>
            )}
          </Stack>
        </Paper>
      </DashboardContainer>
    );
  }
  if (isLoading) return <LoadingDashboard />;
  if (dashboardStatus === 'error') return <DashboardContainer><ResourceBoundary status={dashboardStatus} error={dashboardError} onRetry={refreshDashboard} /></DashboardContainer>;

  if (!studentNumber) {
    const published = getPublishedDeliverables(state);
    return (
      <DashboardContainer>
        <div className="wt-student-connect-column">
          <header className="wt-student-page-heading">
            <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Account binding pending</Text>
            <Title order={1}>Submit your first form</Title>
            <Text c="dimmed">Your Google account binds to the Student Number only when your first valid submission is successfully saved.</Text>
          </header>
          <StudentWorkspacePicker key={activeWorkspaceId} />
          {dashboardError ? <ResourceBoundary status="ready" error={dashboardError} onRetry={refreshDashboard} /> : null}
          {workspaceCatalogError ? <ResourceBoundary status="ready" error={workspaceCatalogError} onRetry={refreshWorkspaceCatalog} /> : null}
          <Alert color="blue" icon={<WarningCircle size={18} />}>
            Selecting a Student Number or opening a form does not reserve the record. If another account has already completed the first successful submission for that Student Number, WildTrack will block the save and ask for administrator recovery.
          </Alert>
          {identityStudents.length ? <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
            <Stack gap="md">
              <Title order={2}>Published submission forms</Title>
              <Text size="sm" c="dimmed">Choose your Student Number inside the form. The successful save creates the account binding.</Text>
              {published.length ? published.map(deliverable => (
                <Button key={deliverable.id} component={Link}
                  to={`/w/${workspaceKey}/submit/${deliverable.slug}`} variant="default">
                  Open {deliverable.shortTitle || deliverable.title}
                </Button>
              )) : <Text c="dimmed">No submission forms are published yet.</Text>}
            </Stack>
          </Paper> : (
            <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
              <StudentDataUnavailable error={loadError} onRetry={refreshDashboard} />
            </Paper>
          )}
        </div>
      </DashboardContainer>
    );
  }

  if (!student) {
    return (
      <DashboardContainer>
        <StudentWorkspacePicker key={activeWorkspaceId} />
        <StudentDataUnavailable
          title="Student record unavailable"
          error="The connected Student Number is not present in this workspace's current Team Formation data."
        />
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer>
      <header className="wt-student-page-heading">
        <Title order={1}>Student Dashboard</Title>
        <Text c="dimmed">Your submissions, adviser feedback, and class-record progress in one place.</Text>
      </header>

      <StudentWorkspacePicker key={activeWorkspaceId} />
      {dashboardError ? <ResourceBoundary status="ready" error={dashboardError} onRetry={refreshDashboard} /> : null}
      {workspaceCatalogError ? <ResourceBoundary status="ready" error={workspaceCatalogError} onRetry={refreshWorkspaceCatalog} /> : null}

      <StudentWelcomeBanner student={student} rows={deliverableRows} />
      <StudentProfileSummary
        account={activeAccount}
        student={student}
        project={project}
        adviserLabel={adviserLabel}
      />
      <StudentDeliverableList rows={deliverableRows} workspaceKey={workspaceKey} studentNumber={student.studentNumber} />
      <StudentProgressPanel activeColumns={activeColumns} student={student} />
    </DashboardContainer>
  );
}

function DashboardContainer({ children }) {
  return (
    <div className="wt-student-dashboard-page">
      <Container size="lg" className="wt-student-dashboard-container">
        <Stack gap="lg">{children}</Stack>
      </Container>
    </div>
  );
}

function SignedOutDashboard({ error, onAuthenticated }) {
  return (
    <DashboardContainer>
      <GoogleIdentityAccess
        description="Open your WildTrack dashboard to check submissions, tracker progress, and adviser feedback."
        error={error}
        onAuthenticated={onAuthenticated}
      />
    </DashboardContainer>
  );
}

function LoadingDashboard() {
  return (
    <DashboardContainer>
      <div aria-label="Loading student dashboard">
        <Title order={1}>Student Dashboard</Title>
        <Stack gap="md" mt="lg">
          <Skeleton height={150} radius="sm" />
          <Skeleton height={260} radius="sm" />
          <Skeleton height={170} radius="sm" />
        </Stack>
      </div>
    </DashboardContainer>
  );
}

function StudentDataUnavailable({
  title = 'Student records are not available yet',
  error = '',
  actionLabel = 'Try again',
  onRetry
}) {
  return (
    <Paper className="wt-student-data-state" withBorder radius="sm" p="xl">
      <ThemeIcon color="orange" variant="light" radius="sm" size={44}>
        <WarningCircle size={24} aria-hidden="true" />
      </ThemeIcon>
      <div>
        <Title order={2}>{title}</Title>
        <Text c="dimmed">{error || 'The Team Formation sheet must be connected before a student record can be selected.'}</Text>
      </div>
      {onRetry ? (
        <Button variant="default" leftSection={<ArrowClockwise size={18} />} onClick={onRetry}>{actionLabel}</Button>
      ) : null}
    </Paper>
  );
}

function buildStudentDeliverableRow(deliverable, response, recorded, teamProgress) {
  if (!response) {
    return {
      deliverable,
      response: null,
      recorded,
      status: recorded ? 'Response recorded' : 'Not submitted',
      savedAt: '',
      link: '',
      feedback: null,
      documentCheck: null,
      teamProgress,
      fileCheck: {
        label: recorded ? 'Private response' : 'Not submitted',
        summary: recorded ? 'Response details are private to the Google account that submitted them.' : 'No response has been recorded.',
        tone: 'neutral'
      }
    };
  }

  const feedback = response.feedback?.find((item) => item.visibility !== 'Staff') || null;
  const accepted = response.primaryStatus === 'Accepted' || response.reviewStatus === 'Accepted';
  const artifacts = buildStudentArtifacts(deliverable, response);
  const singleArtifact = artifacts.length === 1 ? artifacts[0] : null;
  return {
    deliverable,
    response,
    recorded: true,
    status: accepted ? 'Accepted' : 'Submitted',
    savedAt: response.updatedAt || response.submittedAt || '',
    link: singleArtifact?.isLink ? singleArtifact.value : '',
    feedback,
    documentCheck: singleArtifact?.reviewablePdf ? singleArtifact.documentCheck : null,
    artifacts,
    teamProgress,
    fileCheck: getStudentFileCheck(response, artifacts)
  };
}

function getStudentFileCheck(response, artifacts = []) {
  if (artifacts.length > 1) {
    const reviewableArtifacts = artifacts.filter((artifact) => artifact.reviewablePdf);
    if (!reviewableArtifacts.length) {
      return {
        label: 'Artifacts submitted',
        summary: `${artifacts.length} submitted file or link artifacts are available.`,
        tone: 'neutral'
      };
    }
    if (reviewableArtifacts.some(artifactNeedsAttention)) {
      return {
        label: 'Some files need attention',
        summary: 'At least one submitted PDF has a failed, outdated, or attention-required Document Check.',
        tone: 'warning'
      };
    }
    if (reviewableArtifacts.every((artifact) => artifact.documentCheckStatus === 'Ready for review')) {
      return {
        label: 'All files accessible',
        summary: 'All submitted PDF artifacts with Document Check enabled are accessible and current.',
        tone: 'success'
      };
    }
    return {
      label: 'Checks pending',
      summary: 'One or more submitted PDF artifacts are still waiting for a current Document Check.',
      tone: 'neutral'
    };
  }

  const check = response.documentCheck;
  const status = String(check?.status || response.fileCheckStatus || '').toUpperCase();
  if (['PENDING', 'RUNNING', 'QUEUED'].includes(status)) {
    return { label: 'Checking file', summary: 'Document Check is reading the submitted file.', tone: 'neutral' };
  }
  if (['FAILED', 'ERROR'].includes(status)) {
    return { label: 'Could not check file', summary: check?.summary || response.checkSummary || 'The submitted file could not be checked.', tone: 'danger' };
  }
  if (check) {
    const accessible = check.metadata?.canDownload !== false;
    const isPdf = !check.metadata?.mimeType || check.metadata.mimeType === 'application/pdf';
    const readable = check.document?.readable !== false;
    const needsAttention = !accessible || !isPdf || !readable;
    return {
      label: needsAttention ? 'File needs attention' : 'File accessible',
      summary: check.summary || (needsAttention ? 'Review the Document Check details.' : 'The submitted PDF is accessible and readable.'),
      tone: needsAttention ? 'warning' : 'success'
    };
  }
  return { label: 'Not checked', summary: 'Document Check has not inspected this response yet.', tone: 'neutral' };
}

function artifactNeedsAttention(artifact) {
  if (!artifact?.reviewablePdf) return false;
  if (['Needs attention', 'Outdated'].includes(artifact.documentCheckStatus)) return true;
  const report = artifact.documentCheck;
  if (!report) return false;
  if (report.status === 'Unavailable') return true;
  if (report.metadata?.canDownload === false) return true;
  if (report.metadata?.mimeType && report.metadata.mimeType !== 'application/pdf') return true;
  if (report.document?.readable === false) return true;
  return false;
}

function buildStudentArtifacts(deliverable, response) {
  return submissionArtifactFields(deliverable.fields || []).map((field) => {
    const value = String(response.values?.[field.id] || '').trim();
    if (!value) return null;
    const reviewablePdf = Boolean(field.pdfRequired && field.documentCheckPolicy !== 'OFF');
    return {
      key: field.definitionId || field.id,
      label: field.label || field.id || 'Submission artifact',
      typeLabel: submissionFieldTypeLabel(field),
      value,
      isLink: /^https?:\/\//i.test(value),
      reviewablePdf,
      documentCheck: reviewablePdf ? artifactDocumentCheck(response, field) : null,
      documentCheckStatus: reviewablePdf ? artifactDocumentCheckStatus(response, field) : 'Not applicable'
    };
  }).filter(Boolean);
}

function submissionFieldTypeLabel(field) {
  return ({
    drive: 'Google Drive PDF',
    googleForm: 'Google Form',
    googleSheet: 'Google Sheet',
    driveFolder: 'Google Drive folder',
    textarea: 'Text response',
    url: 'Link'
  })[field.type] || (field.pdfRequired ? 'PDF' : 'Submission field');
}

function buildDeliverableTeamProgress(state, student, deliverableId) {
  if (!student) return { expected: 0, submitted: 0, names: [] };
  const teamMembers = state.students.filter((item) => item.teamCode === student.teamCode);
  const teamNumbers = new Set(teamMembers.map((item) => normalizeStudentNumber(item.studentNumber)));
  const submittedMembers = new Set(state.attempts
    .filter((response) => (
      response.deliverableId === deliverableId
      && teamNumbers.has(normalizeStudentNumber(response.studentNumber))
    ))
    .map((response) => normalizeStudentNumber(response.studentNumber)));
  return {
    expected: teamMembers.length,
    submitted: submittedMembers.size,
    names: teamMembers
      .filter((member) => submittedMembers.has(normalizeStudentNumber(member.studentNumber)))
      .map((member) => member.name)
  };
}
