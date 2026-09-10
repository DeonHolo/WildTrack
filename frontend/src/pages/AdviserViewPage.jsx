import { useStaffIdentity } from '../app/StaffIdentity.jsx';
import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
  NativeSelect,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  Title
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  ArrowSquareOut,
  CaretRight,
  CheckCircle,
  Files,
  FolderOpen,
  MagnifyingGlass,
  NotePencil,
  UsersThree,
  WarningCircle,
  XCircle
} from '@phosphor-icons/react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { StatusIndicator } from '../components/ui.jsx';
import { APPLICATION_ROLES, useApplicationRole } from '../hooks/useApplicationRole.js';
import { getStoredPreviewAdviser, setStoredPreviewAdviser } from '../hooks/usePreviewRole.js';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import {
  acceptResponse,
  applyDocumentCheck,
  applyReviewMutation,
  emptyReviewDesk,
  loadReviewDesk,
  revokeAcceptance,
  runDocumentCheck as runReviewDocumentCheck,
  runDocumentChecks as runReviewDocumentChecks,
  saveFeedback as saveReviewFeedback
} from '../lib/reviewDeskClient.js';
import {
  artifactAiReview,
  artifactAiReviewStatus,
  artifactDocumentCheck,
  artifactDocumentCheckStatus,
  deliverableUsesDocumentCheck,
  formatDate,
  formatDateTime,
  getAdviserOptions,
  getProjectMetadata,
  getPublishedDeliverables,
  getTeamAdviser,
  isArtifactAiReviewCurrent,
  isArtifactDocumentCheckCurrent,
  isAiReportCurrent,
  aiReviewStatus,
  makeDriveViewUrl,
  normalizeStudentNumber,
  reviewableSubmissionFields,
  sortDeliverables
} from '../lib/workflow.js';

export function AdviserViewPage() {
  const { activeWorkspaceId } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const { data: state, setData: setState, status: reviewStatus, error: reviewError, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadReviewDesk,
    emptyReviewDesk, 'monitoring');
  const role = useApplicationRole();
  const isAdmin = role === APPLICATION_ROLES.ADMIN;
  const adviserOptions = useMemo(() => getAdviserOptions(state), [state]);
  const { data: staffIdentity, status: identityStatus, error: identityError, reload: reloadIdentity } = useStaffIdentity();
  const [viewOtherAdviser, setViewOtherAdviser] = useState(false);
  const [adviserName, setAdviserName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedTeamCode, setSelectedTeamCode] = useState('');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [selectedOutputIds, setSelectedOutputIds] = useState({});
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(null);
  const [checkDialogTarget, setCheckDialogTarget] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [checkingIds, setCheckingIds] = useState(new Set());

  const teams = useMemo(
    () => buildAdviserTeams(state, isAdmin && viewOtherAdviser ? adviserName : null, query)
      .filter(team => isAdmin && viewOtherAdviser || (staffIdentity.assignments || []).some(a => a.workspaceId === activeWorkspaceId && a.teamCode === team.teamCode)),
    [adviserName, isAdmin, viewOtherAdviser, staffIdentity, activeWorkspaceId, query, state]
  );
  const selectedTeam = teams.find((team) => team.teamCode === selectedTeamCode) || teams[0] || null;
  const deliverableRows = useMemo(
    () => selectedTeam ? buildTeamDeliverableRows(state, selectedTeam) : [],
    [selectedTeam, state]
  );
  const selectedRow = deliverableRows.find((row) => row.deliverable.id === selectedDeliverableId) || deliverableRows[0] || null;
  const selectedOutputId = selectedRow ? selectedOutputIds[selectedRow.deliverable.id] : '';
  const selectedOutput = selectedRow?.outputs.find((output) => output.id === selectedOutputId) || selectedRow?.currentOutput || null;
  const selectedResponse = selectedOutput?.latest || null;
  const currentFeedback = selectedResponse?.feedback?.find((item) => item.visibility !== 'Staff') || null;
  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogTarget?.responseId) || null;
  const checkDialogDeliverable = checkDialogResponse
    ? state.deliverables.find((deliverable) => deliverable.id === checkDialogResponse.deliverableId) || null
    : null;
  const checkDialogField = checkDialogDeliverable?.fields?.find((field) => (
    artifactTargetKey(checkDialogResponse?.id, field) === checkDialogTarget?.targetKey
  )) || null;
  const checkDialogReport = checkDialogField ? artifactDocumentCheck(checkDialogResponse, checkDialogField) : null;

  useEffect(() => {
    setBatchProgress(null);
    setCheckingIds(new Set());
    setFeedbackError(null);
    setFeedback('');
    setCheckDialogTarget(null);
    setSelectedOutputIds({});
    setViewOtherAdviser(false);
  }, [isCurrentScope]);

  useEffect(() => {
    if (!viewOtherAdviser || reviewStatus !== 'ready' || adviserOptions.includes(adviserName)) return;
    const nextAdviser = resolveInitialAdviser(adviserOptions);
    setAdviserName(nextAdviser);
    setStoredPreviewAdviser(nextAdviser);
  }, [adviserName, adviserOptions, reviewStatus, viewOtherAdviser]);

  useEffect(() => {
    if (!selectedTeamCode && teams[0]) setSelectedTeamCode(teams[0].teamCode);
    if (selectedTeamCode && !teams.some((team) => team.teamCode === selectedTeamCode)) {
      setSelectedTeamCode(teams[0]?.teamCode || '');
    }
  }, [selectedTeamCode, teams]);

  useEffect(() => {
    setSelectedDeliverableId('');
    setSelectedOutputIds({});
    setBatchProgress(null);
  }, [selectedTeamCode]);

  useEffect(() => {
    setFeedback(currentFeedback?.note || '');
    setBatchProgress(null);
  }, [currentFeedback?.note, selectedResponse?.id]);

  function changeAdviser(value) {
    if (!value) return;
    setAdviserName(value);
    setStoredPreviewAdviser(value);
    setSelectedTeamCode('');
  }

  function selectDeliverable(deliverableId) {
    setSelectedDeliverableId(deliverableId);
    setFeedback('');
  }

  function selectOutput(outputId) {
    if (!selectedRow) return;
    setSelectedOutputIds((current) => ({ ...current, [selectedRow.deliverable.id]: outputId }));
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const note = feedback.trim();
    if (!selectedResponse || !note) return;
    setFeedbackError(null);
    try {
      const serverState = await saveReviewFeedback(selectedResponse.id, { note, visibility: 'Student' });
      if (!isCurrentScope()) return;
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((response) => response.id === selectedResponse.id ? applyReviewMutation(response, serverState) : response)
      }));
    } catch (error) {
      if (!isCurrentScope()) return;
      setFeedbackError({ responseId: selectedResponse.id, workspaceId: activeWorkspaceId, message: error.message || 'Feedback could not be saved. Please try again.' });
    }
  }

  async function openDocumentCheck(field) {
    if (!selectedResponse || !field) return;
    if (!isArtifactDocumentCheckCurrent(selectedResponse, field)) {
      const result = await runDocumentCheck(selectedResponse.id, field);
      if (!result.ok) return;
    }
    if (isCurrentScope()) {
      setCheckDialogTarget({
        responseId: selectedResponse.id,
        targetKey: artifactTargetKey(selectedResponse.id, field)
      });
    }
  }

  async function checkPendingResponses() {
    if (!selectedRow || !isCurrentScope()) return;
    const candidates = selectedRow.responses.flatMap((response) => (
      reviewableSubmissionFields(selectedRow.deliverable)
        .filter((field) => String(response.values?.[field.id] || '').trim())
        .filter((field) => !checkingIds.has(artifactTargetKey(response.id, field)))
        .filter((field) => !isArtifactDocumentCheckCurrent(response, field))
        .map((field) => ({ response, field }))
    ));
    if (!candidates.length) return;
    setBatchProgress({ completed: 0, total: candidates.length, failed: 0, done: false });
    const result = await runReviewDocumentChecks(activeWorkspaceId, candidates, state.deliverables, {
      shouldContinue: isCurrentScope,
      onProgress: ({ completed, total }) => {
        if (isCurrentScope()) setBatchProgress((current) => ({ ...current, completed, total }));
      }
    });
    if (!isCurrentScope()) return;
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) => {
        const completed = (result.results || []).filter((item) => item.attemptId === attempt.id && item.ok && item.report);
        return completed.reduce((updated, item) => applyDocumentCheck(updated, {
          ...item.report,
          fieldId: item.report.fieldId || item.fieldId || null
        }), attempt);
      })
    }));
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, done: true });
  }

  async function changeAcceptance(action) {
    if (!isCurrentScope()) return;
    setFeedbackError(null);
    try {
      const serverState = await action(selectedResponse.id);
      if (!isCurrentScope()) return;
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((response) => response.id === selectedResponse.id ? applyReviewMutation(response, serverState) : response)
      }));
    } catch (error) {
      if (!isCurrentScope()) return;
      setFeedbackError({ responseId: selectedResponse.id, workspaceId: activeWorkspaceId, message: error.message || 'The review decision could not be saved. Please try again.' });
    }
  }

  function confirmAccept() {
    if (!selectedResponse) return;
    modals.openConfirmModal({
      title: 'Accept this group output?',
      children: (
        <Text size="sm">
          This accepts the selected file for {selectedTeam.teamCode}. Individual member records remain available for grading and audit.
        </Text>
      ),
      labels: { confirm: 'Confirm acceptance', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      onConfirm: () => changeAcceptance(acceptResponse)
    });
  }

  function confirmRevoke() {
    if (!selectedResponse) return;
    modals.openConfirmModal({
      title: 'Revoke this acceptance?',
      children: <Text size="sm">The selected group output returns to the review queue. Its member responses and feedback remain recorded.</Text>,
      labels: { confirm: 'Confirm revoke', cancel: 'Keep accepted' },
      confirmProps: { color: 'red' },
      onConfirm: () => changeAcceptance(revokeAcceptance)
    });
  }

  async function runDocumentCheck(responseId, field = null) {
    const response = state.attempts.find((item) => item.id === responseId);
    if (!response) return { ok: false, error: 'The selected response was not found.' };
    const deliverable = state.deliverables.find((item) => item.id === response.deliverableId);
    const reviewableFields = reviewableSubmissionFields(deliverable);
    const targetField = field || (reviewableFields.length === 1 ? reviewableFields[0] : null);
    if (!targetField && reviewableFields.length > 1) return { ok: false, error: 'Choose which PDF artifact to check.' };
    if (!targetField) return { ok: false, error: 'This response has no reviewable PDF artifact.' };
    const targetKey = artifactTargetKey(responseId, targetField);
    if (!isCurrentScope() || checkingIds.has(targetKey)) return { ok: false };
    setFeedbackError(null);
    setCheckingIds((current) => new Set([...current, targetKey]));
    let result;
    try {
      result = await runReviewDocumentCheck(activeWorkspaceId, response, deliverable, targetField);
    } catch (error) {
      result = { ok: false, error: error?.message || 'Document Check could not finish.' };
    }
    if (!isCurrentScope()) return { ok: false };
    setCheckingIds((current) => new Set([...current].filter(id => id !== targetKey)));
    if (result.ok) {
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((item) => item.id === responseId ? applyDocumentCheck(item, {
          ...result.report,
          fieldId: result.report?.fieldId || targetField.definitionId || null
        }) : item)
      }));
    } else {
      setFeedbackError({ responseId, targetKey, workspaceId: activeWorkspaceId, message: result.error || 'Document Check could not finish. Please try again.' });
    }
    return result;
  }

  return (
    <Stack gap="lg" className="wt-adviser-page">
      <Group justify="space-between" align="flex-end" gap="lg" wrap="wrap">
        <div>
          <Text className="wt-eyebrow">Assigned-team review</Text>
          <Title order={1}>My advised teams</Title>
          <Text c="dimmed">Review one usable group output per deliverable while WildTrack preserves every member response.</Text>
        </div>
        <TextInput
          aria-label="Search assigned teams"
          placeholder="Search team or project"
          leftSection={<MagnifyingGlass size={18} aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="wt-adviser-search"
        />
      </Group>

      <ResourceBoundary status={identityStatus !== 'ready' ? identityStatus : reviewStatus} error={identityError || reviewError} onRetry={() => { reload(); reloadIdentity?.(); }}>
      {feedbackError?.responseId === selectedResponse?.id && feedbackError?.workspaceId === activeWorkspaceId ? (
        <Alert color="red" role="alert">{feedbackError.message}</Alert>
      ) : null}

      <Paper withBorder radius="md" className="wt-adviser-workbench">
        <aside className="wt-adviser-team-rail" aria-label="Assigned teams">
          <div className="wt-adviser-scope-head">
            {isAdmin && viewOtherAdviser ? (
              <Select
                label="Reviewing as adviser"
                data={adviserOptions}
                value={adviserName}
                onChange={changeAdviser}
                allowDeselect={false}
                searchable={adviserOptions.length > 8}
              />
            ) : (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={800}>Adviser</Text>
                <Text fw={750}>{staffIdentity.adviserName || 'Your assigned teams'}</Text>
              </div>
            )}
            <Text size="xs" c="dimmed">{teams.length} assigned team{teams.length === 1 ? '' : 's'}</Text>
            {isAdmin ? <Button size="compact-xs" variant="subtle" mt="xs" onClick={() => setViewOtherAdviser(value => !value)}>
              {viewOtherAdviser ? 'Back to my teams' : 'View another adviser'}</Button> : null}
          </div>

          <ScrollArea className="wt-adviser-team-scroll" type="auto" offsetScrollbars>
            <Stack gap={4} role="list">
              {teams.map((team) => (
                <button
                  key={team.teamCode}
                  type="button"
                  className={`wt-adviser-team-button ${team.teamCode === selectedTeam?.teamCode ? 'is-selected' : ''}`}
                  aria-current={team.teamCode === selectedTeam?.teamCode ? 'true' : undefined}
                  onClick={() => setSelectedTeamCode(team.teamCode)}
                >
                  <span>
                    <strong>{team.teamCode}</strong>
                    <small>{team.project?.softwareName || team.project?.projectTitle || 'Project details unavailable'}</small>
                  </span>
                  <span className="wt-adviser-team-count">{team.responseCount}</span>
                </button>
              ))}
            </Stack>
          </ScrollArea>

          {!teams.length ? (
            <div className="wt-adviser-empty-rail">
              <UsersThree size={28} aria-hidden="true" />
              <Text fw={750}>No assigned teams</Text>
              <Text size="xs" c="dimmed">This adviser has no team assignment in the active workspace.</Text>
            </div>
          ) : null}
        </aside>

        <main className="wt-adviser-team-main">
          {selectedTeam ? (
            <>
              <header className="wt-adviser-team-header">
                <div>
                  <Group gap="xs" wrap="wrap">
                    <Text component="span" className="wt-mono" fw={800}>{selectedTeam.teamCode}</Text>
                    <Text size="sm" c="dimmed">{selectedTeam.members.length} member{selectedTeam.members.length === 1 ? '' : 's'}</Text>
                  </Group>
                  <Title order={2}>{selectedTeam.project?.softwareName || selectedTeam.project?.projectTitle || 'Project details unavailable'}</Title>
                  {selectedTeam.project?.projectTitle && selectedTeam.project.projectTitle !== selectedTeam.project.softwareName ? (
                    <Text size="sm" c="dimmed">{selectedTeam.project.projectTitle}</Text>
                  ) : null}
                </div>
                <div className="wt-adviser-members">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={800}>Members</Text>
                  <Text size="sm">{selectedTeam.members.map((member) => member.name).join(', ')}</Text>
                </div>
              </header>

              <ScrollArea type="auto" offsetScrollbars className="wt-adviser-deliverables-scroll">
                <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" miw={780} className="wt-adviser-deliverables-table">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Deliverable</Table.Th>
                      <Table.Th>Received</Table.Th>
                      <Table.Th>Group file</Table.Th>
                      <Table.Th className="wt-review-status-cell">Document Check</Table.Th>
                      <Table.Th className="wt-review-status-cell">Decision</Table.Th>
                      <Table.Th><span className="wt-sr-only">Open details</span></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {deliverableRows.map((row) => (
                      <Table.Tr
                        key={row.deliverable.id}
                        className={row.deliverable.id === selectedRow?.deliverable.id ? 'is-selected' : ''}
                        onClick={() => selectDeliverable(row.deliverable.id)}
                      >
                        <Table.Td>
                          <Text fw={800}>{row.deliverable.shortTitle}</Text>
                          <Text size="xs" c="dimmed">Due {formatDate(row.deliverable.dueAt)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={750}>{row.receivedMemberCount} of {selectedTeam.members.length} members</Text>
                          <Text size="xs" c="dimmed">{row.responseCount} individual record{row.responseCount === 1 ? '' : 's'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={750}>{groupFileLabel(row)}</Text>
                          <Text size="xs" c={row.hasConflict ? 'red' : 'dimmed'}>{row.hasConflict ? 'Selection required' : outputOwnerLabel(row.currentOutput)}</Text>
                        </Table.Td>
                        <Table.Td className="wt-review-status-cell">
                          <StatusIndicator status={documentCheckLabel(row.currentOutput?.latest, row.deliverable)} />
                        </Table.Td>
                        <Table.Td className="wt-review-status-cell">
                          <StatusIndicator status={decisionLabel(row.currentOutput?.latest)} />
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label={`Open ${row.deliverable.shortTitle} details`}>
                            <ActionIcon
                              variant="subtle"
                              color="wildtrackMaroon"
                              aria-label={`Open ${row.deliverable.shortTitle} details`}
                              onClick={(event) => {
                                event.stopPropagation();
                                selectDeliverable(row.deliverable.id);
                              }}
                            >
                              <CaretRight size={18} aria-hidden="true" />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              {selectedRow ? (
                <SelectedGroupOutput
                  row={selectedRow}
                  team={selectedTeam}
                  response={selectedResponse}
                  outputId={selectedOutput?.id || ''}
                  feedback={feedback}
                  batchProgress={batchProgress}
                  checkingFields={checkingIds}
                  onSelectOutput={selectOutput}
                  onFeedbackChange={setFeedback}
                  onSubmitFeedback={submitFeedback}
                  onOpenDocumentCheck={openDocumentCheck}
                  onCheckPending={checkPendingResponses}
                  onAccept={confirmAccept}
                  onRevoke={confirmRevoke}
                />
              ) : null}
            </>
          ) : (
            <div className="wt-adviser-empty-main">
              <ThemeIcon size={52} radius="md" variant="light" color="wildtrackMaroon"><FolderOpen size={28} aria-hidden="true" /></ThemeIcon>
              <Title order={2}>Choose an assigned team</Title>
              <Text c="dimmed">Team deliverables and the current group output appear here.</Text>
            </div>
          )}
        </main>
      </Paper>

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse && checkDialogReport ? {
          ...checkDialogResponse,
          documentCheck: checkDialogReport,
          fileCheckStatus: checkDialogReport.status
        } : checkDialogResponse}
        fileLink={checkDialogField ? checkDialogResponse?.values?.[checkDialogField.id] : ''}
        rechecking={checkDialogField ? checkingIds.has(artifactTargetKey(checkDialogResponse?.id, checkDialogField)) : false}
        error={checkDialogField && feedbackError?.targetKey === artifactTargetKey(checkDialogResponse?.id, checkDialogField) ? feedbackError?.message : ''}
        onClose={() => setCheckDialogTarget(null)}
        onRecheck={() => runDocumentCheck(checkDialogResponse.id, checkDialogField)}
      />
      </ResourceBoundary>
    </Stack>
  );
}

function SelectedGroupOutput({
  row,
  team,
  response,
  outputId,
  feedback,
  batchProgress,
  checkingFields,
  onSelectOutput,
  onFeedbackChange,
  onSubmitFeedback,
  onOpenDocumentCheck,
  onCheckPending,
  onAccept,
  onRevoke
}) {
  const currentFeedback = response?.feedback?.find((item) => item.visibility !== 'Staff') || null;
  const pendingChecks = row.responses.flatMap((item) => (
    reviewableSubmissionFields(row.deliverable)
      .filter((field) => String(item.values?.[field.id] || '').trim())
      .filter((field) => !isArtifactDocumentCheckCurrent(item, field))
  ));
  const accepted = response?.reviewStatus === 'Accepted';

  return (
    <section className="wt-adviser-output-detail" aria-label={`${row.deliverable.shortTitle} group output details`}>
      <div className="wt-adviser-output-head">
        <div>
          <Text className="wt-eyebrow">Selected group output</Text>
          <Title order={3}>{row.deliverable.title}</Title>
          <Text size="sm" c="dimmed">{team.teamCode} | {row.receivedMemberCount} of {team.members.length} members submitted</Text>
        </div>
        <Group gap="xs" wrap="wrap">
          {accepted ? (
            <Button color="red" variant="light" leftSection={<XCircle size={17} />} onClick={onRevoke}>Revoke acceptance</Button>
          ) : (
            <Button color="wildtrackMaroon" leftSection={<CheckCircle size={17} aria-hidden="true" />} disabled={!response} onClick={onAccept}>Accept group output</Button>
          )}
        </Group>
      </div>

      {row.hasConflict ? (
        <Alert color="orange" variant="light" icon={<WarningCircle size={20} />} title={`${row.outputs.length} different files were submitted`}>
          Choose the file that represents the team's current output before leaving feedback or accepting it.
        </Alert>
      ) : null}

      {row.outputs.length > 1 ? (
        <NativeSelect
          label="Current group output"
          value={outputId}
          onChange={(event) => onSelectOutput(event.currentTarget.value)}
          data={row.outputs.map((item, index) => ({
            value: item.id,
            label: `File ${index + 1} | ${outputOwnerLabel(item)} | saved ${formatDateTime(item.latest.updatedAt || item.latest.submittedAt)}`
          }))}
        />
      ) : null}

      {!response ? (
        <Alert color="gray" variant="light" icon={<Files size={20} />} title="No group output received">
          No member of this team has submitted this deliverable yet.
        </Alert>
      ) : (
        <Stack gap="md">
          <section>
            <div className="wt-adviser-detail-heading">
              <Text fw={800}>Submission artifacts</Text>
              <Text size="xs" c="dimmed">Each PDF is checked and reviewed independently.</Text>
            </div>
            <Stack gap="sm" mt="sm">
              {(row.deliverable.fields || []).map((field) => (
                <AdviserArtifact
                  key={field.definitionId || field.id}
                  field={field}
                  response={response}
                  checking={checkingFields.has(artifactTargetKey(response.id, field))}
                  onOpenDocumentCheck={() => onOpenDocumentCheck(field)}
                />
              ))}
            </Stack>
          </section>
          {pendingChecks.length ? (
            <Button variant="subtle" size="sm" leftSection={<Files size={16} />} onClick={onCheckPending} disabled={Boolean(batchProgress && !batchProgress.done)}>
              {pendingCheckLabel(row.deliverable, pendingChecks.length)}
            </Button>
          ) : null}
          {batchProgress ? (
            <div className="wt-adviser-batch-progress" role="status">
              <Group justify="space-between" gap="sm">
                <Text size="xs" fw={750}>{batchProgress.done ? 'Checks complete' : 'Checking PDF artifacts'}</Text>
                <Text size="xs" c="dimmed">{batchProgress.completed}/{batchProgress.total}{batchProgress.failed ? ` | ${batchProgress.failed} failed` : ''}</Text>
              </Group>
              <Progress value={(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100} color="wildtrackMaroon" size="sm" mt={6} />
            </div>
          ) : null}
        </Stack>
      )}

      <Divider />

      <div className="wt-adviser-feedback-editor">
        <form onSubmit={onSubmitFeedback}>
          <Textarea
            label="Feedback for student"
            description="Students can read this note from their deliverable details."
            minRows={4}
            autosize
            maxRows={7}
            value={feedback}
            onChange={(event) => onFeedbackChange(event.currentTarget.value)}
            disabled={!response}
          />
          {currentFeedback ? (
            <Text size="xs" c="dimmed" mt="sm">
              Last updated {formatDateTime(currentFeedback.updatedAt || currentFeedback.createdAt)} by {currentFeedback.author}.
            </Text>
          ) : null}
          <Button
            mt="md"
            type="submit"
            color="wildtrackMaroon"
            leftSection={<NotePencil size={17} aria-hidden="true" />}
            disabled={!response || !feedback.trim() || feedback.trim() === currentFeedback?.note}
          >
            {currentFeedback ? 'Update feedback' : 'Save feedback'}
          </Button>
        </form>
      </div>
    </section>
  );
}

function AdviserArtifact({ field, response, checking, onOpenDocumentCheck }) {
  const value = String(response.values?.[field.id] || '').trim();
  const isLink = /^https?:\/\//i.test(value);
  const reviewablePdf = Boolean(field.pdfRequired && field.documentCheckPolicy !== 'OFF');
  const check = reviewablePdf ? artifactDocumentCheck(response, field) : null;
  const checkStatus = reviewablePdf ? adviserArtifactDocumentCheckStatus(response, field) : 'Not applicable';
  const aiEnabled = reviewablePdf && field.aiReviewEnabled !== false;
  const artifactReview = aiEnabled ? artifactAiReview(response, field) : null;
  const artifactReviewCurrent = aiEnabled && isArtifactAiReviewCurrent(response, field);
  const legacyReviewCurrent = aiEnabled && !field.definitionId && !artifactReview && isAiReportCurrent(response);
  const aiReport = artifactReviewCurrent ? artifactReview?.report : legacyReviewCurrent ? response.aiReport : null;
  const aiStatus = legacyReviewCurrent
    ? aiReviewStatus(response)
    : aiEnabled
      ? artifactAiReviewStatus(response, { ...field, aiReviewEnabled: true })
      : 'Not applicable';

  return (
    <Paper withBorder radius="sm" p="md" role="group" aria-label={`${field.label || 'Submission artifact'} artifact`}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Text fw={750}>{field.label || 'Submission artifact'}</Text>
            <Text size="xs" c="dimmed">{submissionFieldTypeLabel(field)}</Text>
          </div>
          {reviewablePdf ? <StatusIndicator status={checkStatus} /> : null}
        </Group>

        {value ? (
          isLink ? (
            <Button component="a" href={makeDriveViewUrl(value)} target="_blank" rel="noreferrer" variant="default" size="xs" leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}>
              Open submitted link
            </Button>
          ) : <Text size="sm">{value}</Text>
        ) : <Text size="sm" c="dimmed">No value submitted for this artifact.</Text>}

        {reviewablePdf ? (
          <Stack gap="xs">
            <Group gap="xs" wrap="wrap">
              <Button
                variant="light"
                color="wildtrackMaroon"
                size="xs"
                loading={checking}
                disabled={!value}
                leftSection={<MagnifyingGlass size={15} aria-hidden="true" />}
                onClick={onOpenDocumentCheck}
              >
                {isArtifactDocumentCheckCurrent(response, field) ? 'View Document Check' : 'Check document'}
              </Button>
              {aiEnabled ? <StatusIndicator status={aiStatus} /> : null}
            </Group>
            <Text size="sm" c="dimmed">{check?.summary || 'No current Document Check is available for this PDF.'}</Text>
            {aiEnabled ? (
              aiReport ? (
                <Stack gap={3}>
                  <Text size="sm">{aiReport.summary}</Text>
                  {aiReport.flags?.length ? <Text size="xs"><strong>Flags:</strong> {aiReport.flags.join(', ')}</Text> : null}
                  {aiReport.missingSections?.length ? <Text size="xs"><strong>Missing or weak:</strong> {aiReport.missingSections.join(', ')}</Text> : null}
                  {aiReport.suggestedAction ? <Text size="xs"><strong>Suggested action:</strong> {aiReport.suggestedAction}</Text> : null}
                </Stack>
              ) : <Text size="xs" c="dimmed">No current AI Review is available. AI Review is initiated by Sir/Admin.</Text>
            ) : null}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">Recorded as submission evidence. Document Check and AI Review do not apply to this artifact.</Text>
        )}
      </Stack>
    </Paper>
  );
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

function artifactTargetKey(responseId, field) {
  return `${responseId}:${field?.definitionId || field?.id || 'legacy'}`;
}

function adviserArtifactDocumentCheckStatus(response, field) {
  const report = artifactDocumentCheck(response, field);
  if (report && !report.checkedAt) return 'Not checked';
  return artifactDocumentCheckStatus(response, field);
}

function pendingCheckLabel(deliverable, count) {
  if (reviewableSubmissionFields(deliverable).length <= 1) {
    return `Check ${count} unchecked member response${count === 1 ? '' : 's'}`;
  }
  return `Check ${count} unchecked PDF artifact${count === 1 ? '' : 's'}`;
}

function resolveInitialAdviser(adviserOptions) {
  const stored = getStoredPreviewAdviser();
  return adviserOptions.includes(stored) ? stored : adviserOptions[0] || 'Unassigned';
}

export function buildAdviserTeams(state, adviserName, query = '') {
  const needle = query.trim().toLowerCase();
  const teamCodes = [...new Set(state.students.map((student) => student.teamCode).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

  return teamCodes
    .map((teamCode) => {
      const members = state.students.filter((student) => student.teamCode === teamCode);
      const project = getProjectMetadata(state, teamCode);
      const assignedAdviser = getTeamAdviser(state, teamCode);
      const memberNumbers = new Set(members.map((member) => normalizeStudentNumber(member.studentNumber)));
      const responseCount = state.attempts.filter((response) => (
        response.teamCode === teamCode || memberNumbers.has(normalizeStudentNumber(response.studentNumber))
      )).length;
      return { teamCode, members, project, assignedAdviser, responseCount };
    })
    .filter((team) => adviserName == null || team.assignedAdviser === adviserName)
    .filter((team) => !needle || `${team.teamCode} ${team.project?.projectTitle || ''} ${team.project?.softwareName || ''}`.toLowerCase().includes(needle));
}

export function buildTeamDeliverableRows(state, team) {
  const teamNumbers = new Set(team.members.map((member) => normalizeStudentNumber(member.studentNumber)));
  return sortDeliverables(state, getPublishedDeliverables(state)).map((deliverable) => {
    const responses = state.attempts
      .filter((response) => response.deliverableId === deliverable.id)
      .filter((response) => response.teamCode === team.teamCode || teamNumbers.has(normalizeStudentNumber(response.studentNumber)))
      .sort(sortResponsesNewestFirst);
    const outputs = groupEquivalentResponses(responses, team.members);
    const receivedMembers = new Set(responses.map((response) => normalizeStudentNumber(response.studentNumber)).filter(Boolean));
    return {
      deliverable,
      responses,
      outputs,
      currentOutput: outputs[0] || null,
      hasConflict: outputs.filter((output) => output.hasSubmittedValue).length > 1,
      receivedMemberCount: receivedMembers.size,
      responseCount: responses.length
    };
  });
}

function groupEquivalentResponses(responses, members) {
  const groups = new Map();
  responses.forEach((response) => {
    const hasSubmittedValue = Object.values(response.values || {}).some((value) => String(value || '').trim());
    const signature = outputSignature(response.values) || `response:${response.id}`;
    const current = groups.get(signature) || { id: signature, hasSubmittedValue, responses: [], latest: response, senderNames: [] };
    current.responses.push(response);
    if (sortResponsesNewestFirst(response, current.latest) < 0) current.latest = response;
    const senderName = members.find((member) => normalizeStudentNumber(member.studentNumber) === normalizeStudentNumber(response.studentNumber))?.name || response.studentName;
    if (senderName && !current.senderNames.includes(senderName)) current.senderNames.push(senderName);
    groups.set(signature, current);
  });
  return [...groups.values()].sort((first, second) => sortResponsesNewestFirst(first.latest, second.latest));
}

function outputSignature(values = {}) {
  return Object.values(values)
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map(normalizeLinkForGrouping)
    .sort()
    .join('|');
}

function normalizeLinkForGrouping(value) {
  const driveFileId = value.match(/\/file\/d\/([^/?#]+)/i)?.[1] || value.match(/[?&]id=([^&#]+)/i)?.[1];
  if (driveFileId) return `drive:${driveFileId}`;
  return value.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
}

function sortResponsesNewestFirst(first, second) {
  return new Date(second.updatedAt || second.submittedAt || 0) - new Date(first.updatedAt || first.submittedAt || 0);
}

function outputOwnerLabel(output) {
  if (!output) return 'No file received';
  if (output.senderNames.length === 1) return output.senderNames[0];
  return `${output.senderNames.length} members submitted this file`;
}

function groupFileLabel(row) {
  if (!row.outputs.length) return 'No file';
  if (row.outputs.length === 1 && row.receivedMemberCount > 1) return '1 shared file';
  if (row.outputs.length === 1) return '1 file';
  return `${row.outputs.length} different files`;
}

function documentCheckLabel(response, deliverable) {
  if (!response || !deliverableUsesDocumentCheck(deliverable)) return 'Not applicable';
  const statuses = reviewableSubmissionFields(deliverable).map((field) => adviserArtifactDocumentCheckStatus(response, field));
  if (statuses.includes('Needs attention')) return 'Needs attention';
  if (statuses.includes('Outdated')) return 'Outdated';
  if (statuses.length && statuses.every((status) => status === 'Ready for review')) return 'Ready for review';
  return 'Not checked';
}

function decisionLabel(response) {
  if (!response) return 'Not reviewed';
  return response.reviewStatus === 'Accepted' ? 'Accepted' : 'Needs Review';
}
