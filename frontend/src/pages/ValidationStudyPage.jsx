import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { DownloadSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import {
  defaultValidationStudyDeliverableId,
  loadValidationStudyDeliverables,
  loadValidationStudyEvidence
} from '../lib/ValidationStudyClient.js';
import { downloadInitialSavedRecordCsv } from '../lib/ValidationStudyCsv.js';

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
    setEvidence(null);
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
  const audit = evidence?.initialSavedRecords;
  const canExport = status === 'ready'
    && Boolean(audit)
    && audit.workspaceId === activeWorkspaceId
    && audit.deliverableId === selectedDeliverableId;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" fw={800} tt="uppercase" c="wildtrackMaroon.7">Research evidence · system audit</Text>
          <Title order={1}>Validation Study · initial saved records</Title>
          <Text c="dimmed" maw={760}>
            Admin-only read-only evidence for the current initial-saved-record system audit. This audit does not automatically establish consent or an end-to-end study result.
          </Text>
        </div>
        <Button
          leftSection={<DownloadSimple size={18} aria-hidden="true" />}
          disabled={!canExport}
          onClick={() => canExport && downloadInitialSavedRecordCsv(evidence)}
        >
          Export initial-record CSV (Excel)
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
        {evidence.initialSavedRecords ? <InitialSavedRecordAudit evidence={evidence} /> : (
          <Alert color="yellow" title="Initial-record audit unavailable">
            This server returned legacy Validation Study evidence without the {INITIAL_SCOPE} audit. The new initial-record export is unavailable; no result is derived from the historical checks.
          </Alert>
        )}

      </> : null}
    </Stack>
  );
}

const INITIAL_SCOPE = 'INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1';

function InitialSavedRecordAudit({ evidence }) {
  const audit = evidence.initialSavedRecords;
  const records = Array.isArray(audit.records) ? audit.records : [];
  const count = value => value === null || value === undefined ? 'Unknown' : value;
  const hasPositiveDenominator = Number.isFinite(audit.selectedRecords) && audit.selectedRecords > 0;
  const status = audit.outcome === 'PASS' && !hasPositiveDenominator ? 'INCONCLUSIVE' : (audit.outcome || 'INCONCLUSIVE');
  return <Stack gap="md">
    <Alert color={status === 'PASS' ? 'green' : 'yellow'} title={`System audit outcome: ${status}`}>
      Scope: <strong>{audit.scope || INITIAL_SCOPE}</strong>. This is a saved-record system audit; it does not automatically establish consent, pre-save failure capture, student-visible readback, or end-to-end study completion.
    </Alert>
    <SimpleGrid cols={{ base: 2, sm: 5 }}>
      <CountCard label="Candidates" value={count(audit.candidates)} />
      <CountCard label="Selected records" value={count(audit.selectedRecords)} />
      <CountCard label="Passed checks" value={count(audit.passedRecords)} />
      <CountCard label="Failed checks" value={count(audit.failedRecords)} />
      <CountCard label="Unverified checks" value={count(audit.unverifiedRecords)} />
    </SimpleGrid>
    <Paper withBorder p="md"><Stack gap="xs"><Text size="sm">Evaluated: <strong>{formatDateTime(audit.evaluatedAt)}</strong></Text><Text size="sm">Workspace: <strong>{audit.workspaceId || 'Unknown'}</strong></Text><Text size="sm">Deliverable: <strong>{audit.deliverableId || evidence.deliverableId || 'Unknown'}</strong></Text><Text size="sm">Selection rule: <strong>{audit.selectionRule || 'Unknown'}</strong></Text>{(audit.limitations || []).map(item => <Text size="sm" c="dimmed" key={item}>Limit: {item}</Text>)}</Stack></Paper>
    <Paper withBorder><Table.ScrollContainer minWidth={1700}><Table striped highlightOnHover verticalSpacing="sm" aria-label="Initial saved record audit table"><Table.Thead><Table.Tr><Table.Th>Student / roster</Table.Th><Table.Th>Original record</Table.Th><Table.Th>Five audit checks</Table.Th><Table.Th>Binding / required fields</Table.Th><Table.Th>Overall</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{records.map((record, index) => <InitialRecordRow key={record.responseId || record.studentRecordId || index} record={record} />)}</Table.Tbody></Table></Table.ScrollContainer>{!records.length ? <Text p="md" c="dimmed">No selected records were returned for this audit.</Text> : null}</Paper>
  </Stack>;
}

function InitialRecordRow({ record }) {
  return <Table.Tr><Table.Td><Text fw={700}>{record.studentName || 'Unnamed student'}</Text><Text size="xs">{record.studentNumber || '—'} · {record.teamCode || 'No team'}</Text><Text size="xs" c="dimmed">Roster: {record.rosterStudentName || '—'} · {record.rosterStudentNumber || '—'} · {record.rosterTeamCode || '—'}</Text></Table.Td><Table.Td><Text size="xs">Source: {record.originalSource || 'UNVERIFIED'}</Text><Text size="xs">Revision: {record.originalRevision ?? '—'} · Saved: {formatDateTime(record.originalSavedAt)}</Text><ArtifactValue value={record.originalArtifactValue} /></Table.Td><Table.Td><Stack gap={4}>{['studentDetails', 'workspace', 'deliverable', 'originalVersion', 'storedValues'].map(key => <AuditCheck key={key} label={labelize(key)} value={recordCheck(record, key)} />)}</Stack></Table.Td><Table.Td><AuditCheck label="Account binding" value={recordCheck(record, 'accountBinding')} /><Text size="xs">Required fields checked: {record.requiredFieldsChecked?.length ? record.requiredFieldsChecked.join(', ') : 'None reported'}</Text><Text size="xs">Missing: {record.missingRequiredFieldKeys?.length ? record.missingRequiredFieldKeys.join(', ') : 'None reported'}</Text></Table.Td><Table.Td><AuditCheck label="Overall status" value={record.overallStatus} strong /></Table.Td></Table.Tr>;
}

function recordCheck(record, key) { return record[key] ?? record.checks?.[key]; }

function AuditCheck({ label, value, strong = false }) {
  const check = value && typeof value === 'object' ? value : { status: typeof value === 'boolean' ? (value ? 'PASS' : 'FAIL') : value };
  const state = ['PASS', 'FAIL', 'UNVERIFIED'].includes(check.status) ? check.status : 'UNVERIFIED';
  const color = state === 'PASS' ? 'green' : state === 'FAIL' ? 'red' : 'gray';
  return <Group gap={6} wrap="nowrap" align="flex-start"><Badge color={color} variant={strong ? 'filled' : 'light'}>{state}</Badge><Text size="xs" fw={strong ? 800 : 500}>{label}{check.reason ? `: ${check.reason}` : ''}</Text></Group>;
}

function labelize(value) { return value.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase()); }

function CountCard({ label, value }) {
  return <Paper withBorder p="md"><Text size="xs" c="dimmed" fw={700}>{label}</Text><Text size="xl" fw={850}>{value}</Text></Paper>;
}

function ArtifactValue({ value }) {
  if (!value) return <Text size="xs" c="dimmed">—</Text>;
  if (/^https?:\/\//i.test(value)) return <Text component="a" href={value} target="_blank" rel="noreferrer" size="xs" lineClamp={2}>{value}</Text>;
  return <Text size="xs" lineClamp={2}>{value}</Text>;
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
