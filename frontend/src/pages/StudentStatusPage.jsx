import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { Alert, Button, Container, Group, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { StudentIdentityPanel } from '../components/public/StudentIdentityPanel.jsx';
import { StudentDeliverableList } from '../components/student/StudentDeliverableList.jsx';
import { StudentProfileSummary } from '../components/student/StudentProfileSummary.jsx';
import { StudentProgressPanel } from '../components/student/StudentProgressPanel.jsx';
import { StudentWelcomeBanner } from '../components/student/StudentWelcomeBanner.jsx';
import { StudentWorkspacePicker } from '../components/student/StudentWorkspacePicker.jsx';
import { StatusIndicator } from '../components/ui.jsx';
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
  getStudentOptions,
  getWorkspacePublicKey,
  isUsableAdviserName,
  makeDriveViewUrl,
  normalizeStudentNumber
} from '../lib/workflow.js';
import { confirmStudentAssociation, disconnectStudentAssociation } from '../lib/api.js';
import { emptyStudentDashboardState, loadStudentDashboard } from '../lib/studentDashboardClient.js';

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
  const [selectedNumber, setSelectedNumber] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [signInError, setSignInError] = useState('');
  const activeAccount = sessionAccount;
  const identityStudents = useMemo(() => getIdentityStudents(state.rosterOptions), [state.rosterOptions]);
  const connectionOptions = useMemo(() => getStudentOptions(identityStudents), [identityStudents]);
  const selectedStudent = useMemo(() => findStudent(identityStudents, selectedNumber), [identityStudents, selectedNumber]);
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
    setSelectedNumber('');
    setConnectionError('');
    setSignInError('');
  }, [isCurrentScope]);

  function connectSelectedRecord() {
    setConnectionError('');
    if (!selectedStudent) {
      setConnectionError('Choose a Student Number from this workspace before continuing.');
      return;
    }
    modals.openConfirmModal({
      title: 'Connect this student record?',
      children: (
        <Stack gap="xs">
          <Text size="sm">This associates <strong>{activeAccount.email}</strong> with this record in {activeWorkspace?.name}.</Text>
          <Text size="sm" fw={700}>{selectedStudent.name}</Text>
          <Text size="sm" c="dimmed">{selectedStudent.studentNumber} | {selectedStudent.teamCode} | Member {selectedStudent.memberNumber}</Text>
          <Text size="xs" c="dimmed">You can disconnect the record from this dashboard later.</Text>
        </Stack>
      ),
      labels: { confirm: 'Connect record', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        try {
          await confirmStudentAssociation(activeWorkspace.id, selectedStudent.studentNumber);
          await refreshDashboard();
          if (!isCurrentScope()) return;
          setConnectionError('');
        } catch (confirmError) {
          if (!isCurrentScope()) return;
          setConnectionError(confirmError.message || 'The connection could not be saved. Try again.');
        }
      }
    });
  }

  function disconnectRecord() {
    modals.openConfirmModal({
      title: 'Disconnect this student record?',
      children: (
        <Text size="sm">
          This removes the association from your Google account in {activeWorkspace?.name}. It does not delete submissions or class records.
        </Text>
      ),
      labels: { confirm: 'Disconnect record', cancel: 'Keep connected' },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        try {
          await disconnectStudentAssociation(activeWorkspace.id);
        } catch (disconnectError) {
          if (!isCurrentScope()) return;
          setConnectionError(disconnectError.message || 'The disconnection could not be saved. Try again.');
          return;
        }
        await refreshDashboard();
      }
    });
  }

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
    return (
      <DashboardContainer>
        <div className="wt-student-connect-column">
          <header className="wt-student-page-heading">
            <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Complete your profile</Text>
            <Title order={1}>Connect your student record</Title>
            <Text c="dimmed">Choose your Student Number once. WildTrack fills in the matching name and team details.</Text>
          </header>
          <StudentWorkspacePicker key={activeWorkspaceId} />
          {dashboardError ? <ResourceBoundary status="ready" error={dashboardError} onRetry={refreshDashboard} /> : null}
          {workspaceCatalogError ? <ResourceBoundary status="ready" error={workspaceCatalogError} onRetry={refreshWorkspaceCatalog} /> : null}
          {connectionError ? <Alert color="red" icon={<WarningCircle size={18} />} mb="md">{connectionError}</Alert> : null}
          {connectionOptions.length ? (
            <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
              <StudentIdentityPanel
                students={connectionOptions}
                student={selectedStudent}
                value={selectedNumber}
                activeAccount={activeAccount}
                returning={false}
                onChange={(value, selected) => {
                  setSelectedNumber(selected?.studentNumber || value);
                  setConnectionError('');
                }}
              />
              {connectionError ? <Alert color="red" mt="md" icon={<WarningCircle size={18} />}>{connectionError}</Alert> : null}
              <Button mt="lg" color="wildtrackMaroon" disabled={!selectedStudent} onClick={connectSelectedRecord}>
                Connect student record
              </Button>
            </Paper>
          ) : identityStudents.length ? (
            <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
              <StudentDataUnavailable
                title="No student records are available to connect"
                error="Every Student Number in this workspace is already associated with another account. Ask the administrator to review the account records."
              />
            </Paper>
          ) : (
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
          actionLabel="Disconnect record"
          onRetry={disconnectRecord}
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

      {connectionError ? <Alert color="red" icon={<WarningCircle size={18} />}>{connectionError}</Alert> : null}
      <StudentWelcomeBanner student={student} rows={deliverableRows} />
      <StudentProfileSummary
        account={activeAccount}
        student={student}
        project={project}
        adviserLabel={adviserLabel}
        onDisconnect={disconnectRecord}
      />
      <StudentDeliverableList rows={deliverableRows} workspaceKey={workspaceKey} studentNumber={student.studentNumber} />
      <StudentSubmissionArtifacts rows={deliverableRows} />
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
  const submittedLinks = artifacts.filter((artifact) => artifact.isLink).map((artifact) => artifact.value);
  const reviewableArtifacts = artifacts.filter((artifact) => artifact.reviewablePdf);
  const legacyDocumentCheck = reviewableArtifacts.length === 1 ? reviewableArtifacts[0].documentCheck : null;
  return {
    deliverable,
    response,
    recorded: true,
    status: accepted ? 'Accepted' : 'Submitted',
    savedAt: response.updatedAt || response.submittedAt || '',
    link: submittedLinks.length === 1 ? submittedLinks[0] : '',
    feedback,
    documentCheck: legacyDocumentCheck,
    artifacts,
    teamProgress,
    fileCheck: getStudentFileCheck(response, reviewableArtifacts)
  };
}

function getStudentFileCheck(response, reviewableArtifacts = []) {
  if (reviewableArtifacts.length > 1) {
    const statuses = reviewableArtifacts.map((artifact) => artifact.documentCheckStatus);
    if (statuses.includes('Needs attention')) {
      return { label: 'PDF needs attention', summary: 'At least one submitted PDF needs attention. Review the artifact details below.', tone: 'warning' };
    }
    if (statuses.includes('Outdated')) {
      return { label: 'PDF check outdated', summary: 'At least one PDF changed after its last Document Check.', tone: 'warning' };
    }
    if (statuses.every((status) => status === 'Ready for review')) {
      return { label: 'PDFs accessible', summary: 'All submitted PDF artifacts passed the current Document Check.', tone: 'success' };
    }
    return { label: 'PDF checks incomplete', summary: 'One or more submitted PDF artifacts have not been checked yet.', tone: 'neutral' };
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

function StudentSubmissionArtifacts({ rows }) {
  const multiArtifactRows = rows.filter((row) => row.response && row.artifacts?.length > 1);
  if (!multiArtifactRows.length) return null;

  return (
    <Paper withBorder radius="sm" p="lg" aria-label="Submitted artifacts">
      <Stack gap="lg">
        <div>
          <Title order={2}>Submitted artifacts</Title>
          <Text size="sm" c="dimmed">Multi-part deliverables keep each submitted link and each PDF check separate.</Text>
        </div>
        {multiArtifactRows.map((row) => (
          <section key={row.deliverable.id} aria-label={`${row.deliverable.shortTitle} submitted artifacts`}>
            <Stack gap="sm">
              <div>
                <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">{row.deliverable.shortTitle}</Text>
                <Text fw={750}>{row.deliverable.title}</Text>
              </div>
              {row.artifacts.map((artifact) => (
                <Paper key={artifact.key} withBorder radius="sm" p="md" role="group" aria-label={`${artifact.label} artifact`}>
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                      <div>
                        <Text fw={700}>{artifact.label}</Text>
                        <Text size="xs" c="dimmed">{artifact.typeLabel}</Text>
                      </div>
                      {artifact.reviewablePdf ? <StatusIndicator status={artifact.documentCheckStatus} /> : null}
                    </Group>
                    {artifact.isLink ? (
                      <Button
                        component="a"
                        href={makeDriveViewUrl(artifact.value)}
                        target="_blank"
                        rel="noreferrer"
                        variant="default"
                        size="xs"
                        leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}
                      >
                        Open {artifact.label}
                      </Button>
                    ) : <Text size="sm">{artifact.value}</Text>}
                    {artifact.reviewablePdf ? (
                      <Text size="xs" c="dimmed">{artifact.documentCheck?.summary || 'No current Document Check is available for this PDF.'}</Text>
                    ) : null}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </section>
        ))}
      </Stack>
    </Paper>
  );
}

function buildStudentArtifacts(deliverable, response) {
  return (deliverable.fields || []).map((field) => {
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
