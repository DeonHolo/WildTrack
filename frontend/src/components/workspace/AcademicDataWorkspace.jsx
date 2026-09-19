import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  Modal,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { ArrowClockwise, CaretDown, CaretUp, Plus, UploadSimple } from '@phosphor-icons/react';
import { loadAcademicData, saveAcademicRows } from '../../lib/academicDataClient.js';

const GRID_CONFIG = {
  students: {
    label: 'Students',
    identityKey: 'studentNumber',
    columns: [
      column('studentNumber', 'Student Number', true),
      column('studentName', 'Student name', true),
      column('teamCode', 'Team code', true),
      column('memberNumber', 'Member #'),
      column('sectionName', 'Section'),
      column('adviserName', 'Adviser'),
      column('institutionalEmail', 'Institutional email')
    ]
  },
  projects: {
    label: 'Teams / Projects',
    identityKey: 'groupCode',
    columns: [
      column('groupCode', 'Team code', true),
      column('projectTitle', 'Project title'),
      column('softwareName', 'Software name'),
      column('adviserName', 'Adviser'),
      column('projectStatus', 'Status'),
      column('category', 'Category'),
      column('description', 'Description'),
      column('proposalRemarks', 'Proposal remarks'),
      column('demoComments', 'Demo comments')
    ]
  },
  deliverables: {
    label: 'Deliverables',
    identityKey: 'trackerColumnKey',
    columns: [
      column('trackerColumnKey', 'Tracker column', true),
      column('title', 'Title', true),
      column('dueAt', 'Due date', true, 'datetime-local'),
      column('status', 'Status', true, 'status')
    ]
  }
};

const HEADER_ALIASES = {
  studentnumber: 'studentNumber', studentno: 'studentNumber', studentid: 'studentNumber',
  studentname: 'studentName', nameofstudent: 'studentName', name: 'studentName',
  teamcode: 'teamCode', newteamcode: 'teamCode', groupcode: 'groupCode',
  member: 'memberNumber', membernumber: 'memberNumber', memberno: 'memberNumber',
  section: 'sectionName', adviser: 'adviserName', advisername: 'adviserName',
  institutionalemail: 'institutionalEmail', citemail: 'institutionalEmail', email: 'institutionalEmail',
  projecttitle: 'projectTitle', softwaretitle: 'softwareName', softwarename: 'softwareName',
  projectstatus: 'projectStatus', status: 'projectStatus', category: 'category',
  description: 'description', proposalremarks: 'proposalRemarks', democomments: 'demoComments',
  trackercolumn: 'trackerColumnKey', trackercolumnkey: 'trackerColumnKey', deliverable: 'trackerColumnKey',
  title: 'title', duedate: 'dueAt', dueat: 'dueAt'
};

export function AcademicDataWorkspace({ workspaceId, onSaved }) {
  const [opened, setOpened] = useState(false);
  const [activeGrid, setActiveGrid] = useState('students');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState(emptyData);
  const [dirty, setDirty] = useState(emptyDirty);
  const [pasteOpened, setPasteOpened] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    setOpened(false);
    setStatus('idle');
    setData(emptyData());
    setDirty(emptyDirty());
    setError('');
    setNotice('');
  }, [workspaceId]);

  async function load() {
    if (!workspaceId) return;
    setStatus('loading');
    setError('');
    try {
      const snapshot = await loadAcademicData(workspaceId);
      setData(normalizeSnapshot(snapshot));
      setDirty(emptyDirty());
      setStatus('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Academic data could not be loaded.');
      setStatus('error');
    }
  }

  async function toggleOpen() {
    const next = !opened;
    setOpened(next);
    if (next && status === 'idle') await load();
  }

  const config = GRID_CONFIG[activeGrid];
  const rows = data[activeGrid] || [];
  const errors = useMemo(() => validateRows(activeGrid, rows, data.trackerColumns), [activeGrid, rows, data.trackerColumns]);
  const dirtyKeys = dirty[activeGrid];
  const dirtyRows = rows.filter((row) => dirtyKeys.has(rowKey(row)));
  const dirtyHasErrors = dirtyRows.some((row) => Object.keys(errors.get(rowKey(row)) || {}).length > 0);
  const pastePreview = useMemo(
    () => parsePaste(activeGrid, pasteText, rows, data.trackerColumns),
    [activeGrid, pasteText, rows, data.trackerColumns]
  );

  function updateCell(key, field, value) {
    setData((current) => ({
      ...current,
      [activeGrid]: current[activeGrid].map((row) => rowKey(row) === key ? { ...row, [field]: value } : row)
    }));
    markDirty(activeGrid, key);
    setNotice('');
  }

  function markDirty(kind, key) {
    setDirty((current) => {
      const next = new Set(current[kind]);
      next.add(key);
      return { ...current, [kind]: next };
    });
  }

  function addRow() {
    const row = newRow(activeGrid, data);
    if (!row) {
      setNotice('Every tracker column already has a deliverable form.');
      return;
    }
    setData((current) => ({ ...current, [activeGrid]: [...current[activeGrid], row] }));
    markDirty(activeGrid, rowKey(row));
  }

  async function save() {
    if (!dirtyRows.length) return;
    if (dirtyHasErrors) {
      setError('Fix the highlighted cells before saving. Nothing was written.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await saveAcademicRows(workspaceId, activeGrid, dirtyRows.map((row) => toPayload(activeGrid, row)));
      await load();
      await onSaved?.();
      setNotice(`${dirtyRows.length} ${dirtyRows.length === 1 ? 'row' : 'rows'} saved to WildTrack.`);
    } catch (saveError) {
      setStatus('ready');
      setError(saveError?.status === 409
        ? 'Academic data changed after you opened it. Reload before saving your edits.'
        : saveError?.message || 'Academic data could not be saved. No rows were applied.');
    }
  }

  function applyPaste() {
    if (!pastePreview.rows.length || pastePreview.errors.length) return;
    setData((current) => ({ ...current, [activeGrid]: pastePreview.nextRows }));
    setDirty((current) => ({ ...current, [activeGrid]: new Set([...current[activeGrid], ...pastePreview.dirtyKeys]) }));
    setPasteOpened(false);
    setPasteText('');
    setNotice(`${pastePreview.rows.length} pasted ${pastePreview.rows.length === 1 ? 'row is' : 'rows are'} ready to save. Paste is not written until Save changes.`);
  }

  return (
    <section className="panel wt-academic-data" aria-label="Academic data workspace">
      <div className="panel-header">
        <div>
          <h2>Academic data</h2>
          <p>Edit imported records or add rows directly. Saves stay inside WildTrack and never write back to Google Sheets.</p>
        </div>
        <Button variant="default" rightSection={opened ? <CaretUp size={16} /> : <CaretDown size={16} />} onClick={toggleOpen}>
          {opened ? 'Hide grids' : 'Open grids'}
        </Button>
      </div>

      <Collapse in={opened}>
        <Stack gap="md" pt="sm">
          {error ? <Alert color="red" role="alert">{error}</Alert> : null}
          {notice ? <Alert color="green" role="status">{notice}</Alert> : null}
          {status === 'loading' ? <Text size="sm" c="dimmed">Loading academic records…</Text> : null}
          {status !== 'loading' ? (
            <Tabs value={activeGrid} onChange={(value) => value && setActiveGrid(value)}>
              <Tabs.List>
                <Tabs.Tab value="students">Students ({data.students.length})</Tabs.Tab>
                <Tabs.Tab value="projects">Teams / Projects ({data.projects.length})</Tabs.Tab>
                <Tabs.Tab value="deliverables">Deliverables ({data.deliverables.length})</Tabs.Tab>
              </Tabs.List>

              <Stack gap="sm" mt="md">
                <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                  <div>
                    <Text fw={750}>{config.label}</Text>
                    <Text size="xs" c="dimmed">Columns marked * are required. Existing imported source references stay attached when you edit values.</Text>
                  </div>
                  <Group gap="xs">
                    <Button variant="default" leftSection={<ArrowClockwise size={16} />} onClick={load} disabled={status === 'saving'}>Reload</Button>
                    <Button variant="default" leftSection={<UploadSimple size={16} />} onClick={() => { setPasteText(''); setPasteOpened(true); }}>Paste rows</Button>
                    {activeGrid === 'deliverables' ? null : (
                      <Button variant="default" leftSection={<Plus size={16} />} onClick={addRow}>Add row</Button>
                    )}
                    <Button color="wildtrackMaroon" onClick={save} loading={status === 'saving'} disabled={!dirtyRows.length || dirtyHasErrors}>
                      Save changes{dirtyRows.length ? ` (${dirtyRows.length})` : ''}
                    </Button>
                  </Group>
                </Group>

                <AcademicGrid
                  kind={activeGrid}
                  rows={rows}
                  columns={config.columns}
                  errors={errors}
                  trackerColumns={data.trackerColumns}
                  dirtyKeys={dirtyKeys}
                  onChange={updateCell}
                />
              </Stack>
            </Tabs>
          ) : null}
        </Stack>
      </Collapse>

      <Modal opened={pasteOpened} onClose={() => setPasteOpened(false)} title={`Paste ${config.label.toLowerCase()} rows`} size="xl" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Paste tab-separated spreadsheet rows. You can include a header row in any column order. Preview is local until you apply it to the grid, and Save changes commits the edited rows as one backend transaction.
          </Text>
          <Text size="xs" ff="monospace">{config.columns.map((item) => item.label).join(' · ')}</Text>
          <Textarea
            aria-label="Pasted spreadsheet rows"
            minRows={7}
            autosize
            value={pasteText}
            onChange={(event) => setPasteText(event.currentTarget.value)}
            placeholder={config.columns.map((item) => item.label).join('\t')}
          />
          {pastePreview.errors.length ? (
            <Alert color="red" title="Paste needs attention">
              {pastePreview.errors.map((message) => <Text key={message} size="sm">{message}</Text>)}
            </Alert>
          ) : null}
          {pastePreview.rows.length ? (
            <div className="wt-paste-preview" aria-label="Paste preview">
              {pastePreview.rows.map((row, index) => (
                <div key={`${row.identity}-${index}`}>
                  <Badge variant="light" color={row.action === 'Update' ? 'blue' : 'green'}>{row.action}</Badge>
                  <Text size="sm" fw={650}>{row.identity || `Row ${index + 1}`}</Text>
                  <Text size="xs" c="dimmed">{row.summary}</Text>
                </div>
              ))}
            </div>
          ) : <Text size="sm" c="dimmed">Paste rows above to preview additions and updates.</Text>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPasteOpened(false)}>Cancel</Button>
            <Button color="wildtrackMaroon" onClick={applyPaste} disabled={!pastePreview.rows.length || Boolean(pastePreview.errors.length)}>Apply to grid</Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}

function AcademicGrid({ kind, rows, columns, errors, trackerColumns, dirtyKeys, onChange }) {
  return (
    <div className="wt-academic-grid-scroll">
      <table className="wt-academic-grid" aria-label={`${GRID_CONFIG[kind].label} academic data`}>
        <thead>
          <tr>
            <th>Source</th>
            {columns.map((item) => <th key={item.key}>{item.label}{item.required ? ' *' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const rowErrors = errors.get(key) || {};
            return (
              <tr key={key} className={dirtyKeys.has(key) ? 'is-dirty' : undefined}>
                <td className="wt-academic-source-cell">{sourceLabel(kind, row)}</td>
                {columns.map((item) => (
                  <td key={item.key}>
                    <GridCell
                      kind={kind}
                      row={row}
                      column={item}
                      error={rowErrors[item.key]}
                      trackerColumns={trackerColumns}
                      onChange={(value) => onChange(key, item.key, value)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
          {!rows.length ? <tr><td colSpan={columns.length + 1}><Text size="sm" c="dimmed">No rows yet. Add a row or paste spreadsheet data.</Text></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function GridCell({ kind, row, column: item, error, trackerColumns, onChange }) {
  const value = String(row[item.key] ?? '');
  if (kind === 'deliverables' && item.key === 'trackerColumnKey') {
    if (row.id || row._importedColumn) return <Text size="sm" ff="monospace">{value}</Text>;
    return (
      <Select
        aria-label="Tracker column"
        value={value || null}
        data={trackerColumns.map((column) => ({ value: column.columnKey, label: column.label || column.columnKey }))}
        onChange={(next) => onChange(next || '')}
        error={error}
      />
    );
  }
  if (item.type === 'status') {
    return <Select aria-label={`${item.label} for ${rowIdentity(kind, row)}`} value={value || 'UNPUBLISHED'} data={['UNPUBLISHED', 'PUBLISHED']} onChange={(next) => onChange(next || 'UNPUBLISHED')} error={error} />;
  }
  return (
    <TextInput
      aria-label={`${item.label} for ${rowIdentity(kind, row)}`}
      type={item.type === 'datetime-local' ? 'datetime-local' : 'text'}
      value={item.type === 'datetime-local' ? value.slice(0, 16) : value}
      onChange={(event) => onChange(event.currentTarget.value)}
      error={error}
    />
  );
}

function parsePaste(kind, text, currentRows, trackerColumns) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { rows: [], errors: [], nextRows: currentRows, dirtyKeys: [] };
  const config = GRID_CONFIG[kind];
  const rawRows = trimmed.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split('\t'));
  if (!rawRows.length) return { rows: [], errors: [], nextRows: currentRows, dirtyKeys: [] };

  const allowed = new Set(config.columns.map((item) => item.key));
  const firstMapped = rawRows[0].map((value) => headerKey(value, allowed));
  const hasHeader = firstMapped.some(Boolean) && firstMapped.every(Boolean);
  const keys = hasHeader ? firstMapped : config.columns.map((item) => item.key);
  const body = hasHeader ? rawRows.slice(1) : rawRows;
  const errors = [];
  const seen = new Set();
  const nextRows = currentRows.map((row) => ({ ...row }));
  const dirtyKeys = [];
  const previewRows = [];

  body.forEach((cells, rowIndex) => {
    const partial = {};
    keys.forEach((key, index) => { partial[key] = String(cells[index] ?? '').trim(); });
    const identity = String(partial[config.identityKey] || '').trim();
    if (!identity) {
      errors.push(`Paste row ${rowIndex + 1}: ${config.columns.find((item) => item.key === config.identityKey)?.label || 'Identity'} is required.`);
      return;
    }
    const normalizedIdentity = normalize(identity);
    if (seen.has(normalizedIdentity)) {
      errors.push(`Paste row ${rowIndex + 1}: duplicate ${identity}.`);
      return;
    }
    seen.add(normalizedIdentity);
    const existingIndex = nextRows.findIndex((row) => normalize(row[config.identityKey]) === normalizedIdentity);
    let row;
    let action;
    if (existingIndex >= 0) {
      row = { ...nextRows[existingIndex], ...partial };
      nextRows[existingIndex] = row;
      action = 'Update';
    } else {
      row = { ...blankRow(kind), ...partial, _localKey: localKey(kind) };
      nextRows.push(row);
      action = 'Add';
    }
    dirtyKeys.push(rowKey(row));
    previewRows.push({ identity, action, summary: keys.filter((key) => key !== config.identityKey).slice(0, 3).map((key) => `${labelFor(kind, key)}: ${partial[key] || '—'}`).join(' · ') });
  });

  const validation = validateRows(kind, nextRows, trackerColumns);
  for (const key of dirtyKeys) {
    for (const message of Object.values(validation.get(key) || {})) {
      if (message && !errors.includes(message)) errors.push(message);
    }
  }
  return { rows: previewRows, errors, nextRows, dirtyKeys };
}

function validateRows(kind, rows, trackerColumns = []) {
  const config = GRID_CONFIG[kind];
  const result = new Map();
  const identityCounts = new Map();
  rows.forEach((row) => {
    const identity = normalize(row[config.identityKey]);
    if (identity) identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
  });
  const trackerKeys = new Set(trackerColumns.map((column) => normalize(column.columnKey)));

  rows.forEach((row) => {
    const key = rowKey(row);
    const rowErrors = {};
    for (const item of config.columns) {
      const value = String(row[item.key] ?? '').trim();
      if (item.required && !value) rowErrors[item.key] = `${item.label} is required.`;
    }
    const identity = normalize(row[config.identityKey]);
    if (identity && identityCounts.get(identity) > 1) rowErrors[config.identityKey] = `${labelFor(kind, config.identityKey)} must be unique.`;
    if (kind === 'deliverables') {
      if (identity && trackerKeys.size && !trackerKeys.has(identity)) rowErrors.trackerColumnKey = 'Choose a tracker column from this workspace.';
      const date = Date.parse(row.dueAt || '');
      if (row.dueAt && !Number.isFinite(date)) rowErrors.dueAt = 'Enter a valid due date.';
      if (row.status && !['UNPUBLISHED', 'PUBLISHED'].includes(String(row.status).toUpperCase())) rowErrors.status = 'Choose Published or Unpublished.';
    }
    result.set(key, rowErrors);
  });
  return result;
}

function normalizeSnapshot(snapshot = {}) {
  const students = (snapshot.students || []).map((row) => ({ ...row }));
  const trackerColumns = snapshot.trackerColumns || [];
  const projects = (snapshot.projects || []).map((row) => ({ ...row }));
  const projectTeams = new Set(projects.map((row) => normalize(row.groupCode)));
  for (const teamCode of [...new Set(students.map((row) => String(row.teamCode || '').trim()).filter(Boolean))]) {
    if (!projectTeams.has(normalize(teamCode))) {
      projects.push({ ...blankRow('projects'), groupCode: teamCode, _localKey: localKey('roster-team'), _rosterTeam: true });
    }
  }

  const deliverables = (snapshot.deliverables || []).map((row) => {
    const column = trackerColumns.find((item) => normalize(item.columnKey) === normalize(row.trackerColumnKey));
    return {
      ...row,
      status: String(row.status || 'UNPUBLISHED').toUpperCase(),
      dueAt: String(row.dueAt || '').slice(0, 16),
      _sourceColumn: column?.sourceColumn || column?.label || row.trackerColumnKey,
      _columnActive: column?.active !== false
    };
  });
  const deliverableKeys = new Set(deliverables.map((row) => normalize(row.trackerColumnKey)));
  for (const column of trackerColumns) {
    if (deliverableKeys.has(normalize(column.columnKey))) continue;
    deliverables.push({
      ...blankRow('deliverables'),
      trackerColumnKey: column.columnKey,
      title: `${column.label || column.columnKey} Submission`,
      _localKey: localKey('tracker-deliverable'),
      _importedColumn: true,
      _sourceColumn: column.sourceColumn || column.label || column.columnKey,
      _columnActive: column.active !== false
    });
  }
  return {
    students,
    projects,
    deliverables,
    trackerColumns
  };
}

function toPayload(kind, row) {
  const config = GRID_CONFIG[kind];
  const payload = { id: row.id || null, expectedUpdatedAt: row.id ? row.updatedAt || null : null };
  config.columns.forEach((item) => { payload[item.key] = row[item.key] ?? ''; });
  if (kind === 'deliverables') {
    payload.status = String(payload.status || 'UNPUBLISHED').toUpperCase();
    payload.dueAt = String(payload.dueAt || '').length === 16 ? `${payload.dueAt}:00` : payload.dueAt;
  }
  return payload;
}

function newRow(kind, data) {
  if (kind !== 'deliverables') return { ...blankRow(kind), _localKey: localKey(kind) };
  const used = new Set(data.deliverables.map((row) => normalize(row.trackerColumnKey)));
  const available = data.trackerColumns.find((column) => !used.has(normalize(column.columnKey)));
  if (!available) return null;
  return {
    ...blankRow(kind),
    _localKey: localKey(kind),
    trackerColumnKey: available.columnKey,
    title: `${available.label || available.columnKey} Submission`
  };
}

function blankRow(kind) {
  if (kind === 'students') return { studentNumber: '', studentName: '', teamCode: '', memberNumber: '', sectionName: '', adviserName: '', institutionalEmail: '' };
  if (kind === 'projects') return { groupCode: '', projectTitle: '', softwareName: '', adviserName: '', projectStatus: '', category: '', description: '', proposalRemarks: '', demoComments: '' };
  return { trackerColumnKey: '', title: '', dueAt: '', status: 'UNPUBLISHED' };
}

function sourceLabel(kind, row) {
  if (!row.id && row._rosterTeam) return <Badge variant="light">Roster team</Badge>;
  if (!row.id && row._importedColumn) return (
    <Stack gap={2}>
      <Badge variant="light">{row._columnActive ? 'Tracker column' : 'Inactive tracker column'}</Badge>
      <Text size="xs">Source: {row._sourceColumn}</Text>
    </Stack>
  );
  if (!row.id) return <Badge variant="light" color="green">Manual new</Badge>;
  if (kind === 'students') return (
    <Stack gap={2}>
      <Badge variant="light">{row.sourceRowNumber ? `Imported row ${row.sourceRowNumber}` : 'WildTrack'}</Badge>
      {row.teamFormationCode && normalize(row.teamFormationCode) !== normalize(row.teamCode) ? <Text size="xs">Source team: {row.teamFormationCode}</Text> : null}
    </Stack>
  );
  if (kind === 'projects') return (
    <Stack gap={2}>
      <Badge variant="light">{row.sourceRowNumber ? `Imported row ${row.sourceRowNumber}` : 'WildTrack'}</Badge>
      {row.sourceGroupCode && normalize(row.sourceGroupCode) !== normalize(row.groupCode) ? <Text size="xs">Source team: {row.sourceGroupCode}</Text> : null}
    </Stack>
  );
  return (
    <Stack gap={2}>
      <Badge variant="light">WildTrack form</Badge>
      {row._sourceColumn ? <Text size="xs">Source: {row._sourceColumn}</Text> : null}
    </Stack>
  );
}

function rowIdentity(kind, row) {
  return String(row[GRID_CONFIG[kind].identityKey] || 'new row');
}

function labelFor(kind, key) {
  return GRID_CONFIG[kind].columns.find((item) => item.key === key)?.label || key;
}

function headerKey(value, allowed) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const direct = Object.values(GRID_CONFIG).flatMap((grid) => grid.columns)
    .find((item) => allowed.has(item.key) && [item.key, item.label].some((candidate) => String(candidate).toLowerCase().replace(/[^a-z0-9]/g, '') === normalized))?.key;
  const alias = direct || HEADER_ALIASES[normalized];
  return alias && allowed.has(alias) ? alias : '';
}

function rowKey(row) {
  return String(row.id || row._localKey);
}

function localKey(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function column(key, label, required = false, type = 'text') {
  return { key, label, required, type };
}

function emptyData() {
  return { students: [], projects: [], deliverables: [], trackerColumns: [] };
}

function emptyDirty() {
  return { students: new Set(), projects: new Set(), deliverables: new Set() };
}
