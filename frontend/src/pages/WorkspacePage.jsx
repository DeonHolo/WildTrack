import { useEffect, useMemo, useState } from 'react';
import {
  ArrowClockwise,
  ArrowSquareOut,
  Buildings,
  CaretDown,
  CaretUp,
  CheckCircle,
  Database,
  FileArrowUp,
  FileText,
  LinkSimple,
  PencilSimple,
  PlusCircle,
  Table,
  Trash
} from '@phosphor-icons/react';
import { Badge, Checkbox, Collapse, Input, Modal, NativeSelect, Tabs, TextInput } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, PageHeader, StatusIndicator } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { extractSheetId, formatDateTime, getActiveTrackerColumns } from '../lib/workflow.js';
import { setStoredPreviewRole } from '../hooks/usePreviewRole.js';
import { getDocumentTemplateFileUrl, getDriveConnectionStatus } from '../lib/api.js';

const SOURCE_CONFIG = [
  {
    key: 'teamFormation',
    title: 'Team Formation',
    responsibility: 'Student identities and team membership',
    description: 'Student Number, name, team code, member number, and institutional email.',
    importLabel: 'Import Team Formation'
  },
  {
    key: 'tracker',
    title: 'Tracker',
    responsibility: 'Progress, deliverables, and deadline row',
    description: 'Raw tracker values, lateness, deliverable columns, and form deadline suggestions.',
    importLabel: 'Import Tracker'
  },
  {
    key: 'projectMonitor',
    title: 'Software Project Monitor',
    responsibility: 'Project titles, advisers, and remarks',
    description: 'Project metadata, software name, adviser assignment, remarks, comments, and category.',
    importLabel: 'Import Project Monitor'
  }
];

const SUMMARY_METRIC_LABELS = {
  students: 'Students',
  officialIds: 'Official IDs',
  teams: 'Teams',
  memberNumbers: 'Member numbers',
  institutionalEmails: 'Institutional emails',
  studentRows: 'Student rows',
  trackerColumns: 'Deliverables',
  rawProgressCells: 'Progress values',
  matchedRows: 'Roster matches',
  unmatchedRows: 'Unmatched rows',
  deadlineValues: 'Deadlines',
  groups: 'Groups',
  projectTitles: 'Project titles',
  softwareNames: 'Software names',
  descriptions: 'Descriptions',
  adviserAssignments: 'Advisers',
  proposalRemarks: 'Proposal remarks',
  demoComments: 'Demo comments',
  categories: 'Categories',
  skippedRows: 'Skipped rows'
};

const EMPTY_TEMPLATE = {
  deliverable: '',
  name: '',
  sourceType: 'upload',
  file: null,
  driveUrl: '',
  replacing: null
};

export function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const linkedSource = searchParams.get('source') || '';
  const {
    state,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    connectSheetSource,
    generateFormsFromSuggestions,
    refreshBackendData,
    reset,
    updateTrackerColumn,
    addTrackerColumn,
    saveTemplate,
    removeTemplate
  } = useWorkflow();
  const [sources, setSources] = useState(() => sourceValues(state));
  const [workspaceName, setWorkspaceName] = useState(state.classRecord.name);
  const [trackerSheet, setTrackerSheet] = useState(state.classRecord.trackerSheet);
  const [newColumn, setNewColumn] = useState('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateToRemove, setTemplateToRemove] = useState(null);
  const [driveStatus, setDriveStatus] = useState({ configured: false, message: 'Checking connection...' });
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);
  const [mappingDraft, setMappingDraft] = useState({});
  const [importing, setImporting] = useState('');
  const [refreshingBackend, setRefreshingBackend] = useState(false);
  const [maintenanceAction, setMaintenanceAction] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [workspaceEditorOpen, setWorkspaceEditorOpen] = useState(false);
  const [workspaceForm, setWorkspaceForm] = useState({
    name: '',
    program: 'IT',
    courseCode: '',
    semester: 'Semester 1',
    academicYear: '2026-27'
  });

  const activeColumns = getActiveTrackerColumns(state);
  const sourceStatuses = useMemo(() => SOURCE_CONFIG.map((source) => ({
    ...source,
    ...(state.classRecord.sources?.[source.key] || {})
  })), [state.classRecord.sources]);
  const pendingSuggestions = state.classRecord.pendingFormSuggestions || state.classRecord.importSummary?.suggestedForms || [];
  const importedCount = sourceStatuses.filter((item) => item.status === 'Imported').length;

  useEffect(() => {
    setSources(sourceValues(state));
    setWorkspaceName(activeWorkspace?.name || state.classRecord.name);
    setTrackerSheet(state.classRecord.trackerSheet || `${activeWorkspace?.courseCode || activeWorkspace?.program || 'Capstone'} Tracker`);
    setSummary(null);
    setMessage('');
    setColumnsOpen(false);
    setTemplateModalOpen(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    getDriveConnectionStatus()
      .then(setDriveStatus)
      .catch((error) => setDriveStatus({ configured: false, message: `Backend unavailable: ${error.message}` }));
  }, [activeWorkspaceId]);

  async function importSource(sourceType, mappingOverrides = null) {
    setImporting(sourceType);
    setMessage('');
    const result = await connectSheetSource(sourceType, {
      name: workspaceName,
      trackerSheet,
      sheetUrl: sources[sourceType],
      mappingOverrides
    });
    setImporting('');
    const nextSummary = result.importSummary
      ? { ...result.importSummary, sourceKey: sourceType }
      : null;
    setSummary(nextSummary);
    setMappingDraft(Object.fromEntries((nextSummary?.mappings || []).map((item) => [item.key, item.sourceColumn || ''])));
    setMessage(result.ok ? `${result.importSummary?.sourceType || 'Sheet'} imported.` : result.error);
  }

  function applyMapping() {
    if (!summary?.sourceKey) return;
    importSource(summary.sourceKey, mappingDraft);
  }

  function submitColumn(event) {
    event.preventDefault();
    addTrackerColumn(newColumn);
    setNewColumn('');
  }

  function openTemplateModal(item = null) {
    setTemplate({
      deliverable: item?.deliverable || activeColumns[0]?.label || '',
      name: item?.name || '',
      sourceType: 'upload',
      file: null,
      driveUrl: item?.sourceUrl || '',
      replacing: item
    });
    setTemplateModalOpen(true);
    setMessage('');
  }

  function selectTemplateFile(file) {
    setTemplate((current) => ({
      ...current,
      file,
      name: current.name || filenameToTemplateName(file?.name)
    }));
  }

  async function submitTemplate(event) {
    event.preventDefault();
    const needsUpload = template.sourceType === 'upload' && !template.file;
    const needsDriveLink = template.sourceType === 'drive' && !template.driveUrl.trim();
    const needsName = template.sourceType === 'upload' && !template.name.trim();
    if (!template.deliverable || needsName || needsUpload || needsDriveLink) {
      setMessage('Choose a deliverable and template file or Drive link.');
      return;
    }
    setTemplateSaving(true);
    const result = await saveTemplate(template);
    setTemplateSaving(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setTemplateModalOpen(false);
    setTemplate(EMPTY_TEMPLATE);
    setMessage(`${result.template.name} is ready for Document Check comparison.`);
  }

  async function confirmRemoveTemplate() {
    if (!templateToRemove) return;
    const result = await removeTemplate(templateToRemove.id);
    setTemplateToRemove(null);
    setMessage(result.ok ? 'Template removed.' : result.error);
  }

  function generateSuggestedForms(suggestions = summary?.suggestedForms || pendingSuggestions) {
    generateFormsFromSuggestions(suggestions);
    setSummary(null);
    setMessage(`Generated or updated ${suggestions.length} deliverable form${suggestions.length === 1 ? '' : 's'}.`);
  }

  async function submitWorkspace(event) {
    event.preventDefault();
    const result = await createWorkspace(workspaceForm);
    if (!result.ok) return;
    setWorkspaceEditorOpen(false);
    setWorkspaceForm({ name: '', program: 'IT', courseCode: '', semester: 'Semester 1', academicYear: '2026-27' });
  }

  async function refreshFromBackend() {
    setRefreshingBackend(true);
    setMessage('');
    const result = await refreshBackendData();
    setRefreshingBackend(false);
    setMaintenanceAction('');
    setMessage(result.ok ? 'Backend data refreshed.' : `Backend unavailable: ${result.error}`);
  }

  function restoreStarterData() {
    setStoredPreviewRole('admin');
    reset();
    setMaintenanceAction('');
    setResetConfirmation('');
    setSources({ teamFormation: '', tracker: '', projectMonitor: '' });
    setSummary(null);
    setMessage(`${activeWorkspace?.name || 'Workspace'} starter data restored.`);
  }

  return (
    <div className="page-stack wt-workspace-page">
      <PageHeader
        title="Workspace setup"
        description="Manage the class sources, deliverables, and document templates for the selected academic workspace."
        actions={<Button type="button" variant="secondary" icon={PlusCircle} onClick={() => setWorkspaceEditorOpen(true)}>New workspace</Button>}
      />

      <section className="panel wt-workspace-switcher">
        <div className="workspace-selector-row">
          <NativeSelect
            label="Current workspace"
            value={activeWorkspaceId}
            onChange={(event) => switchWorkspace(event.currentTarget.value)}
            data={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
          />
          <div className="workspace-identity">
            <Buildings aria-hidden="true" />
            <div>
              <strong>{activeWorkspace?.program} | {activeWorkspace?.courseCode}</strong>
              <span>{activeWorkspace?.semester} | {activeWorkspace?.academicYear}</span>
            </div>
            <StatusIndicator status={importedCount ? 'Imported' : 'Starter data'} />
          </div>
        </div>
        <div className="wt-workspace-facts" aria-label="Workspace data summary">
          <span><strong>{importedCount}/3</strong> sources imported</span>
          <span><strong>{state.students.length}</strong> students</span>
          <span><strong>{activeColumns.length}</strong> deliverables</span>
          <span><strong>{state.templates.length}</strong> templates</span>
        </div>
      </section>

      <section className="panel wt-source-section">
        <div className="panel-header">
          <div>
            <h2>Source sheets</h2>
            <p>Each Sheet has one responsibility. Import results are reviewed before further setup.</p>
          </div>
        </div>
        <TextInput
          label="Tracker tab label"
          description="Use the tab name shown at the bottom of the Tracker Sheet."
          required
          value={trackerSheet}
          onChange={(event) => setTrackerSheet(event.currentTarget.value)}
        />
        <div className="table-wrap wt-source-table-wrap">
          <table aria-label="Workspace source sheets" className="wt-source-table">
            <thead>
              <tr><th>Source</th><th>Published Sheet</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {sourceStatuses.map((source) => (
                <tr key={source.key} className={linkedSource === source.key ? 'is-linked-source' : undefined} aria-current={linkedSource === source.key ? 'true' : undefined}>
                  <td>
                    <strong>{source.title}</strong>
                    <span>{source.responsibility}</span>
                    <small>{source.description}</small>
                  </td>
                  <td>
                    <div className="wt-source-link-field">
                      <TextInput
                        aria-label={`${source.title} published Google Sheet link`}
                        value={sources[source.key]}
                        onChange={(event) => setSources((current) => ({ ...current, [source.key]: event.currentTarget.value }))}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                      <small>Sheet ID: {extractSheetId(sources[source.key]) || 'Not entered'}</small>
                    </div>
                  </td>
                  <td><StatusIndicator status={source.status || 'Not connected'} /></td>
                  <td>
                    <Button
                      type="button"
                      variant="secondary"
                      icon={LinkSimple}
                      loading={importing === source.key}
                      onClick={() => importSource(source.key)}
                    >
                      {source.importLabel}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message ? <div role="status" className={`inline-alert ${/(imported|refreshed|restored|generated|ready)/i.test(message) ? 'success' : 'danger'}`}>{message}</div> : null}
      </section>

      <section className="panel wt-columns-section">
        <button
          type="button"
          className="wt-section-toggle"
          aria-expanded={columnsOpen}
          onClick={() => setColumnsOpen((current) => !current)}
        >
          <div className="wt-section-toggle-copy">
            <span className="eyebrow">Tracker configuration</span>
            <strong>Deliverable columns</strong>
            <small>{state.trackerColumns.length} columns mapped; {activeColumns.length} currently used in forms and tracker views.</small>
          </div>
          <div className="wt-section-toggle-actions">
            {pendingSuggestions.length ? <Badge variant="light" color="wildtrackMaroon">{pendingSuggestions.length} form suggestions</Badge> : null}
            {columnsOpen ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
          </div>
        </button>
        <Collapse in={columnsOpen}>
          <div className="wt-column-editor">
            {pendingSuggestions.length ? (
              <div className="suggested-forms-banner">
                <div>
                  <strong>Detected deadlines are ready</strong>
                  <span>Forms will be created in deadline order. Existing deliverable forms are updated, not duplicated.</span>
                </div>
                <Button type="button" icon={CheckCircle} onClick={() => generateSuggestedForms(pendingSuggestions)}>
                  Generate {pendingSuggestions.length} suggested form{pendingSuggestions.length === 1 ? '' : 's'}
                </Button>
              </div>
            ) : null}
            <div className="wt-column-list">
              {state.trackerColumns.map((column) => (
                <div className="wt-column-row" key={column.id}>
                  <TextInput
                    label="Display name"
                    aria-label={`${column.label} display name`}
                    value={column.label}
                    onChange={(event) => updateTrackerColumn(column.id, { label: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Source column"
                    aria-label={`${column.label} source column`}
                    value={column.sourceColumn}
                    onChange={(event) => updateTrackerColumn(column.id, { sourceColumn: event.currentTarget.value })}
                  />
                  <Checkbox label="Active" checked={column.active !== false} onChange={(event) => updateTrackerColumn(column.id, { active: event.currentTarget.checked })} />
                  <Checkbox label="PDF" checked={Boolean(column.pdfRequired)} onChange={(event) => updateTrackerColumn(column.id, { pdfRequired: event.currentTarget.checked })} />
                </div>
              ))}
            </div>
            <form className="inline-form" onSubmit={submitColumn}>
              <TextInput aria-label="New Tracker column" value={newColumn} onChange={(event) => setNewColumn(event.currentTarget.value)} placeholder="Add a Tracker column" />
              <Button size="sm" icon={PlusCircle}>Add column</Button>
            </form>
          </div>
        </Collapse>
      </section>

      <section className="panel wt-template-section">
        <div className="panel-header">
          <div>
            <h2>Official templates</h2>
            <p>Maintain one comparison template per deliverable. Replacing a template keeps the deliverable mapping.</p>
          </div>
          <Button type="button" icon={PlusCircle} onClick={() => openTemplateModal()}>Add official template</Button>
        </div>
        <div className="table-wrap">
          <table aria-label="Official document templates" className="wt-template-table">
            <thead><tr><th>Deliverable</th><th>Template</th><th>Source</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {state.templates.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.deliverable}</strong></td>
                  <td><strong>{item.name}</strong><small>{item.extractedCharacterCount ? `${item.extractedCharacterCount.toLocaleString()} readable characters` : 'Ready for comparison'}</small></td>
                  <td>{item.originalFilename || item.sourceUrl || 'Starter template reference'}</td>
                  <td>{item.extractedAt ? formatDateTime(item.extractedAt) : 'Starter data'}</td>
                  <td>
                    <div className="wt-row-actions">
                      {item.originalFilename || item.fileUrl ? (
                        <Button component="a" type="button" size="sm" variant="secondary" icon={ArrowSquareOut} href={item.fileUrl || getDocumentTemplateFileUrl(activeWorkspaceId, item.id)} target="_blank" rel="noreferrer">
                          Open
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="secondary" icon={PencilSimple} onClick={() => openTemplateModal(item)}>Replace</Button>
                      <Button type="button" size="sm" variant="secondary" icon={Trash} onClick={() => setTemplateToRemove(item)}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!state.templates.length ? (
                <tr><td colSpan="5"><div className="wt-empty-row"><FileText aria-hidden="true" /><span>No official templates added for this workspace.</span></div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <small className="integration-note">{driveStatus.message}</small>
      </section>

      <section className="panel subtle-panel wt-maintenance">
        <div>
          <h2>Workspace maintenance</h2>
          <p>Refresh backend records or restore the selected workspace to its starter dataset.</p>
          <small>{state.classRecord.connectedAt ? `Last connected ${formatDateTime(state.classRecord.connectedAt)}` : 'No live Sheet connection yet.'}</small>
        </div>
        <div className="button-row">
          <Button variant="secondary" icon={Database} loading={refreshingBackend} onClick={() => setMaintenanceAction('refresh')}>Refresh backend data</Button>
          <Button variant="secondary" icon={ArrowClockwise} onClick={() => { setMaintenanceAction('reset'); setResetConfirmation(''); }}>Restore starter data</Button>
        </div>
      </section>

      <ImportSummaryDialog
        summary={summary}
        mappingDraft={mappingDraft}
        onMappingChange={(key, value) => setMappingDraft((current) => ({ ...current, [key]: value }))}
        onApplyMapping={applyMapping}
        onGenerate={generateSuggestedForms}
        onClose={() => setSummary(null)}
        importing={Boolean(importing)}
      />

      <Modal opened={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={template.replacing ? 'Replace official template' : 'Add official template'} centered size="lg">
        <form className="wt-template-dialog" onSubmit={submitTemplate} aria-label={template.replacing ? 'Replace official template' : 'Add official template'}>
          <div className="two-col">
            <NativeSelect
              label="Deliverable"
              required
              aria-label="Template deliverable"
              value={template.deliverable}
              disabled={Boolean(template.replacing)}
              onChange={(event) => setTemplate({ ...template, deliverable: event.currentTarget.value })}
              data={activeColumns.map((column) => ({ value: column.label, label: column.label }))}
            />
            <TextInput
              label="Template name"
              description={template.sourceType === 'drive' ? 'Optional; the Drive filename is used when blank.' : 'Defaults to the uploaded filename.'}
              required={template.sourceType === 'upload'}
              aria-label="Template name"
              value={template.name}
              onChange={(event) => setTemplate({ ...template, name: event.currentTarget.value })}
              placeholder="Official SRS template"
            />
          </div>
          <Tabs value={template.sourceType} onChange={(value) => setTemplate({ ...template, sourceType: value })}>
            <Tabs.List>
              <Tabs.Tab value="upload" leftSection={<FileArrowUp aria-hidden="true" />}>Upload file</Tabs.Tab>
              <Tabs.Tab value="drive" leftSection={<LinkSimple aria-hidden="true" />}>Google Drive link</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="upload" pt="md">
              <Input.Wrapper label="Template file" description="DOCX or PDF, up to 15 MB" required>
                <input
                  className="wt-file-input"
                  aria-label="Template file"
                  type="file"
                  accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => selectTemplateFile(event.currentTarget.files?.[0] || null)}
                />
              </Input.Wrapper>
            </Tabs.Panel>
            <Tabs.Panel value="drive" pt="md">
              <TextInput
                label="Google Drive link"
                description="The file must be shared as Anyone with the link - Viewer and allow downloads."
                required
                aria-label="Google Drive link"
                value={template.driveUrl}
                onChange={(event) => setTemplate({ ...template, driveUrl: event.currentTarget.value })}
                placeholder="https://drive.google.com/file/d/..."
              />
            </Tabs.Panel>
          </Tabs>
          <div className="button-row">
            <Button loading={templateSaving}>{template.replacing ? 'Replace template' : 'Save template'}</Button>
            <Button type="button" variant="secondary" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal opened={workspaceEditorOpen} onClose={() => setWorkspaceEditorOpen(false)} title="Create academic workspace" centered size="lg">
        <form className="form-grid workspace-modal" onSubmit={submitWorkspace} aria-label="Create academic workspace">
          <p className="muted-copy">Use one workspace for each program, course, semester, and academic year.</p>
          <TextInput label="Workspace name" required value={workspaceForm.name} onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.currentTarget.value })} />
          <div className="two-col">
            <TextInput label="Program" required value={workspaceForm.program} onChange={(event) => setWorkspaceForm({ ...workspaceForm, program: event.currentTarget.value })} />
            <TextInput label="Course or section" required value={workspaceForm.courseCode} onChange={(event) => setWorkspaceForm({ ...workspaceForm, courseCode: event.currentTarget.value })} />
          </div>
          <div className="two-col">
            <TextInput label="Semester" required value={workspaceForm.semester} onChange={(event) => setWorkspaceForm({ ...workspaceForm, semester: event.currentTarget.value })} />
            <TextInput label="Academic year" required value={workspaceForm.academicYear} onChange={(event) => setWorkspaceForm({ ...workspaceForm, academicYear: event.currentTarget.value })} />
          </div>
          <div className="button-row"><Button icon={PlusCircle}>Create workspace</Button><Button type="button" variant="secondary" onClick={() => setWorkspaceEditorOpen(false)}>Cancel</Button></div>
        </form>
      </Modal>

      <ConfirmDialog
        open={maintenanceAction === 'refresh'}
        title={`Refresh ${activeWorkspace?.name || 'workspace'} data?`}
        description="This replaces imported students, tracker columns, and project metadata with the latest backend data. Published forms and responses remain."
        confirmLabel="Refresh data"
        loading={refreshingBackend}
        onClose={() => setMaintenanceAction('')}
        onConfirm={refreshFromBackend}
      >
        <strong>{activeWorkspace?.name}</strong>
        <span>{state.students.length} students | {activeColumns.length} deliverables | {state.projectMetadata?.length || 0} project records</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(templateToRemove)}
        title="Remove this official template?"
        description="Future Document Checks for this deliverable will no longer compare against this template. Existing reports remain."
        confirmLabel="Remove template"
        intent="danger"
        onClose={() => setTemplateToRemove(null)}
        onConfirm={confirmRemoveTemplate}
      >
        <strong>{templateToRemove?.name}</strong><span>{templateToRemove?.deliverable}</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={maintenanceAction === 'reset'}
        title={`Restore ${activeWorkspace?.name || 'workspace'} starter data?`}
        description={`Only ${activeWorkspace?.name || 'the selected workspace'} will be reset. Other academic workspaces are not changed.`}
        confirmLabel="Restore starter data"
        confirmText="RESET"
        confirmationValue={resetConfirmation}
        onConfirmationValueChange={setResetConfirmation}
        onClose={() => { setMaintenanceAction(''); setResetConfirmation(''); }}
        onConfirm={restoreStarterData}
        intent="danger"
      >
        <strong>Type RESET exactly as shown</strong>
        <span>Imported sources, forms, responses, feedback, and archive examples in this workspace will be replaced.</span>
      </ConfirmDialog>
    </div>
  );
}

function ImportSummaryDialog({ summary, mappingDraft, onMappingChange, onApplyMapping, onGenerate, onClose, importing }) {
  if (!summary) return null;
  const skippedRows = Array.isArray(summary.skippedRows) ? summary.skippedRows : summary.skippedRowDetails || [];
  const deadlineRows = Array.isArray(summary.deadlineRows) ? summary.deadlineRows : [];
  const hasMappings = Boolean(summary.mappings?.length);
  return (
    <Modal opened onClose={onClose} title={`${summary.sourceType} import summary`} centered size="xl" classNames={{ content: 'import-summary-modal' }}>
      <div className="wt-import-summary-content">
        <div className="panel-header">
          <div><span className="eyebrow">Import review</span><h2>Review detected fields</h2><p>Confirm what was found, mapped, skipped, and still needs attention.</p></div>
          <StatusIndicator status={summary.resultStatus || 'Imported'} />
        </div>

        <div className="summary-metric-grid">
          {Object.entries(summary.metrics || {}).map(([key, value]) => <MetricMini key={key} label={SUMMARY_METRIC_LABELS[key] || key} value={value} />)}
          {summary.headerRow ? <MetricMini label="Header row" value={summary.headerRow} /> : null}
          {deadlineRows.length ? <MetricMini label="Deadline rows" value={deadlineRows.length} /> : null}
        </div>

        {hasMappings ? (
          <section className="wt-import-block">
            <h3>Field mapping</h3>
            <p>These are suggestions from the detected headers. Change a source column, then apply the mapping to re-import.</p>
            <div className="wt-mapping-grid">
              {summary.mappings.map((item) => (
                <NativeSelect
                  key={item.key}
                  label={`${item.label}${item.required ? ' (required)' : ''}`}
                  aria-label={`${item.label} source column`}
                  value={mappingDraft[item.key] || ''}
                  onChange={(event) => onMappingChange(item.key, event.currentTarget.value)}
                  data={[
                    { value: '', label: 'Not mapped' },
                    ...(summary.headers || []).map((header) => ({ value: header, label: header }))
                  ]}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="wt-import-findings">
          <Finding title="Found and mapped" values={summary.detectedFields} empty="No expected fields were mapped." />
          <Finding title="Required fields missing" values={summary.missingFields} empty="None." tone={summary.missingFields?.length ? 'warning' : ''} />
          <Finding title="Optional fields not found" values={summary.optionalFields} empty="None." />
          <Finding title="Unrecognized columns" values={summary.unrecognizedFields} empty="None." />
        </div>

        {skippedRows.length || deadlineRows.length ? (
          <section className="wt-import-block">
            <h3>Skipped and deadline rows</h3>
            <div className="wt-import-row-list">
              {skippedRows.map((item, index) => <span key={`skip-${item.rowNumber || index}`}>Row {item.rowNumber || '?'}: {item.reason || 'Skipped during import'}</span>)}
              {deadlineRows.map((item, index) => <span key={`deadline-${item.rowNumber || index}`}>Row {item.rowNumber || '?'}: {item.suggestions?.length || 0} deadline value{item.suggestions?.length === 1 ? '' : 's'} detected</span>)}
            </div>
          </section>
        ) : null}

        {summary.warnings?.length ? <div className="inline-alert warning">{summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}

        {summary.suggestedForms?.length ? (
          <section className="wt-import-block">
            <h3>Suggested forms</h3>
            <div className="suggested-form-list">
              {[...summary.suggestedForms].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).map((item) => (
                <div className="suggested-form-row" key={`${item.trackerColumn}-${item.dueAt}`}>
                  <div><strong>{item.title}</strong><span>{item.sourceValue}</span></div>
                  <Badge variant="light" color="gray">{item.pdfRequired ? 'PDF required' : 'Link fields'}</Badge>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="button-row">
          {hasMappings ? <Button variant="secondary" loading={importing} onClick={onApplyMapping}>Apply mapping</Button> : null}
          {summary.suggestedForms?.length ? <Button icon={CheckCircle} onClick={() => onGenerate(summary.suggestedForms)}>Generate suggested forms</Button> : null}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function Finding({ title, values = [], empty, tone = '' }) {
  return <div className={tone ? `is-${tone}` : ''}><strong>{title}</strong><p>{values?.length ? values.join(', ') : empty}</p></div>;
}

function MetricMini({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function sourceValues(state) {
  return {
    teamFormation: state.classRecord.sources?.teamFormation?.sheetUrl || '',
    tracker: state.classRecord.sources?.tracker?.sheetUrl || state.classRecord.sheetUrl || '',
    projectMonitor: state.classRecord.sources?.projectMonitor?.sheetUrl || ''
  };
}

function filenameToTemplateName(filename = '') {
  return String(filename)
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
