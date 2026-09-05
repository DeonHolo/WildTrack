import { Alert, Button, Container, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { StudentIdentityPanel } from '../components/public/StudentIdentityPanel.jsx';
import { StudentDeliverableList } from '../components/student/StudentDeliverableList.jsx';
import { StudentProfileSummary } from '../components/student/StudentProfileSummary.jsx';
import { StudentProgressPanel } from '../components/student/StudentProgressPanel.jsx';
import { StudentWelcomeBanner } from '../components/student/StudentWelcomeBanner.jsx';
import { StudentWorkspacePicker } from '../components/student/StudentWorkspacePicker.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import {
  findOwnedResponse,
  findStudent,
  firstSubmissionLink,
  getActiveTrackerColumns,
  getIdentityStudents,
  getProjectMetadata,
  getPublishedDeliverables,
  getStudentOptions,
  getWorkspacePublicKey,
  isUsableAdviserName,
  normalizeStudentNumber
} from '../lib/workflow.js';
import { confirmStudentAssociation, getMyAssociation, disconnectStudentAssociation } from '../lib/api.js';

export function StudentStatusPage() {
  const {
    state,
    claimStudentNumber,
    disconnectStudentNumber,
    authenticateGoogleAccount,
    refreshBackendData
  } = useWorkflow();
  const {
    account: sessionAccount,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    needsWorkspaceChoice,
    workspaceCatalogStatus,
    workspaceCatalogError,
    refreshWorkspaceCatalog
  } = useWorkspaceSession();
  const [selectedNumber, setSelectedNumber] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [signInError, setSignInError] = useState('');
  const [backendAssociation, setBackendAssociation] = useState(null);
  const [associationLoadedFor, setAssociationLoadedFor] = useState('');
  const associationKey = !needsWorkspaceChoice && activeWorkspace?.id && sessionAccount?.email
    ? `${activeWorkspace.id}:${sessionAccount.email.toLowerCase()}`
    : '';
  // Ticket 03: the dashboard identity section is composed from the backend association.
  useEffect(() => {
    let cancelled = false;
    if (!associationKey) {
      setBackendAssociation(null);
      setAssociationLoadedFor('');
      return undefined;
    }
    getMyAssociation(activeWorkspace.id)
      .then((association) => {
        if (!cancelled) {
          setBackendAssociation(association || null);
          setAssociationLoadedFor(associationKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackendAssociation(null);
          setAssociationLoadedFor(associationKey);
        }
      });
    return () => { cancelled = true; };
  }, [activeWorkspace?.id, associationKey]);
  const activeAccount = sessionAccount;
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const connectionOptions = useMemo(() => getStudentOptions(identityStudents), [identityStudents]);
  const selectedStudent = useMemo(() => findStudent(identityStudents, selectedNumber), [identityStudents, selectedNumber]);
  const currentAssociation = associationLoadedFor === associationKey ? backendAssociation : null;
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
      const ownedResponse = findOwnedResponse(state.attempts, {
        deliverableId: deliverable.id,
        studentNumber: student.studentNumber,
        googleSubject: '',
        googleEmail: activeAccount.email
      });
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
  const syncStatus = String(state.backendSync?.status || '');
  const associationLoading = Boolean(associationKey && associationLoadedFor !== associationKey);
  const isSyncLoading = !state.backendSync?.lastLoadedAt && state.backendSync?.enabled !== false;
  const isLoading = associationLoading || isSyncLoading || state.dashboardStatus === 'loading' || /^loading\b/i.test(syncStatus);
  const loadError = state.dashboardStatus === 'error'
    ? state.dashboardError || 'Student records could not be loaded.'
    : state.backendSync?.lastError || '';

  useEffect(() => {
    setSelectedNumber('');
    setConnectionError('');
  }, [activeWorkspaceId]);

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
        try {
          const association = await confirmStudentAssociation(activeWorkspace.id, selectedStudent.studentNumber);
          setBackendAssociation(association);
          setAssociationLoadedFor(associationKey);
          claimStudentNumber(association?.studentNumber || selectedStudent.studentNumber);
          setConnectionError('');
        } catch (confirmError) {
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
        try {
          await disconnectStudentAssociation(activeWorkspace.id);
        } catch (disconnectError) {
          setConnectionError(disconnectError.message || 'The disconnection could not be saved. Try again.');
          return;
        }
        setBackendAssociation(null);
        setAssociationLoadedFor(associationKey);
        const result = disconnectStudentNumber();
        if (result && !result.ok) setConnectionError(result.error);
      }
    });
  }

  if (!activeAccount) {
    return (
      <SignedOutDashboard
        error={signInError}
        onAuthenticated={(identity) => {
          setSignInError('');
          const response = authenticateGoogleAccount(identity);
          if (!response.ok) setSignInError(response.error);
        }}
      />
    );
  }
  if (workspaceCatalogStatus === 'loading') return <LoadingDashboard />;
  if (workspaceCatalogStatus === 'error' || !workspaces?.length || needsWorkspaceChoice) {
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
              <StudentDataUnavailable error={loadError} onRetry={refreshBackendData} />
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
  return {
    deliverable,
    response,
    recorded: true,
    status: accepted ? 'Accepted' : 'Submitted',
    savedAt: response.updatedAt || response.submittedAt || '',
    link: firstSubmissionLink(response.values),
    feedback,
    documentCheck: response.documentCheck || null,
    teamProgress,
    fileCheck: getStudentFileCheck(response)
  };
}

function getStudentFileCheck(response) {
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
