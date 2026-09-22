import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Pagination,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { ArrowClockwise, DownloadSimple, MagnifyingGlass, Plus, UploadSimple } from '@phosphor-icons/react';
import { addAcademicDeliverableColumn, clearAcademicDataSnapshot, getAcademicDataSnapshot, loadAcademicData, saveAcademicRows } from '../../lib/academicDataClient.js';
import { downloadAcademicCsv } from '../../lib/academicDataCsv.js';

const PAGE_SIZE_OPTIONS = ['25', '50', '100'];

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

export function AcademicDataWorkspace({ workspaceId, cacheScope, onSaved }) {
  const [activeGrid, setActiveGrid] = useState('students');
  const [status, setStatus] = useState(() => getAcademicDataSnapshot(workspaceId, cacheScope) ? 'ready' : 'idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState(() => normalizeSnapshot(getAcademicDataSnapshot(workspaceId, cacheScope) || emptyData()));
  const [dirty, setDirty] = useState(emptyDirty);
  const [pasteOpened, setPasteOpened] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [newDeliverableOpened, setNewDeliverableOpened] = useState(false);
  const [newDeliverableName, setNewDeliverableName] = useState('');
  const [newDeliverablePdf, setNewDeliverablePdf] = useState(true);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [focusRow, setFocusRow] = useState('');
  const gridRef = useRef(null);
  const dirtyRef = useRef(false);
  const workspaceRef = useRef(`${cacheScope || ''}\u0000${workspaceId || ''}`);
  const requestSequence = useRef(0);

  useEffect(() => {
    workspaceRef.current = `${cacheScope || ''}\u0000${workspaceId || ''}`;
    const cached = getAcademicDataSnapshot(workspaceId, cacheScope);
    setStatus(cached ? 'ready' : 'idle');
    setData(normalizeSnapshot(cached || emptyData()));
    setDirty(emptyDirty());
    dirtyRef.current = false;
    setError('');
    setNotice('');
    setPage(1);
    setSearch('');
    setSearchDraft('');
    setFocusRow('');
    if (workspaceId) void load({ quiet: Boolean(cached) });
    return () => { requestSequence.current += 1; };
  }, [workspaceId, cacheScope]);

  async function load({ quiet = false, discardEdits = false } = {}) {
    if (!workspaceId) return;
    const requestId = ++requestSequence.current;
    if (!quiet) setStatus(getAcademicDataSnapshot(workspaceId, cacheScope) ? 'refreshing' : 'loading');
    setError('');
    try {
      const snapshot = await loadAcademicData(workspaceId, cacheScope);
      if (requestId !== requestSequence.current || workspaceRef.current !== `${cacheScope || ''}\u0000${workspaceId || ''}`) return;
      if (dirtyRef.current && !discardEdits) {
        setStatus('ready');
        setNotice('Newer academic records are available. Save your edits or reload to view them.');
        return;
      }
      setData(normalizeSnapshot(snapshot));
      setDirty(emptyDirty());
      dirtyRef.current = false;
      setStatus('ready');
    } catch (loadError) {
      if (requestId !== requestSequence.current || workspaceRef.current !== `${cacheScope || ''}\u0000${workspaceId || ''}`) return;
      if (loadError?.status === 401 || loadError?.status === 403) {
        clearAcademicDataSnapshot(workspaceId, cacheScope);
        setData(emptyData());
        setDirty(emptyDirty());
        dirtyRef.current = false;
      }
      setError(loadError?.message || 'Academic data could not be loaded.');
      setStatus(getAcademicDataSnapshot(workspaceId, cacheScope) ? 'ready' : 'error');
    }
  }

  function reload() {
    if (dirtyRef.current && !window.confirm('Discard unsaved edits and reload academic data?')) return;
    dirtyRef.current = false;
    void load({ discardEdits: true });
  }

  const config = GRID_CONFIG[activeGrid];
  const rows = data[activeGrid] || [];
  const filteredRows = useMemo(() => {
    const query = normalize(search);
    return query ? rows.filter((row) => config.columns.some((item) => normalize(row[item.key]).includes(query))
      || normalize(row._sourceColumn || row.sourceGroupCode || row.teamFormationCode).includes(query)) : rows;
  }, [rows, config, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const firstVisible = filteredRows.length ? ((page - 1) * pageSize) + 1 : 0;
  const lastVisible = Math.min(page * pageSize, filteredRows.length);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const errors = useMemo(() => validateRows(activeGrid, rows, data.trackerColumns), [activeGrid, rows, data.trackerColumns]);
  const dirtyKeys = dirty[activeGrid];
  const dirtyRows = rows.filter((row) => dirtyKeys.has(rowKey(row)));
  const dirtyHasErrors = dirtyRows.some((row) => Object.keys(errors.get(rowKey(row)) || {}).length > 0);
  const pastePreview = useMemo(
    () => parsePaste(activeGrid, pasteText, rows, data.trackerColumns),
    [activeGrid, pasteText, rows, data.trackerColumns]
  );

  useEffect(() => setPage(1), [activeGrid, pageSize]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  useEffect(() => {
    if (!focusRow) return;
    const target = Array.from(gridRef.current?.querySelectorAll('tbody tr') || [])
      .find((row) => row.dataset.rowKey === focusRow);
    if (!target) return;
    target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    target.querySelector('input')?.focus();
    setFocusRow('');
  }, [focusRow, pageRows]);

  function updateCell(key, field, value) {
    if (status === 'saving') return;
    setData((current) => ({
      ...current,
      [activeGrid]: current[activeGrid].map((row) => rowKey(row) === key ? { ...row, [field]: value } : row)
    }));
    markDirty(activeGrid, key);
    setNotice('');
  }

  function markDirty(kind, key) {
    dirtyRef.current = true;
    setDirty((current) => {
      const next = new Set(current[kind]);
      next.add(key);
      return { ...current, [kind]: next };
    });
  }

  function addRow() {
    if (status === 'saving') return;
    if (activeGrid === 'deliverables') {
      setNewDeliverableName('');
      setNewDeliverablePdf(true);
      setNewDeliverableOpened(true);
      return;
    }
    const row = newRow(activeGrid, data);
    setData((current) => ({ ...current, [activeGrid]: [...current[activeGrid], row] }));
    markDirty(activeGrid, rowKey(row));
    jumpToRow(row, [...rows, row]);
  }

  function jumpToRow(row, nextRows) {
    setSearch('');
    setSearchDraft('');
    setPage(Math.ceil((nextRows.findIndex((item) => rowKey(item) === rowKey(row)) + 1) / pageSize));
    setFocusRow(rowKey(row));
  }

  async function createDeliverableColumn() {
    if (!newDeliverableName.trim()) return;
    const requestId = ++requestSequence.current;
    setCreatingColumn(true);
    setError('');
    let createdColumn = null;
    try {
      createdColumn = await addAcademicDeliverableColumn(workspaceId, newDeliverableName, newDeliverablePdf, data.trackerColumns);
      if (requestId !== requestSequence.current || workspaceRef.current !== `${cacheScope || ''}\u0000${workspaceId || ''}`) return;
      setNewDeliverableOpened(false);
      const snapshot = await loadAcademicData(workspaceId, cacheScope);
      if (requestId !== requestSequence.current || workspaceRef.current !== `${cacheScope || ''}\u0000${workspaceId || ''}`) return;
      const next = normalizeSnapshot(snapshot);
      const addedRow = next.deliverables.find((row) => normalize(row.trackerColumnKey) === normalize(createdColumn.columnKey));
      const nextRows = dirtyRef.current
        ? [...data.deliverables, ...next.deliverables.filter((row) => !data.deliverables.some((prior) => normalize(prior.trackerColumnKey) === normalize(row.trackerColumnKey)))]
        : next.deliverables;
      if (dirtyRef.current) {
        setData((current) => ({
          ...current,
          trackerColumns: next.trackerColumns,
          deliverables: [...current.deliverables, ...next.deliverables.filter((row) => !current.deliverables.some((prior) => normalize(prior.trackerColumnKey) === normalize(row.trackerColumnKey)))]
        }));
      } else {
        setData(next);
      }
      if (addedRow) jumpToRow(addedRow, nextRows);
      setNotice(`Tracker column ${createdColumn.label || createdColumn.columnKey} created. Set the due date and save the deliverable form.`);
      void onSaved?.();
    } catch (createError) {
      setError(createdColumn
        ? `Tracker column ${createdColumn.label || createdColumn.columnKey} was created, but its form row could not be loaded. Reload to complete it.`
        : createError?.message || 'Could not create the deliverable column.');
    } finally {
      setCreatingColumn(false);
    }
  }

  async function save() {
    if (!dirtyRows.length) return;
    if (dirtyHasErrors) {
      setError('Fix the highlighted cells before saving. Nothing was written.');
      return;
    }
    const savingGrid = activeGrid;
    const savingScope = `${cacheScope || ''}\u0000${workspaceId || ''}`;
    const requestId = ++requestSequence.current;
    const savedCount = dirtyRows.length;
    setStatus('saving');
    setError('');
    try {
      await saveAcademicRows(workspaceId, savingGrid, dirtyRows.map((row) => toPayload(savingGrid, row)));
      const snapshot = await loadAcademicData(workspaceId, cacheScope);
      if (requestId !== requestSequence.current || workspaceRef.current !== savingScope) return;
      const fresh = normalizeSnapshot(snapshot);
      // Saving one tab must never discard unsaved work in the other two tabs.
      // Refresh the saved tab from the server, but retain each locally edited
      // row (including newly added rows) in every other tab.
      setData((current) => Object.fromEntries(Object.keys(fresh).map((kind) => [
        kind,
        kind !== 'trackerColumns' && kind !== savingGrid && dirty[kind]?.size
          ? preserveDirtyRows(fresh[kind], current[kind], dirty[kind])
          : fresh[kind]
      ])));
      const remainingDirty = { ...dirty, [savingGrid]: new Set() };
      setDirty(remainingDirty);
      dirtyRef.current = Object.values(remainingDirty).some((keys) => keys.size > 0);
      setStatus('ready');
      await onSaved?.();
      setNotice(`${savedCount} ${savedCount === 1 ? 'row' : 'rows'} saved to WildTrack.`);
    } catch (saveError) {
      if (requestId !== requestSequence.current || workspaceRef.current !== savingScope) return;
      setStatus('ready');
      setError(saveError?.status === 409
        ? 'Academic data changed after you opened it. Reload before saving your edits.'
        : saveError?.message || 'Academic data could not be saved. No rows were applied.');
    }
  }

  function applyPaste() {
    if (status === 'saving') return;
    if (!pastePreview.rows.length || pastePreview.errors.length) return;
    dirtyRef.current = true;
    setData((current) => ({ ...current, [activeGrid]: pastePreview.nextRows }));
    setDirty((current) => ({ ...current, [activeGrid]: new Set([...current[activeGrid], ...pastePreview.dirtyKeys]) }));
    setPasteOpened(false);
    setPasteText('');
    setNotice(`${pastePreview.rows.length} pasted ${pastePreview.rows.length === 1 ? 'row is' : 'rows are'} ready to save. Paste is not written until Save changes.`);
  }

  return (
    <section className="wt-academic-data wt-academic-data-sheet" aria-label="Academic data workspace">
      <Stack gap="md">
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        {notice ? <Alert color="green" role="status">{notice}</Alert> : null}
        {status === 'loading' ? <Text size="sm" c="dimmed">Loading academic records…</Text> : null}
        {status === 'refreshing' ? <Text size="xs" c="dimmed">Refreshing academic records…</Text> : null}
        {status !== 'loading' ? (
          <Tabs value={activeGrid} onChange={(value) => { if (value && status !== 'saving') { setActiveGrid(value); setSearch(''); setSearchDraft(''); } }}>
            <Tabs.List className="wt-academic-sheet-tabs">
              <Tabs.Tab value="students">Students ({data.students.length})</Tabs.Tab>
              <Tabs.Tab value="projects">Teams / Projects ({data.projects.length})</Tabs.Tab>
              <Tabs.Tab value="deliverables">Deliverables ({data.deliverables.length})</Tabs.Tab>
            </Tabs.List>

            <Stack gap="sm" mt="md">
              <Group className="wt-academic-sheet-toolbar" justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                <div>
                  <Text fw={750}>{config.label}</Text>
                  <Text size="xs" c="dimmed">Columns marked * are required. Existing imported source references stay attached when you edit values.</Text>
                </div>
                <Group gap="xs" wrap="wrap">
                  <TextInput aria-label={`Search ${config.label.toLowerCase()}`} placeholder={`Search ${config.label.toLowerCase()}…`} value={searchDraft}
                    onChange={(event) => setSearchDraft(event.currentTarget.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { setSearch(searchDraft); setPage(1); } }} />
                  <Button variant="default" leftSection={<MagnifyingGlass size={16} />} onClick={() => { setSearch(searchDraft); setPage(1); }}>Search</Button>
                  {search ? <Button variant="subtle" onClick={() => { setSearch(''); setSearchDraft(''); setPage(1); }}>Clear search</Button> : null}
                  <Button variant="default" leftSection={<ArrowClockwise size={16} />} onClick={reload} disabled={status === 'saving'}>Reload</Button>
                  <Button variant="default" leftSection={<UploadSimple size={16} />} disabled={status === 'saving'} onClick={() => { setPasteText(''); setPasteOpened(true); }}>Paste rows</Button>
                  <Button variant="default" leftSection={<Plus size={16} />} disabled={status === 'saving'} onClick={addRow}>Add row</Button>
                  <Button variant="default" leftSection={<DownloadSimple size={16} />} onClick={() => downloadAcademicCsv(activeGrid, config.columns, filteredRows)}
                    disabled={!filteredRows.length}>Export CSV{search.trim() ? ' (filtered)' : ''}</Button>
                  <Button color="wildtrackMaroon" onClick={save} loading={status === 'saving'} disabled={!dirtyRows.length || dirtyHasErrors || status === 'refreshing'}>
                    Save changes{dirtyRows.length ? ` (${dirtyRows.length})` : ''}
                  </Button>
                </Group>
              </Group>

              <AcademicGrid
                gridRef={gridRef}
                kind={activeGrid}
                rows={pageRows}
                rowOffset={(page - 1) * pageSize}
                columns={config.columns}
                errors={errors}
                trackerColumns={data.trackerColumns}
                dirtyKeys={dirtyKeys}
                onChange={updateCell}
              />

              <Group className="wt-academic-pagination" justify="space-between" gap="md" wrap="wrap">
                <Text size="sm" c="dimmed" className="wt-tabular">
                  {filteredRows.length ? `${firstVisible}–${lastVisible} of ${filteredRows.length}${search ? ` matching of ${rows.length}` : ''}` : `0 of ${rows.length} rows`}
                </Text>
                <Group gap="sm" wrap="wrap">
                  <Select
                    aria-label="Rows per page"
                    value={String(pageSize)}
                    onChange={(value) => setPageSize(Number(value || 50))}
                    data={PAGE_SIZE_OPTIONS.map((value) => ({ value, label: `${value} rows` }))}
                    allowDeselect={false}
                    w={120}
                    size="sm"
                  />
                  <Pagination value={page} onChange={setPage} total={pageCount} withEdges />
                </Group>
              </Group>
            </Stack>
          </Tabs>
        ) : null}
      </Stack>

      <Modal opened={newDeliverableOpened} onClose={() => { if (!creatingColumn) setNewDeliverableOpened(false); }} title="Add deliverable" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">Create a WildTrack tracker column for this deliverable. After it appears in the grid, enter its due date and save the form.</Text>
          <TextInput label="Deliverable name" required value={newDeliverableName} maxLength={160} autoFocus
            onChange={(event) => setNewDeliverableName(event.currentTarget.value)} />
          <Checkbox label="PDF required" checked={newDeliverablePdf} onChange={(event) => setNewDeliverablePdf(event.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setNewDeliverableOpened(false)} disabled={creatingColumn}>Cancel</Button>
            <Button color="wildtrackMaroon" loading={creatingColumn} disabled={!newDeliverableName.trim()} onClick={createDeliverableColumn}>Create tracker column</Button>
          </Group>
        </Stack>
      </Modal>

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

function AcademicGrid({ kind, rows, rowOffset = 0, columns, errors, trackerColumns, dirtyKeys, onChange, gridRef }) {
  return (
    <div className="wt-academic-grid-scroll" ref={gridRef}>
      <table className="wt-academic-grid" aria-label={`${GRID_CONFIG[kind].label} academic data`}>
        <thead>
          <tr>
            <th className="wt-academic-row-number" aria-label="Row number">#</th>
            <th>Source</th>
            {columns.map((item) => <th key={item.key}>{item.label}{item.required ? ' *' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row);
            const rowErrors = errors.get(key) || {};
            return (
              <tr key={key} data-row-key={key} className={dirtyKeys.has(key) ? 'is-dirty' : undefined}>
                <td className="wt-academic-row-number">{rowOffset + index + 1}</td>
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
          {!rows.length ? <tr><td colSpan={columns.length + 2}><Text size="sm" c="dimmed">No rows yet. Add a row or paste spreadsheet data.</Text></td></tr> : null}
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
        variant="unstyled"
        value={value || null}
        data={trackerColumns.map((column) => ({ value: column.columnKey, label: column.label || column.columnKey }))}
        onChange={(next) => onChange(next || '')}
        error={error}
      />
    );
  }
  if (item.type === 'status') {
    return <Select aria-label={`${item.label} for ${rowIdentity(kind, row)}`} variant="unstyled" value={value || 'UNPUBLISHED'} data={['UNPUBLISHED', 'PUBLISHED']} onChange={(next) => onChange(next || 'UNPUBLISHED')} error={error} />;
  }
  return (
    <TextInput
      aria-label={`${item.label} for ${rowIdentity(kind, row)}`}
      type={item.type === 'datetime-local' ? 'datetime-local' : 'text'}
      variant="unstyled"
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

function preserveDirtyRows(freshRows, localRows, dirtyKeys) {
  const pending = new Map(localRows.filter((row) => dirtyKeys.has(rowKey(row))).map((row) => [rowKey(row), row]));
  const merged = freshRows.map((row) => {
    const original = pending.get(rowKey(row));
    if (!original) return row;
    pending.delete(rowKey(row));
    return original;
  });
  return [...merged, ...pending.values()];
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
