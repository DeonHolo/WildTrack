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
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { StatusIndicator } from '../components/ui.jsx';
import { APPLICATION_ROLES, useApplicationRole } from '../hooks/useApplicationRole.js';
import { getStoredPreviewAdviser, setStoredPreviewAdviser } from '../hooks/usePreviewRole.js';
import {
  deliverableUsesDocumentCheck,
  firstSubmissionLink,
  formatDate,
  formatDateTime,
  getAdviserOptions,
  getProjectMetadata,
  getPublishedDeliverables,
  getTeamAdviser,
  isAiReportCurrent,
  isDocumentCheckCurrent,
  makeDriveViewUrl,
  normalizeStudentNumber,
  sortDeliverables
} from '../lib/workflow.js';

export function AdviserViewPage() {
  const {
    state,
    markAccepted,
    revokeAcceptance,
    saveFeedback,
    runDocumentCheck,
    runDocumentChecks
  } = useWorkflow();
  const role = useApplicationRole();
  const isAdmin = role === APPLICATION_ROLES.ADMIN;
  const adviserOptions = useMemo(() => getAdviserOptions(state), [state]);
  const [adviserName, setAdviserName] = useState(() => resolveInitialAdviser(adviserOptions));
  const [query, setQuery] = useState('');
  const [selectedTeamCode, setSelectedTeamCode] = useState('');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [selectedOutputIds, setSelectedOutputIds] = useState({});
  const [feedback, setFeedback] = useState('');
  const [checkDialogId, setCheckDialogId] = useState('');
  const [batchProgress, setBatchProgress] = useState(null);

  const teams = useMemo(
    () => buildAdviserTeams(state, adviserName, query),
    [adviserName, query, state]
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
  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogId) || null;

  useEffect(() => {
    if (adviserOptions.includes(adviserName)) return;
    const nextAdviser = resolveInitialAdviser(adviserOptions);
    setAdviserName(nextAdviser);
    setStoredPreviewAdviser(nextAdviser);
  }, [adviserName, adviserOptions]);

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

  function submitFeedback(event) {
    event.preventDefault();
    const note = feedback.trim();
    if (!selectedResponse || !note) return;
    saveFeedback(selectedResponse.id, {
      note,
      author: adviserName || 'Adviser',
      visibility: 'Student'
    });
  }

  async function openDocumentCheck() {
    if (!selectedResponse) return;
    if (!isDocumentCheckCurrent(selectedResponse)) await runDocumentCheck(selectedResponse.id);
    setCheckDialogId(selectedResponse.id);
  }

  async function checkPendingResponses() {
    if (!selectedRow) return;
    const candidates = selectedRow.responses.filter((response) => (
      response.fileCheckStatus !== 'Checking' && !isDocumentCheckCurrent(response)
    ));
    if (!candidates.length) return;
    setBatchProgress({ completed: 0, total: candidates.length, failed: 0, done: false });
    const result = await runDocumentChecks(candidates.map((response) => response.id), {
      onProgress: ({ completed, total }) => setBatchProgress((current) => ({ ...current, completed, total }))
    });
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, done: true });
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
      onConfirm: () => markAccepted(selectedResponse.id, {
        name: adviserName || 'Adviser',
        role: 'Adviser',
        scope: 'Group output'
      })
    });
  }

  function confirmRevoke() {
    if (!selectedResponse) return;
    modals.openConfirmModal({
      title: 'Revoke this acceptance?',
      children: <Text size="sm">The selected group output returns to the review queue. Its member responses and feedback remain recorded.</Text>,
      labels: { confirm: 'Confirm revoke', cancel: 'Keep accepted' },
      confirmProps: { color: 'red' },
      onConfirm: () => revokeAcceptance(selectedResponse.id)
    });
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

      <Paper withBorder radius="md" className="wt-adviser-workbench">
        <aside className="wt-adviser-team-rail" aria-label="Assigned teams">
          <div className="wt-adviser-scope-head">
            {isAdmin ? (
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
                <Text fw={750}>{adviserName || 'No adviser identity selected'}</Text>
              </div>
            )}
            <Text size="xs" c="dimmed">{teams.length} assigned team{teams.length === 1 ? '' : 's'}</Text>
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
                  output={selectedOutput}
                  response={selectedResponse}
                  outputId={selectedOutput?.id || ''}
                  feedback={feedback}
                  batchProgress={batchProgress}
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
        response={checkDialogResponse}
        fileLink={firstSubmissionLink(checkDialogResponse?.values)}
        rechecking={checkDialogResponse?.fileCheckStatus === 'Checking'}
        onClose={() => setCheckDialogId('')}
        onRecheck={() => runDocumentCheck(checkDialogResponse.id)}
      />
    </Stack>
  );
}

function SelectedGroupOutput({
  row,
  team,
  output,
  response,
  outputId,
  feedback,
  batchProgress,
  onSelectOutput,
  onFeedbackChange,
  onSubmitFeedback,
  onOpenDocumentCheck,
  onCheckPending,
  onAccept,
  onRevoke
}) {
  const link = output?.link || '';
  const currentFeedback = response?.feedback?.find((item) => item.visibility !== 'Staff') || null;
  const pendingChecks = row.responses.filter((item) => item.fileCheckStatus !== 'Checking' && !isDocumentCheckCurrent(item));
  const aiReport = response?.aiReport;
  const aiCurrent = isAiReportCurrent(response);
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
          {link ? (
            <Button component="a" href={makeDriveViewUrl(link)} target="_blank" rel="noreferrer" variant="default" leftSection={<ArrowSquareOut size={17} aria-hidden="true" />}>
              Open group file
            </Button>
          ) : null}
          {deliverableUsesDocumentCheck(row.deliverable) && response ? (
            <Button variant="default" leftSection={<MagnifyingGlass size={17} aria-hidden="true" />} onClick={onOpenDocumentCheck}>
              {isDocumentCheckCurrent(response) ? 'View Document Check' : 'Check document'}
            </Button>
          ) : null}
          {accepted ? (
            <Button color="red" variant="light" leftSection={<XCircle size={17} />} disabled={response.archiveStatus === 'Archived'} onClick={onRevoke}>Revoke acceptance</Button>
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
        <div className="wt-adviser-detail-grid">
          <section>
            <div className="wt-adviser-detail-heading">
              <Text fw={800}>Document Check</Text>
              <StatusIndicator status={documentCheckLabel(response, row.deliverable)} />
            </div>
            <Text size="sm">{response.documentCheck?.summary || response.checkSummary || 'No current Document Check is available for this file.'}</Text>
            {pendingChecks.length ? (
              <Button mt="md" variant="subtle" size="sm" leftSection={<Files size={16} />} onClick={onCheckPending} disabled={Boolean(batchProgress && !batchProgress.done)}>
                Check {pendingChecks.length} unchecked member response{pendingChecks.length === 1 ? '' : 's'}
              </Button>
            ) : null}
            {batchProgress ? (
              <div className="wt-adviser-batch-progress" role="status">
                <Group justify="space-between" gap="sm">
                  <Text size="xs" fw={750}>{batchProgress.done ? 'Checks complete' : 'Checking documents'}</Text>
                  <Text size="xs" c="dimmed">{batchProgress.completed}/{batchProgress.total}{batchProgress.failed ? ` | ${batchProgress.failed} failed` : ''}</Text>
                </Group>
                <Progress value={(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100} color="wildtrackMaroon" size="sm" mt={6} />
              </div>
            ) : null}
          </section>

          <section>
            <div className="wt-adviser-detail-heading">
              <Text fw={800}>AI Review</Text>
              <StatusIndicator status={aiCurrent ? 'Reviewed' : 'Not reviewed'} />
            </div>
            {aiCurrent ? (
              <Stack gap="xs">
                <Text size="sm">{aiReport.summary}</Text>
                {aiReport.flags?.length ? <Text size="xs"><strong>Flags:</strong> {aiReport.flags.join(', ')}</Text> : null}
                {aiReport.missingSections?.length ? <Text size="xs"><strong>Missing or weak:</strong> {aiReport.missingSections.join(', ')}</Text> : null}
                {aiReport.suggestedAction ? <Text size="xs"><strong>Suggested action:</strong> {aiReport.suggestedAction}</Text> : null}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">No current AI Review is available. AI Review is initiated by Sir/Admin.</Text>
            )}
          </section>
        </div>
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
    .filter((team) => team.assignedAdviser === adviserName)
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
      hasConflict: outputs.filter((output) => output.link).length > 1,
      receivedMemberCount: receivedMembers.size,
      responseCount: responses.length
    };
  });
}

function groupEquivalentResponses(responses, members) {
  const groups = new Map();
  responses.forEach((response) => {
    const link = firstSubmissionLink(response.values);
    const signature = outputSignature(response.values) || `response:${response.id}`;
    const current = groups.get(signature) || { id: signature, link, responses: [], latest: response, senderNames: [] };
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
  if (response.fileCheckStatus === 'Checking') return 'Checking';
  if (response.fileCheckStatus === 'Error' || response.documentCheck?.status === 'Error') return 'Could not check';
  if (!isDocumentCheckCurrent(response)) return 'Not checked';
  return response.documentCheck?.redFlags?.length || response.documentCheck?.missingSections?.length ? 'Needs attention' : 'Ready for review';
}

function decisionLabel(response) {
  if (!response) return 'Not reviewed';
  return response.reviewStatus === 'Accepted' ? 'Accepted' : 'Needs Review';
}
