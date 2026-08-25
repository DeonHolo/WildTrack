import { Alert, Badge, Button, Container, Modal, NativeSelect, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ArrowClockwise, Buildings, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { GoogleIdentityAccess } from '../components/auth/GoogleIdentityAccess.jsx';
import { StudentIdentityPanel } from '../components/public/StudentIdentityPanel.jsx';
import { StudentDeliverableList } from '../components/student/StudentDeliverableList.jsx';
import { StudentProfileSummary } from '../components/student/StudentProfileSummary.jsx';
import { StudentProgressPanel } from '../components/student/StudentProgressPanel.jsx';
import { StudentWelcomeBanner } from '../components/student/StudentWelcomeBanner.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
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
import { getMyAssociation, disconnectStudentAssociation } from '../lib/api.js';

export function StudentStatusPage() {
  const {
    state,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    switchWorkspace,
    claimStudentNumber,
    disconnectStudentNumber,
    authenticateGoogleAccount,
    refreshBackendData
  } = useWorkflow();
  const [selectedNumber, setSelectedNumber] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [signInError, setSignInError] = useState('');
  const [backendAssociation, setBackendAssociation] = useState(null);
  const [switchSectionModalOpen, setSwitchSectionModalOpen] = useState(false);
  // Ticket 03: the dashboard identity section is composed from the backend association.
  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspace?.id || !state.activeAccountEmail) { setBackendAssociation(null); return undefined; }
    getMyAssociation(activeWorkspace.id)
      .then((association) => { if (!cancelled) setBackendAssociation(association || null); })
      .catch(() => { if (!cancelled) setBackendAssociation(null); });
    return () => { cancelled = true; };
  }, [activeWorkspace?.id, state.activeAccountEmail]);
  const activeAccount = useMemo(() => state.studentAccounts.find(
    (account) => account.googleSubject && String(account.email || '').toLowerCase() === String(state.activeAccountEmail || '').toLowerCase()
  ) || null, [state.activeAccountEmail, state.studentAccounts]);
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const connectionOptions = useMemo(() => getStudentOptions(identityStudents, state.studentAccounts)
    .filter((student) => !student.claimed), [identityStudents, state.studentAccounts]);
  const selectedStudent = useMemo(() => findStudent(identityStudents, selectedNumber), [identityStudents, selectedNumber]);
  const studentNumber = backendAssociation?.studentNumber || activeAccount?.studentNumber || '';
  const student = useMemo(() => findStudent(state.students, studentNumber), [state.students, studentNumber]);
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
        googleSubject: activeAccount.googleSubject,
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
  const isLoading = state.dashboardStatus === 'loading' || /^loading\b/i.test(syncStatus);
  const loadError = state.dashboardStatus === 'error'
    ? state.dashboardError || 'Student records could not be loaded.'
    : state.backendSync?.lastError || '';

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
      onConfirm: () => {
        const result = claimStudentNumber(selectedStudent.studentNumber);
        if (result && !result.ok) setConnectionError(result.error);
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
      onConfirm: () => {
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
  if (isLoading) return <LoadingDashboard />;

  if (!activeAccount.studentNumber) {
    return (
      <DashboardContainer>
        <div className="wt-student-connect-column">
          <header className="wt-student-page-heading">
            <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Complete your profile</Text>
            <Title order={1}>Connect your student record</Title>
            <Text c="dimmed">Choose your Student Number once. WildTrack fills in the matching name and team details.</Text>
          </header>
          {connectionOptions.length ? (
            <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
              {workspaces && workspaces.length > 1 ? (
                <div className="wt-student-section-picker">
                  <NativeSelect
                    label="Capstone section"
                    description="Make sure you are viewing your enrolled capstone section."
                    value={activeWorkspaceId}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value && value !== activeWorkspaceId) {
                        setSelectedNumber('');
                        setConnectionError('');
                        switchWorkspace(value);
                      }
                    }}
                    data={workspaces.map((w) => ({
                      value: w.id,
                      label: `${w.program || 'Capstone'} — ${w.name}`
                    }))}
                    leftSection={<Buildings size={18} aria-hidden="true" />}
                    mb="md"
                  />
                </div>
              ) : null}
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
              {workspaces && workspaces.length > 1 ? (
                <div className="wt-student-section-picker">
                  <NativeSelect
                    label="Capstone section"
                    description="Make sure you are viewing your enrolled capstone section."
                    value={activeWorkspaceId}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value && value !== activeWorkspaceId) {
                        setSelectedNumber('');
                        setConnectionError('');
                        switchWorkspace(value);
                      }
                    }}
                    data={workspaces.map((w) => ({
                      value: w.id,
                      label: `${w.program || 'Capstone'} — ${w.name}`
                    }))}
                    leftSection={<Buildings size={18} aria-hidden="true" />}
                    mb="md"
                  />
                </div>
              ) : null}
              <StudentDataUnavailable
                title="No student records are available to connect"
                error="Every Student Number in this workspace is already associated with another account. Ask the administrator to review the account records."
              />
            </Paper>
          ) : (
            <Paper className="wt-student-connect" withBorder radius="sm" p="lg">
              {workspaces && workspaces.length > 1 ? (
                <div className="wt-student-section-picker">
                  <NativeSelect
                    label="Capstone section"
                    description="Make sure you are viewing your enrolled capstone section."
                    value={activeWorkspaceId}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value && value !== activeWorkspaceId) {
                        setSelectedNumber('');
                        setConnectionError('');
                        switchWorkspace(value);
                      }
                    }}
                    data={workspaces.map((w) => ({
                      value: w.id,
                      label: `${w.program || 'Capstone'} — ${w.name}`
                    }))}
                    leftSection={<Buildings size={18} aria-hidden="true" />}
                    mb="md"
                  />
                </div>
              ) : null}
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
        <div className="wt-student-heading-section-row">
          <Badge variant="light" color="wildtrackMaroon" size="sm">
            {activeWorkspace?.program || 'Capstone'} · {activeWorkspace?.courseCode || activeWorkspace?.name}
          </Badge>
          {workspaces && workspaces.length > 1 ? (
            <Button
              variant="subtle"
              size="compact-xs"
              color="gray"
              leftSection={<Buildings size={14} aria-hidden="true" />}
              onClick={() => setSwitchSectionModalOpen(true)}
            >
              Switch section
            </Button>
          ) : null}
        </div>
        <Title order={1}>Student Dashboard</Title>
        <Text c="dimmed">Your submissions, adviser feedback, and class-record progress in one place.</Text>
      </header>

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

      {workspaces && workspaces.length > 1 ? (
        <Modal
          opened={switchSectionModalOpen}
          onClose={() => setSwitchSectionModalOpen(false)}
          title="Switch Capstone Section"
          centered
          size="sm"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Select another academic workspace to view your deliverables and progress for that course.
            </Text>
            <NativeSelect
              label="Enrolled section"
              value={activeWorkspaceId}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value && value !== activeWorkspaceId) {
                  switchWorkspace(value);
                  setSwitchSectionModalOpen(false);
                }
              }}
              data={workspaces.map((w) => ({
                value: w.id,
                label: `${w.program || 'Capstone'} — ${w.name}`
              }))}
              leftSection={<Buildings size={18} aria-hidden="true" />}
            />
          </Stack>
        </Modal>
      ) : null}
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
