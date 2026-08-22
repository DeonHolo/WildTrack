import { Badge, Button, Group, Modal, Paper, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowSquareOut, CheckCircle, FilePdf, NotePencil, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { formatDate, formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'To submit', value: 'missing' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Feedback', value: 'feedback' }
];

export function StudentDeliverableList({ rows, workspaceKey, studentNumber }) {
  const [filter, setFilter] = useState('all');
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [activeCheck, setActiveCheck] = useState(null);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filter === 'missing') return row.status === 'Not submitted';
    if (filter === 'submitted') return row.status !== 'Not submitted';
    if (filter === 'feedback') return Boolean(row.feedback);
    return true;
  }), [filter, rows]);
  const submittedCount = rows.filter((row) => row.status !== 'Not submitted').length;
  const feedbackCount = rows.filter((row) => row.feedback).length;

  return (
    <Paper className="wt-student-deliverables" withBorder radius="sm">
      <div className="wt-student-section-head">
        <div>
          <Title order={2}>Deliverables</Title>
          <Text size="sm" c="dimmed">
            {submittedCount} of {rows.length} submitted{feedbackCount ? ` | ${feedbackCount} with adviser feedback` : ''}
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
                <StatusBadge status={row.status} />
                {row.savedAt ? <Text size="xs" c="dimmed">Saved {formatDateTime(row.savedAt)}</Text> : null}
                <Text size="xs" c="dimmed" className="wt-nowrap wt-tabular">
                  Team {row.teamProgress.submitted}/{row.teamProgress.expected} submitted
                </Text>
              </div>

              <div className="wt-student-deliverable-detail">
                {row.response ? (
                  <>
                    <Group gap={7} wrap="nowrap">
                      <FileCheckIcon tone={row.fileCheck.tone} />
                      <Text size="sm" fw={650}>{row.fileCheck.label}</Text>
                    </Group>
                    <Text size="sm" c="dimmed" lineClamp={2}>{row.fileCheck.summary}</Text>
                    <Group gap="md" mt={4}>
                      {row.documentCheck ? (
                        <Button variant="subtle" size="compact-sm" color="wildtrackMaroon" onClick={() => setActiveCheck(row)}>
                          View Document Check
                        </Button>
                      ) : null}
                      {row.feedback ? (
                        <Button variant="subtle" size="compact-sm" color="wildtrackMaroon" onClick={() => setActiveFeedback(row)}>
                          Read feedback
                        </Button>
                      ) : null}
                    </Group>
                    {row.feedback ? (
                      <Text className="wt-feedback-preview" size="xs" c="dimmed">
                        {truncateText(row.feedback.note, 150)}
                      </Text>
                    ) : null}
                  </>
                ) : row.recorded ? (
                  <Text size="sm" c="dimmed">A response is recorded for this Student Number. Its private details belong to the Google account that submitted it.</Text>
                ) : (
                  <Text size="sm" c="dimmed">No response has been recorded.</Text>
                )}
              </div>

              <Group className="wt-student-deliverable-actions" gap="xs" justify="flex-end" wrap="wrap">
                {row.link ? (
                  <Button
                    component="a"
                    href={makeDriveViewUrl(row.link)}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    leftSection={<ArrowSquareOut size={17} />}
                  >
                    Open submitted file link
                  </Button>
                ) : null}
                <Button
                  component="a"
                  href={formUrl}
                  target="_blank"
                  rel="noreferrer"
                  color={row.response ? 'wildtrackMaroon' : 'wildtrackGold'}
                  variant={row.response ? 'outline' : 'filled'}
                  leftSection={row.response ? <NotePencil size={17} /> : <ArrowSquareOut size={17} />}
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
        opened={Boolean(activeCheck)}
        onClose={() => setActiveCheck(null)}
        title="Document Check"
        centered
        size="lg"
      >
        {activeCheck ? <DocumentCheckDetails row={activeCheck} /> : null}
      </Modal>
    </Paper>
  );
}

function StatusBadge({ status }) {
  const tone = status === 'Accepted' ? 'green' : status === 'Not submitted' ? 'gray' : 'blue';
  return <Badge color={tone} variant="light" radius="sm" tt="none">{status}</Badge>;
}

function FileCheckIcon({ tone }) {
  if (tone === 'success') return <CheckCircle size={18} color="#267a59" weight="fill" aria-hidden="true" />;
  if (tone === 'warning' || tone === 'danger') return <WarningCircle size={18} color="#a84a1f" weight="fill" aria-hidden="true" />;
  return <FilePdf size={18} color="#6b5d62" aria-hidden="true" />;
}

function DocumentCheckDetails({ row }) {
  const check = row.documentCheck;
  const mimeType = check?.metadata?.mimeType || 'Not reported';
  const canDownload = check?.metadata?.canDownload;
  const readable = check?.document?.readable;
  const pageCount = check?.document?.pageCount;

  return (
    <Stack gap="lg">
      <Text fw={750}>{row.deliverable.title}</Text>
      <div className="wt-document-check-grid">
        <CheckFact label="File access" value={canDownload === false ? 'Unavailable' : 'Accessible'} />
        <CheckFact label="File type" value={mimeType === 'application/pdf' ? 'PDF' : mimeType} />
        <CheckFact label="Readable text" value={readable === false ? 'Not detected' : readable === true ? 'Detected' : 'Not reported'} />
        <CheckFact label="Pages" value={pageCount || 'Not reported'} />
      </div>
      <div>
        <Text fw={700}>Summary</Text>
        <Text size="sm">{row.fileCheck.summary}</Text>
      </div>
      <Text size="xs" c="dimmed">Document Check reports file access and document structure. It does not grade the submission.</Text>
    </Stack>
  );
}

function CheckFact({ label, value }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={700}>{value}</Text>
    </div>
  );
}

function truncateText(value, limit) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}
