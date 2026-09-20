import { Button, Group, Modal, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { ArrowSquareOut, NotePencil } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { formatDate, formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';
import { DocumentCheckDialog } from '../review/DocumentCheckDialog.jsx';
import { ResponseTimingSummary } from '../ResponseTimingSummary.jsx';
import { StatusIndicator } from '../ui.jsx';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'To submit', value: 'missing' },
  { label: 'Submitted', value: 'submitted' },
];

export function StudentDeliverableList({ rows, workspaceId, workspaceKey, studentNumber }) {
  const [filter, setFilter] = useState('all');
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [activeCheck, setActiveCheck] = useState(null);
  const [activeArtifacts, setActiveArtifacts] = useState(null);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filter === 'missing') return row.status === 'Not submitted';
    if (filter === 'submitted') return row.status !== 'Not submitted';
    return true;
  }), [filter, rows]);
  const submittedCount = rows.filter((row) => row.status !== 'Not submitted').length;

  return (
    <Paper className="wt-student-deliverables" withBorder radius="sm">
      <div className="wt-student-section-head">
        <div>
          <Title order={2}>Deliverables</Title>
          <Text size="sm" c="dimmed">
            {submittedCount} of {rows.length} submitted
          </Text>
        </div>
        <SegmentedControl
          aria-label="Filter deliverables"
          value={filter}
          onChange={setFilter}
          data={FILTERS}
          color="wildtrackMaroon"
          size="sm"
        />
      </div>

      <div className="wt-student-deliverable-list" role="list" aria-label="Your deliverables">
        {filteredRows.map((row) => {
          const formUrl = `/w/${workspaceKey}/submit/${row.deliverable.slug}?student=${encodeURIComponent(studentNumber)}`;
          const hasMultipleArtifacts = (row.artifacts?.length || 0) > 1;
          return (
            <article className="wt-student-deliverable-row" role="listitem" key={row.deliverable.id}>
              <div className="wt-student-deliverable-title">
                <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">{row.deliverable.shortTitle}</Text>
                <Text fw={750}>{row.deliverable.title}</Text>
                <Text size="xs" c="dimmed">
                  Due {formatDate(row.deliverable.dueAt)} | {row.deliverable.trackerColumn}
                </Text>
              </div>

              <div className="wt-student-deliverable-state">
                <StatusIndicator status={row.status} />
                {row.savedAt ? <Text size="xs" c="dimmed">Saved {formatDateTime(row.savedAt)}</Text> : null}
                {row.response?.timing ? <ResponseTimingSummary timing={row.response.timing} /> : null}
                <Text size="xs" c="dimmed" className="wt-nowrap wt-tabular">
                  {formatTeamProgress(row.teamProgress)}
                </Text>
              </div>

              {row.response || row.recorded ? <div className="wt-student-deliverable-detail">
                {row.response ? (
                  <>
                    <div className="wt-student-document-check-line">
                      <StatusIndicator status={row.fileCheck.label} />
                      <Text size="sm" c="dimmed" lineClamp={2}>{row.fileCheck.summary}</Text>
                    </div>
                    <Group gap="md" mt={4}>
                      {!hasMultipleArtifacts && row.documentCheck ? (
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          color="wildtrackMaroon"
                          onClick={() => setActiveCheck({
                            response: row.response,
                            documentCheck: row.documentCheck,
                            fileLink: row.link,
                            fieldId: row.artifacts?.[0]?.fieldId
                          })}
                        >
                          View Document Check
                        </Button>
                      ) : null}
                      {!hasMultipleArtifacts && row.artifacts?.[0]?.drivePdf && !row.documentCheck ? (
                        <Button variant="subtle" size="compact-sm" color="wildtrackMaroon" onClick={() => setActiveCheck({
                          response: row.response,
                          documentCheck: row.documentCheck,
                          fileLink: row.artifacts[0].value,
                          fieldId: row.artifacts[0].fieldId,
                          initialTab: 'history',
                          historyOnly: true
                        })}>File history</Button>
                      ) : null}
                      {row.feedback ? (
                        <Button variant="subtle" size="compact-sm" color="wildtrackMaroon" onClick={() => setActiveFeedback(row)}>
                          Read feedback
                        </Button>
                      ) : null}
                    </Group>
                  </>
                ) : row.recorded ? (
                  <Text size="sm" c="dimmed">A response is recorded for this Student Number. Its private details belong to the Google account that submitted it.</Text>
                ) : null}
              </div> : null}

              <Group className="wt-student-deliverable-actions" gap="xs" justify="flex-end" wrap="wrap">
                {hasMultipleArtifacts ? (
                  <Button
                    variant="default"
                    onClick={() => setActiveArtifacts(row)}
                  >
                    View submitted artifacts
                  </Button>
                ) : row.link ? (
                  <Button
                    component="a"
                    href={makeDriveViewUrl(row.link)}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    leftSection={<ArrowSquareOut size={17} aria-hidden="true" />}
                  >
                    Open file
                  </Button>
                ) : null}
                <Button
                  component="a"
                  href={formUrl}
                  target="_blank"
                  rel="noreferrer"
                  color={row.response ? 'wildtrackMaroon' : 'wildtrackGold'}
                  variant={row.response ? 'outline' : 'filled'}
                  leftSection={row.response ? <NotePencil size={17} aria-hidden="true" /> : <ArrowSquareOut size={17} aria-hidden="true" />}
                >
                  {row.response ? 'Edit response' : 'Open form'}
                </Button>
              </Group>
            </article>
          );
        })}
        {!filteredRows.length ? (
          <div className="wt-student-list-empty">
            <Text fw={700}>Nothing in this view</Text>
            <Text size="sm" c="dimmed">Choose another filter to see your deliverables.</Text>
          </div>
        ) : null}
      </div>

      <Modal
        opened={Boolean(activeFeedback)}
        onClose={() => setActiveFeedback(null)}
        title="Adviser feedback"
        centered
        size="lg"
      >
        {activeFeedback ? (
          <Stack gap="md">
            <div>
              <Text fw={750}>{activeFeedback.deliverable.title}</Text>
              <Text size="sm" c="dimmed">{activeFeedback.feedback.author}</Text>
            </div>
            <Text className="wt-modal-long-copy">{activeFeedback.feedback.note}</Text>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={Boolean(activeArtifacts)}
        onClose={() => setActiveArtifacts(null)}
        title="Submitted artifacts"
        centered
        size="lg"
      >
        {activeArtifacts ? (
          <Stack gap="md">
            <div>
              <Text fw={750}>{activeArtifacts.deliverable.title}</Text>
              <Text size="sm" c="dimmed">Open each submitted file or link, and review PDF checks separately when available.</Text>
            </div>
            {(activeArtifacts.artifacts || []).map((artifact) => (
              <Paper key={artifact.key} withBorder radius="sm" p="md" role="group" aria-label={`${artifact.label} artifact`}>
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div>
                      <Text fw={700}>{artifact.label}</Text>
                      <Text size="xs" c="dimmed">{artifact.typeLabel}</Text>
                    </div>
                    {artifact.reviewablePdf ? <StatusIndicator status={artifact.documentCheckStatus} /> : null}
                  </Group>
                  <Group gap="xs" wrap="wrap">
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
                    {artifact.reviewablePdf && artifact.documentCheck ? (
                      <Button
                        variant="subtle"
                        size="compact-sm"
                        color="wildtrackMaroon"
                        onClick={() => {
                          setActiveCheck({
                            response: activeArtifacts.response,
                            documentCheck: artifact.documentCheck,
                            fileLink: artifact.value,
                            fieldId: artifact.fieldId
                          });
                          setActiveArtifacts(null);
                        }}
                      >
                        View Document Check
                      </Button>
                    ) : null}
                    {artifact.drivePdf && !artifact.documentCheck ? (
                      <Button variant="subtle" size="compact-sm" color="wildtrackMaroon" onClick={() => {
                        setActiveCheck({
                          response: activeArtifacts.response,
                          documentCheck: artifact.documentCheck,
                          fileLink: artifact.value,
                          fieldId: artifact.fieldId,
                          initialTab: 'history',
                          historyOnly: true
                        });
                        setActiveArtifacts(null);
                      }}>File history</Button>
                    ) : null}
                  </Group>
                  {artifact.reviewablePdf ? (
                    <Text size="xs" c="dimmed">
                      {artifact.documentCheck?.summary || 'No current Document Check is available for this PDF.'}
                    </Text>
                  ) : null}
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : null}
      </Modal>

      <DocumentCheckDialog
        open={Boolean(activeCheck)}
        onClose={() => setActiveCheck(null)}
        response={activeCheck?.response || null}
        documentCheck={activeCheck?.documentCheck || null}
        fileLink={activeCheck?.fileLink || ''}
        initialTab={activeCheck?.initialTab || 'result'}
        historyOnly={Boolean(activeCheck?.historyOnly)}
        historyTarget={activeCheck?.fieldId && workspaceId && activeCheck?.response?.id ? {
          workspaceId, responseId: activeCheck.response.id, fieldId: activeCheck.fieldId
        } : null}
        audience="student"
        allowRecheck={false}
      />
    </Paper>
  );
}

function formatTeamProgress(progress) {
  const submitted = Number(progress?.submitted) || 0;
  const expected = Number(progress?.expected) || 0;
  if (!submitted) return 'No team members submitted';
  if (expected > 0 && submitted >= expected) {
    return `All ${expected} team member${expected === 1 ? '' : 's'} submitted`;
  }
  return `${submitted} of ${expected} team member${expected === 1 ? '' : 's'} submitted`;
}
