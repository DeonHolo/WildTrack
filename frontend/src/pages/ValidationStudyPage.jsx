import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { DownloadSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import {
  defaultValidationStudyDeliverableId,
  loadValidationStudyDeliverables,
  loadValidationStudyEvidence
} from '../lib/ValidationStudyClient.js';
import { downloadValidationStudyCsv } from '../lib/ValidationStudyCsv.js';

export function ValidationStudyPage() {
  const { activeWorkspaceId } = useWorkspaceSession();
  const [deliverables, setDeliverables] = useState([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setDeliverables([]);
    setSelectedDeliverableId('');
    setEvidence(null);
    setError('');
    setStatus('loading');
    if (!activeWorkspaceId) return () => { active = false; };
    loadValidationStudyDeliverables(activeWorkspaceId)
      .then(items => {
        if (!active) return;
        const next = items || [];
        setDeliverables(next);
        setSelectedDeliverableId(defaultValidationStudyDeliverableId(next));
        if (!next.length) setStatus('ready');
      })
      .catch(failure => {
        if (!active) return;
        setError(failure?.message || 'Deliverables could not be loaded.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    let active = true;
    if (!activeWorkspaceId || !selectedDeliverableId) return () => { active = false; };
    setStatus('loading');
    setError('');
    loadValidationStudyEvidence(activeWorkspaceId, selectedDeliverableId)
      .then(next => {
        if (!active) return;
        setEvidence(next);
        setStatus('ready');
      })
      .catch(failure => {
        if (!active) return;
        setEvidence(null);
        setError(failure?.message || 'Validation Study evidence could not be loaded.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [activeWorkspaceId, selectedDeliverableId]);

  const deliverableOptions = useMemo(() => deliverables.map(deliverable => ({
    value: deliverable.id,
    label: deliverableLabel(deliverable)
  })), [deliverables]);

  const counts = evidence?.counts || {
    uniqueCurrentResponses: 0,
    uniqueCurrentStudents: 0,
    t1Observed: 0,
    t2Complete: 0,
    passingBoth: 0
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" fw={800} tt="uppercase" c="wildtrackMaroon.7">Objective 3 evidence</Text>
          <Title order={1}>Validation Study</Title>
          <Text c="dimmed" maw={760}>
            Admin-only server evidence for the controlled Initial submission → Revised submission workflow. This isolated page reads current responses and their material revision history; it does not alter submissions.
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={<DownloadSimple size={18} aria-hidden="true" />}
          disabled={!evidence}
          onClick={() => evidence && downloadValidationStudyCsv(evidence)}
        >
          Export CSV
        </Button>
      </Group>

      <Paper withBorder p="md">
        <Select
          label="Study deliverable"
          description="Refactored SRS is preselected when it exists; another deliverable can be inspected without hardcoded IDs."
          data={deliverableOptions}
          value={selectedDeliverableId || null}
          onChange={value => setSelectedDeliverableId(value || '')}
          allowDeselect={false}
          searchable={deliverableOptions.length > 5}
          placeholder={deliverableOptions.length ? 'Choose a deliverable' : 'No deliverables in this workspace'}
          disabled={!deliverableOptions.length}
        />
      </Paper>

      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {status === 'loading' ? <Text c="dimmed">Loading Validation Study evidence…</Text> : null}

      {evidence ? <>
        <SimpleGrid cols={{ base: 2, sm: 5 }}>
          <CountCard label="Current responses" value={counts.uniqueCurrentResponses} />
          <CountCard label="Unique students" value={counts.uniqueCurrentStudents} />
          <CountCard label="T1 observed" value={counts.t1Observed} />
          <CountCard label="T2 complete" value={counts.t2Complete} />
          <CountCard label="Passing both" value={counts.passingBoth} />
        </SimpleGrid>

        <Paper withBorder p="md">
          <Stack gap="xs">
            <Text fw={750}>Detected study fields</Text>
            <Text size="sm">Validation Step: <strong>{evidence.validationStepFieldLabel || 'Not detected'}</strong></Text>
            <Text size="sm">PDF/link field: <strong>{evidence.artifactFieldLabel || 'Not detected'}</strong></Text>
            {(evidence.warnings || []).map(message => <Alert key={message} color="yellow">{message}</Alert>)}
            {(evidence.limitations || []).map(message => <Alert key={message} color="blue">{message}</Alert>)}
          </Stack>
        </Paper>

        <Paper withBorder>
          <Table.ScrollContainer minWidth={1500}>
            <Table striped highlightOnHover verticalSpacing="sm" aria-label="Validation Study evidence table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Student</Table.Th>
                  <Table.Th>Response</Table.Th>
                  <Table.Th>Revision</Table.Th>
                  <Table.Th>Submitted / updated</Table.Th>
                  <Table.Th>Current Validation Step</Table.Th>
                  <Table.Th>Current PDF/link</Table.Th>
                  <Table.Th>Study checks</Table.Th>
                  <Table.Th>History</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(evidence.responses || []).map(row => <EvidenceRow key={row.responseId} row={row} />)}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!evidence.responses?.length ? <Text p="md" c="dimmed">No current responses exist for this deliverable.</Text> : null}
        </Paper>
      </> : null}
    </Stack>
  );
}

function CountCard({ label, value }) {
  return <Paper withBorder p="md"><Text size="xs" c="dimmed" fw={700}>{label}</Text><Text size="xl" fw={850}>{value}</Text></Paper>;
}

function EvidenceRow({ row }) {
  const checks = row.checks || {};
  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={700}>{row.studentName || 'Unnamed student'}</Text>
        <Text size="xs" c="dimmed">{row.studentNumber} · {row.teamCode || 'No team'}</Text>
      </Table.Td>
      <Table.Td><Text size="xs" ff="monospace">{row.responseId}</Text></Table.Td>
      <Table.Td>{row.currentRevision}</Table.Td>
      <Table.Td>
        <Text size="xs">{formatDateTime(row.submittedAt)}</Text>
        <Text size="xs" c="dimmed">Updated {formatDateTime(row.updatedAt)}</Text>
      </Table.Td>
      <Table.Td>{row.validationStepValue || '—'}</Table.Td>
      <Table.Td><ArtifactValue value={row.artifactValue} /></Table.Td>
      <Table.Td>
        <Stack gap={4}>
          <Check label="Initial seen" value={checks.initialSubmissionSeen} />
          <Check label="Revised current" value={checks.revisedSubmissionCurrent} />
          <Check label="Same response" value={checks.sameResponse} />
          <Check label="Revision increased" value={checks.revisionIncreased} />
          <Check label="Material history" value={checks.materialEditHistoryPresent} />
          <Check label="PDF unchanged" value={checks.pdfUnchanged} />
          <Check label="Other values preserved" value={checks.nonDesignatedValuesPreserved} />
          <Check label="Overall pass" value={checks.overallPass} strong />
        </Stack>
      </Table.Td>
      <Table.Td>
        <details>
          <summary>{row.history?.length || 0} historical revision{row.history?.length === 1 ? '' : 's'}</summary>
          <Stack gap="xs" mt="xs" miw={280}>
            {(row.history || []).map(item => (
              <Paper key={`${row.responseId}-${item.revision}`} withBorder p="xs">
                <Text size="xs" fw={700}>Revision {item.revision} · {formatDateTime(item.createdAt)}</Text>
                <Text size="xs">{item.validationStepValue || 'No Validation Step value'}</Text>
                <ArtifactValue value={item.artifactValue} compact />
              </Paper>
            ))}
          </Stack>
        </details>
      </Table.Td>
    </Table.Tr>
  );
}

function Check({ label, value, strong = false }) {
  const tone = value === null || value === undefined ? 'gray' : value ? 'green' : 'red';
  const text = value === null || value === undefined ? 'N/A' : value ? 'Pass' : 'Fail';
  return <Group gap={6} wrap="nowrap"><Badge color={tone} variant={strong ? 'filled' : 'light'}>{text}</Badge><Text size="xs" fw={strong ? 800 : 500}>{label}</Text></Group>;
}

function ArtifactValue({ value, compact = false }) {
  if (!value) return <Text size="xs" c="dimmed">—</Text>;
  if (/^https?:\/\//i.test(value)) return <Text component="a" href={value} target="_blank" rel="noreferrer" size="xs" lineClamp={compact ? 1 : 2}>{value}</Text>;
  return <Text size="xs" lineClamp={compact ? 1 : 2}>{value}</Text>;
}

function deliverableLabel(deliverable) {
  const key = deliverable.trackerColumnKey || '';
  const title = deliverable.title || key || 'Untitled deliverable';
  return key && key !== title ? `${key} — ${title}` : title;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
