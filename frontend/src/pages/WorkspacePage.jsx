import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
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
import { Badge, Button as MantineButton, Collapse, Input, Modal, NativeSelect, Tabs, TextInput, Tooltip } from '@mantine/core';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, PageHeader, StatusIndicator } from '../components/ui.jsx';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { extractSheetId, formatDateTime, getActiveTrackerColumns } from '../lib/workflow.js';
import { getDocumentTemplateFileUrl, getDriveConnectionStatus } from '../lib/api.js';
import { removeSubmissionTemplate, saveSubmissionTemplate } from '../lib/submissionClient.js';
import {
  emptyWorkspaceAdmin,
  importWorkspaceSheet,
  loadWorkspaceArchiveReadiness,
  loadWorkspaceAdmin,
  publishSuggestedForms
} from '../lib/workspaceAdminClient.js';
import { StaffManagementPanel } from '../components/workspace/StaffManagementPanel.jsx';

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
  fieldId: null,
  name: '',
  sourceType: 'upload',
  file: null,
  driveUrl: '',
  replacing: null
};

const EMPTY_WORKSPACE_FORM = {
  name: '',
  program: 'IT',
  courseCode: '',
  semester: 'Semester 1',
  academicYear: '2026-27'
};

const EMPTY_ARCHIVE_READINESS = { status: 'idle', data: null, error: '' };

export function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const linkedSource = searchParams.get('source') || '';
  const {
    workspaces,
    allWorkspaces,
    activeWorkspace,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    refreshWorkspaceManagementCatalog
  } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const { data: state, setData: setState, status: workspaceStatus, error: workspaceError, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadWorkspaceAdmin,
    emptyWorkspaceAdmin, 'workspace-admin');
  const [sources, setSources] = useState(() => sourceValues(state));
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name || '');
  const [trackerSheet, setTrackerSheet] = useState(`${activeWorkspace?.courseCode || activeWorkspace?.program || 'Capstone'} Tracker`);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [templateToRemove, setTemplateToRemove] = useState(null);
  const [driveStatus, setDriveStatus] = useState({ configured: false, message: 'Checking connection...' });
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);
  const [mappingDraft, setMappingDraft] = useState({});
  const [importing, setImporting] = useState('');
  const [refreshingBackend, setRefreshingBackend] = useState(false);
  const [maintenanceAction, setMaintenanceAction] = useState('');
  const [workspaceEditorOpen, setWorkspaceEditorOpen] = useState(false);
  const [workspaceEditorId, setWorkspaceEditorId] = useState('');
  const [workspaceForm, setWorkspaceForm] = useState(EMPTY_WORKSPACE_FORM);
  const [workspaceFormError, setWorkspaceFormError] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceToArchive, setWorkspaceToArchive] = useState(null);
  const [workspaceLifecycleSaving, setWorkspaceLifecycleSaving] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [workspaceManagementOpen, setWorkspaceManagementOpen] = useState(false);
  const [archiveReadiness, setArchiveReadiness] = useState(EMPTY_ARCHIVE_READINESS);
  const archiveReadinessRequest = useRef(0);

  const activeColumns = getActiveTrackerColumns(state);
  const templateDeliverable = state.deliverables.find((item) => item.trackerColumn === template.deliverable) || null;
  const templateFieldOptions = getTemplateFieldOptions(templateDeliverable);
  const classRecord = state.classRecord;
  const sourceStatuses = useMemo(() => SOURCE_CONFIG.map((source) => ({
    ...source,
    ...(classRecord.sources?.[source.key] || {})
  })), [classRecord.sources]);
  const pendingSuggestions = classRecord.pendingFormSuggestions || classRecord.importSummary?.suggestedForms || [];
  const importedCount = sourceStatuses.filter((item) => item.status === 'Imported').length;
  const backendSyncError = state.backendSync?.lastError || '';
  const manageableWorkspaces = allWorkspaces?.length ? allWorkspaces : workspaces || [];
  const activeWorkspaceCount = manageableWorkspaces.filter((workspace) => workspace.active !== false).length;
  const archivedWorkspaceCount = manageableWorkspaces.length - activeWorkspaceCount;

  useEffect(() => {
    setSources((current) => {
      const incoming = sourceValues(state);
      return {
        teamFormation: current.teamFormation || incoming.teamFormation,
        tracker: current.tracker || incoming.tracker,
        projectMonitor: current.projectMonitor || incoming.projectMonitor
      };
    });
  }, [state.classRecord?.sources, state.classRecord?.sheetUrl]);

  useEffect(() => {
    setSources(sourceValues(state));
    setWorkspaceName(activeWorkspace?.name || '');
    setTrackerSheet(`${activeWorkspace?.courseCode || activeWorkspace?.program || 'Capstone'} Tracker`);
    setSummary(null);
    setMessage('');
    setTemplateModalOpen(false);
    setMappingDraft({});
    setImporting('');
    setTemplateSaving(false);
    setTemplateToRemove(null);
    setTemplateError('');
    setRefreshingBackend(false);
    setWorkspaceEditorOpen(false);
    setWorkspaceEditorId('');
    setWorkspaceFormError('');
    setWorkspaceSaving(false);
  }, [isCurrentScope]);

  useEffect(() => {
    getDriveConnectionStatus()
      .then(setDriveStatus)
      .catch((error) => setDriveStatus({ configured: false, message: `Backend unavailable: ${error.message}` }));
  }, [activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!refreshWorkspaceManagementCatalog) return undefined;
    refreshWorkspaceManagementCatalog().then((result) => {
      if (!cancelled && result && !result.ok) setWorkspaceNotice(result.error || 'Archived workspaces could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [refreshWorkspaceManagementCatalog]);

  async function importSource(sourceType, mappingOverrides = null) {
    if (!isCurrentScope()) return;
    setImporting(sourceType);
    setMessage('');
    let result;
    try {
      result = await importWorkspaceSheet(activeWorkspaceId, sourceType, {
      name: workspaceName,
      trackerSheet,
      sheetUrl: sources[sourceType],
      mappingOverrides
      });
      if (!isCurrentScope()) return;
      setState(result.state);
    } catch (error) {
      result = { ok: false, error: error?.message || 'Sheet import failed.' };
    }
    if (!isCurrentScope()) return;
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

  function openTemplateModal(item = null) {
    const initialDeliverable = item?.deliverable
      ? state.deliverables.find((deliverable) => deliverable.trackerColumn === item.deliverable) || null
      : state.deliverables.find((deliverable) => getTemplateFieldOptions(deliverable).length) || null;
    const initialFieldOptions = getTemplateFieldOptions(initialDeliverable);
    setTemplate({
      deliverable: item?.deliverable || initialDeliverable?.trackerColumn || '',
      fieldId: item ? (item.fieldId || null) : (initialFieldOptions.length === 1 ? initialFieldOptions[0].value : null),
      name: item?.name || '',
      sourceType: 'upload',
      file: null,
      driveUrl: item?.sourceUrl || '',
      replacing: item
    });
    setTemplateError('');
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
    setTemplateError('');
    const needsUpload = template.sourceType === 'upload' && !template.file;
    const needsDriveLink = template.sourceType === 'drive' && !template.driveUrl.trim();
    const needsName = template.sourceType === 'upload' && !template.name.trim();
    const needsArtifact = !template.replacing && templateFieldOptions.length > 1 && !template.fieldId;
    const noCheckableArtifact = !template.replacing && !templateFieldOptions.length;
    if (!template.deliverable || needsArtifact || noCheckableArtifact || needsName || needsUpload || needsDriveLink) {
      setTemplateError(noCheckableArtifact
        ? 'Choose a deliverable with a PDF artifact that uses Document Check.'
        : 'Choose a deliverable, PDF artifact, and template file or Drive link.');
      return;
    }
    setTemplateSaving(true);
    let result;
    try {
      await saveSubmissionTemplate(activeWorkspaceId, template);
      await reload();
      result = { ok: true, template: { name: template.name || 'Official template' } };
    } catch (error) {
      result = { ok: false, error: error?.message || 'Template could not be saved.' };
    }
    if (!isCurrentScope()) return;
    setTemplateSaving(false);
    if (!result.ok) {
      setTemplateError(result.error);
      return;
    }
    setTemplateModalOpen(false);
    setTemplate(EMPTY_TEMPLATE);
    setTemplateError('');
    setMessage(`${result.template.name} is ready for Document Check comparison.`);
  }

  async function confirmRemoveTemplate() {
    if (!templateToRemove || !isCurrentScope()) return;
    let result;
    try {
      await removeSubmissionTemplate(activeWorkspaceId, templateToRemove.id);
      await reload();
      result = { ok: true };
    } catch (error) {
      result = { ok: false, error: error?.message || 'Template could not be removed.' };
    }
    if (!isCurrentScope()) return;
    setTemplateToRemove(null);
    setMessage(result.ok ? 'Template removed.' : result.error);
  }

  async function generateSuggestedForms(suggestions = summary?.suggestedForms || pendingSuggestions) {
    try {
      const deliverables = await publishSuggestedForms(activeWorkspaceId, state, suggestions);
      await reload();
      if (!isCurrentScope()) return;
      setSummary(null);
      setMessage(`Generated or updated ${deliverables.length} deliverable form${deliverables.length === 1 ? '' : 's'}.`);
    } catch (error) {
      if (!isCurrentScope()) return;
      setMessage(error?.message || 'Suggested forms could not be generated.');
      return;
    }
  }

  function openCreateWorkspace() {
    setWorkspaceEditorId('');
    setWorkspaceForm(EMPTY_WORKSPACE_FORM);
    setWorkspaceFormError('');
    setWorkspaceEditorOpen(true);
  }

  function openEditWorkspace(workspace) {
    setWorkspaceEditorId(workspace.id);
    setWorkspaceForm({
      name: workspace.name || '',
      program: workspace.program || '',
      courseCode: workspace.courseCode || '',
      semester: workspace.semester || '',
      academicYear: workspace.academicYear || ''
    });
    setWorkspaceFormError('');
    setWorkspaceEditorOpen(true);
  }

  async function submitWorkspace(event) {
    event.preventDefault();
    setWorkspaceSaving(true);
    setWorkspaceFormError('');
    const existing = workspaceEditorId
      ? manageableWorkspaces.find((workspace) => workspace.id === workspaceEditorId)
      : null;
    const result = existing
      ? await updateWorkspace(existing.id, { ...workspaceForm, active: existing.active !== false })
      : await createWorkspace(workspaceForm);
    setWorkspaceSaving(false);
    if (!result.ok) {
      setWorkspaceFormError(result.error || `Workspace could not be ${existing ? 'updated' : 'created'}.`);
      return;
    }
    if (existing?.id === activeWorkspaceId) {
      setWorkspaceName(result.workspace.name);
      setTrackerSheet(`${result.workspace.courseCode || result.workspace.program || 'Capstone'} Tracker`);
    }
    setWorkspaceEditorOpen(false);
    setWorkspaceEditorId('');
    setWorkspaceForm(EMPTY_WORKSPACE_FORM);
    setWorkspaceNotice(existing ? `${result.workspace.name} updated.` : `${result.workspace.name} created.`);
  }

  async function restoreWorkspace(workspace) {
    setWorkspaceLifecycleSaving(true);
    const result = await updateWorkspace(workspace.id, { active: true });
    setWorkspaceLifecycleSaving(false);
    setWorkspaceNotice(result.ok ? `${result.workspace.name} restored.` : result.error || 'Workspace could not be restored.');
  }

  async function openArchiveWorkspace(workspace) {
    const requestId = ++archiveReadinessRequest.current;
    setWorkspaceToArchive(workspace);
    setArchiveReadiness({ status: 'loading', data: null, error: '' });
    try {
      const data = await loadWorkspaceArchiveReadiness(workspace.id);
      if (archiveReadinessRequest.current !== requestId) return;
      setArchiveReadiness({ status: 'ready', data, error: '' });
    } catch (error) {
      if (archiveReadinessRequest.current !== requestId) return;
      setArchiveReadiness({
        status: 'error',
        data: null,
        error: error?.message || 'Workspace archive readiness could not be checked.'
      });
    }
  }

  function closeArchiveWorkspace() {
    archiveReadinessRequest.current += 1;
    setWorkspaceToArchive(null);
    setArchiveReadiness(EMPTY_ARCHIVE_READINESS);
  }

  async function goToArchiveTask(path) {
    const workspace = workspaceToArchive;
    if (!workspace) return;
    closeArchiveWorkspace();
    if (workspace.id !== activeWorkspaceId) {
      const result = await switchWorkspace(workspace.id);
      if (!result?.ok) {
        setWorkspaceNotice(result?.error || 'Could not switch to that workspace.');
        return;
      }
    }
    navigate(path);
  }

  async function confirmArchiveWorkspace() {
    if (!workspaceToArchive) return;
    setWorkspaceLifecycleSaving(true);
    const result = await updateWorkspace(workspaceToArchive.id, { active: false });
    setWorkspaceLifecycleSaving(false);
    closeArchiveWorkspace();
    setWorkspaceNotice(result.ok ? `${result.workspace.name} archived.` : result.error || 'Workspace could not be archived.');
  }

  async function refreshFromBackend() {
    setRefreshingBackend(true);
    setMessage('');
    const result = await reload();
    if (!isCurrentScope()) return;
    setRefreshingBackend(false);
    setMaintenanceAction('');
    setMessage(result ? 'Backend data refreshed.' : 'Backend data could not be refreshed.');
  }

  return (
    <div className="page-stack wt-workspace-page">
      <PageHeader
        title="Workspace setup"
        description="Manage academic workspaces, source imports, official templates, and staff access. Edit submission forms on the Forms page."
        actions={<Button type="button" variant="secondary" icon={PlusCircle} onClick={openCreateWorkspace}>New workspace</Button>}
      />

      <section className="panel wt-collapsible-panel wt-management-section" aria-label="Academic workspace management">
        <div className="wt-collapsible-header">
          <button
            type="button"
            className="wt-collapsible-trigger"
            aria-label={`${workspaceManagementOpen ? 'Collapse' : 'Expand'} Academic workspaces`}
            aria-expanded={workspaceManagementOpen}
            onClick={() => setWorkspaceManagementOpen((current) => !current)}
          >
            <div className="wt-collapsible-copy">
              <strong>Academic workspaces</strong>
              <small>{activeWorkspaceCount} active · {archivedWorkspaceCount} archived. Archived workspaces stay out of normal selectors until restored.</small>
            </div>
            <span className="wt-collapsible-state" aria-hidden="true">
              <span>{workspaceManagementOpen ? 'Hide' : 'Show'}</span>
              {workspaceManagementOpen ? <CaretUp /> : <CaretDown />}
            </span>
          </button>
        </div>
        <Collapse in={workspaceManagementOpen}>
          <div className="wt-collapsible-body wt-management-section-body">
            <div className="table-wrap">
              <table aria-label="Academic workspaces">
                <thead><tr><th>Workspace</th><th>Academic context</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {manageableWorkspaces.map((workspace) => (
                    <tr key={workspace.id}>
                      <td><strong>{workspace.name}</strong></td>
                      <td><span>{workspace.program} | {workspace.courseCode}</span><small>{workspace.semester} | {workspace.academicYear}</small></td>
                      <td><StatusIndicator status={workspace.active === false ? 'Archived' : 'Active'} /></td>
                      <td>
                        <div className="wt-row-actions">
                          <Button type="button" size="sm" variant="secondary" icon={PencilSimple} onClick={() => openEditWorkspace(workspace)}>Edit</Button>
                          {workspace.active === false ? (
                            <Button type="button" size="sm" variant="secondary" icon={ArrowCounterClockwise} disabled={workspaceLifecycleSaving} onClick={() => restoreWorkspace(workspace)}>Restore</Button>
                          ) : (
                            <Button type="button" size="sm" variant="secondary" icon={Archive} disabled={workspaceLifecycleSaving} onClick={() => openArchiveWorkspace(workspace)}>Archive</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!manageableWorkspaces.length ? <tr><td colSpan="4"><span className="muted-copy">No academic workspaces have been created yet.</span></td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </Collapse>
        {workspaceNotice ? <div role="status" className={`inline-alert wt-collapsible-notice ${/(created|updated|archived|restored)/i.test(workspaceNotice) ? 'success' : 'danger'}`}>{workspaceNotice}</div> : null}
      </section>

      {activeWorkspaceId ? <ResourceBoundary status={workspaceStatus} error={workspaceError} onRetry={reload}>

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
        {backendSyncError ? (
          <div role="alert" className="inline-alert danger">{backendSyncError}</div>
        ) : null}
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
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSources((current) => ({ ...current, [source.key]: value }));
                        }}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                      <small>Sheet ID: {extractSheetId(sources[source.key]) || 'Not entered'}</small>
                    </div>
                  </td>
                  <td><StatusIndicator status={source.status || 'Not connected'} /></td>
                  <td>
                    <Tooltip label={source.importLabel} withArrow openDelay={350}>
                      <MantineButton
                        type="button"
                        variant="default"
                        color="wildtrackMaroon"
                        size="sm"
                        aria-label={source.importLabel}
                        leftSection={<LinkSimple size={16} aria-hidden="true" />}
                        loading={importing === source.key}
                        onClick={() => importSource(source.key)}
                      >
                        Import
                      </MantineButton>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message ? <div role="status" className={`inline-alert ${/(imported|refreshed|restored|generated|ready)/i.test(message) ? 'success' : 'danger'}`}>{message}</div> : null}
        {pendingSuggestions.length ? (
          <div className="suggested-forms-banner wt-source-suggestions">
            <div>
              <strong>{pendingSuggestions.length} form suggestion{pendingSuggestions.length === 1 ? '' : 's'} ready</strong>
              <span>Tracker deadlines are ready to create or update on the Forms page. Existing forms are updated, not duplicated.</span>
            </div>
            <Button type="button" icon={CheckCircle} onClick={() => generateSuggestedForms(pendingSuggestions)}>
              Generate suggested forms
            </Button>
          </div>
        ) : null}
      </section>

      <section className="panel wt-template-section">
        <div className="panel-header">
          <div>
            <h2>Official templates</h2>
            <p>Maintain one comparison template per checkable PDF artifact. Replacing a template keeps its deliverable and artifact mapping.</p>
          </div>
          <Button type="button" icon={PlusCircle} onClick={() => openTemplateModal()}>Add official template</Button>
        </div>
        <div className="table-wrap">
          <table aria-label="Official document templates" className="wt-template-table">
            <thead><tr><th>Deliverable</th><th>Artifact</th><th>Template</th><th>Source</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {state.templates.map((item) => {
                const artifactLabel = templateArtifactLabel(item, state.deliverables);
                return (
                  <tr key={item.id}>
                    <td><strong>{item.deliverable}</strong></td>
                    <td><strong>{artifactLabel}</strong></td>
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
                );
              })}
              {!state.templates.length ? (
                <tr><td colSpan="6"><div className="wt-empty-row"><FileText aria-hidden="true" /><span>No official templates added for this workspace.</span></div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <small className="integration-note">{driveStatus.message}</small>
      </section>

      <StaffManagementPanel
        workspaceId={activeWorkspaceId || activeWorkspace?.id}
        students={state.students}
        projectMetadata={state.projectMetadata}
      />

      <ImportSummaryDialog
        summary={summary}
        mappingDraft={mappingDraft}
        onMappingChange={(key, value) => setMappingDraft((current) => ({ ...current, [key]: value }))}
        onApplyMapping={applyMapping}
        onGenerate={generateSuggestedForms}
        onClose={() => setSummary(null)}
        importing={Boolean(importing)}
      />

      <Modal opened={templateModalOpen} onClose={() => { setTemplateModalOpen(false); setTemplateError(''); }} title={template.replacing ? 'Replace official template' : 'Add official template'} centered size="lg">
        <form className="wt-template-dialog" onSubmit={submitTemplate} aria-label={template.replacing ? 'Replace official template' : 'Add official template'}>
          {templateError ? <div className="inline-alert error" role="alert">{templateError}</div> : null}
          <div className="two-col">
            <NativeSelect
              label="Deliverable"
              required
              aria-label="Template deliverable"
              value={template.deliverable}
              disabled={Boolean(template.replacing)}
              onChange={(event) => {
                const deliverable = event.currentTarget.value;
                const selected = state.deliverables.find((item) => item.trackerColumn === deliverable) || null;
                const options = getTemplateFieldOptions(selected);
                setTemplate({
                  ...template,
                  deliverable,
                  fieldId: options.length === 1 ? options[0].value : null
                });
              }}
              data={activeColumns.map((column) => ({ value: column.label, label: column.label }))}
            />
            <NativeSelect
              label="Artifact / PDF field"
              description="Templates are associated with one Document Check-enabled PDF artifact."
              required={!template.replacing && templateFieldOptions.length > 1}
              aria-label="Template artifact field"
              value={template.fieldId || ''}
              disabled={Boolean(template.replacing) || templateFieldOptions.length <= 1}
              onChange={(event) => setTemplate({ ...template, fieldId: event.currentTarget.value || null })}
              data={[
                ...(!template.fieldId && (template.replacing || templateFieldOptions.length !== 1)
                  ? [{ value: '', label: template.replacing ? 'Legacy/default PDF artifact' : 'Choose a PDF artifact' }]
                  : []),
                ...templateFieldOptions
              ]}
            />
          </div>
          <div className="two-col">
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
          <Tabs value={template.sourceType} onChange={(value) => setTemplate({ ...template, sourceType: value })} keepMounted={false}>
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
                required={template.sourceType === 'drive'}
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

      </ResourceBoundary> : (
        <section className="panel" aria-label="No active workspace">
          <h2>No active workspace selected</h2>
          <p className="muted-copy">Create a workspace or restore an archived workspace to continue class setup.</p>
        </section>
      )}
      <Modal opened={workspaceEditorOpen} onClose={() => { if (!workspaceSaving) setWorkspaceEditorOpen(false); }} title={workspaceEditorId ? 'Edit academic workspace' : 'Create academic workspace'} centered size="lg">
        <form className="form-grid workspace-modal" onSubmit={submitWorkspace} aria-label={workspaceEditorId ? 'Edit academic workspace' : 'Create academic workspace'}>
          <p className="muted-copy">Use one workspace for each program, course, semester, and academic year.</p>
          {workspaceFormError ? <div className="inline-alert danger" role="alert">{workspaceFormError}</div> : null}
          <TextInput label="Workspace name" required value={workspaceForm.name} onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.currentTarget.value })} />
          <div className="two-col">
            <TextInput label="Program" required value={workspaceForm.program} onChange={(event) => setWorkspaceForm({ ...workspaceForm, program: event.currentTarget.value })} />
            <TextInput label="Course or section" required value={workspaceForm.courseCode} onChange={(event) => setWorkspaceForm({ ...workspaceForm, courseCode: event.currentTarget.value })} />
          </div>
          <div className="two-col">
            <TextInput label="Semester" required value={workspaceForm.semester} onChange={(event) => setWorkspaceForm({ ...workspaceForm, semester: event.currentTarget.value })} />
            <TextInput label="Academic year" required value={workspaceForm.academicYear} onChange={(event) => setWorkspaceForm({ ...workspaceForm, academicYear: event.currentTarget.value })} />
          </div>
          <div className="button-row"><Button icon={workspaceEditorId ? PencilSimple : PlusCircle} loading={workspaceSaving}>{workspaceEditorId ? 'Save changes' : 'Create workspace'}</Button><Button type="button" variant="secondary" disabled={workspaceSaving} onClick={() => setWorkspaceEditorOpen(false)}>Cancel</Button></div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(workspaceToArchive)}
        title="Archive workspace?"
        description="Complete these end-of-semester checks before archiving. Existing data, reviews, and archive history are preserved."
        size="lg"
        confirmLabel={archiveReadiness.status === 'ready' && archiveReadiness.data?.ready ? 'Archive workspace' : 'Archive anyway'}
        intent="danger"
        loading={workspaceLifecycleSaving}
        confirmDisabled={archiveReadiness.status === 'loading'}
        onClose={closeArchiveWorkspace}
        onConfirm={confirmArchiveWorkspace}
      >
        <div className="wt-archive-readiness">
          <div className="wt-archive-readiness-context">
            <strong>{workspaceToArchive?.name}</strong>
            <span>{workspaceToArchive?.program} | {workspaceToArchive?.courseCode} · {workspaceToArchive?.semester} | {workspaceToArchive?.academicYear}</span>
          </div>
          {archiveReadiness.status === 'loading' ? <span className="muted-copy">Checking current submissions and form status...</span> : null}
          {archiveReadiness.status === 'error' ? (
            <div className="inline-alert warning">
              <span>{archiveReadiness.error}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => openArchiveWorkspace(workspaceToArchive)}>Retry checks</Button>
            </div>
          ) : null}
          {archiveReadiness.status === 'ready' ? (
            <div className="wt-archive-readiness-list">
              <div className="wt-archive-readiness-card">
                <div className="wt-archive-readiness-card-heading">
                  <StatusIndicator status={archiveReadiness.data.unarchivedResponseCount === 0 ? 'Ready' : 'Needs attention'} />
                  <strong>Submissions archived</strong>
                </div>
                <span>{archiveReadiness.data.responseCount
                  ? `${archiveReadiness.data.archivedResponseCount} of ${archiveReadiness.data.responseCount} current response versions are archived.`
                  : 'No submitted responses need archiving.'}</span>
                {archiveReadiness.data.unacceptedResponseCount > 0 ? <small>{archiveReadiness.data.unacceptedResponseCount} still need adviser acceptance.</small> : null}
                {archiveReadiness.data.acceptedUnarchivedResponseCount > 0 ? <small>{archiveReadiness.data.acceptedUnarchivedResponseCount} accepted response{archiveReadiness.data.acceptedUnarchivedResponseCount === 1 ? ' still needs' : 's still need'} Final Archive.</small> : null}
                {archiveReadiness.data.unarchivedResponseCount > 0 ? (
                  <div className="wt-archive-readiness-actions">
                    {archiveReadiness.data.unacceptedResponseCount > 0 ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => goToArchiveTask('/review')}>Review responses</Button>
                    ) : null}
                    {archiveReadiness.data.acceptedUnarchivedResponseCount > 0 ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => goToArchiveTask('/archive')}>Final archive</Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="wt-archive-readiness-card">
                <div className="wt-archive-readiness-card-heading">
                  <StatusIndicator status={archiveReadiness.data.publishedFormCount === 0 ? 'Ready' : 'Needs attention'} />
                  <strong>Forms unpublished</strong>
                </div>
                <span>{archiveReadiness.data.publishedFormCount === 0
                  ? 'No public form is currently accepting responses.'
                  : `${archiveReadiness.data.publishedFormCount} published form${archiveReadiness.data.publishedFormCount === 1 ? '' : 's'} still accepting responses.`}</span>
                {archiveReadiness.data.publishedFormCount > 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => goToArchiveTask('/forms')}>Manage forms</Button>
                ) : null}
              </div>
              {!archiveReadiness.data.ready ? <small className="wt-archive-readiness-note">You can still archive an intentionally incomplete workspace. Unresolved items remain preserved.</small> : null}
            </div>
          ) : null}
        </div>
      </ConfirmDialog>

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
        description="Future Document Checks for this PDF artifact will no longer compare against this template. Existing reports remain."
        confirmLabel="Remove template"
        intent="danger"
        onClose={() => setTemplateToRemove(null)}
        onConfirm={confirmRemoveTemplate}
      >
        <strong>{templateToRemove?.name}</strong><span>{templateToRemove?.deliverable} | {templateArtifactLabel(templateToRemove, state.deliverables)}</span>
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
  const classRecord = state.classRecord;
  return {
    teamFormation: classRecord.sources?.teamFormation?.sheetUrl || '',
    tracker: classRecord.sources?.tracker?.sheetUrl || classRecord.sheetUrl || '',
    projectMonitor: classRecord.sources?.projectMonitor?.sheetUrl || ''
  };
}

function filenameToTemplateName(filename = '') {
  return String(filename)
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTemplateFieldOptions(deliverable) {
  return (deliverable?.fields || [])
    .filter((field) => field.pdfRequired && field.documentCheckPolicy !== 'OFF' && field.definitionId)
    .map((field) => ({ value: field.definitionId, label: field.label }));
}

function templateArtifactLabel(template, deliverables = []) {
  const deliverable = deliverables.find((item) => item.trackerColumn === template?.deliverable) || null;
  const fields = (deliverable?.fields || []).filter((field) => field.pdfRequired && field.documentCheckPolicy !== 'OFF');
  if (template?.fieldId) {
    return fields.find((field) => field.definitionId === template.fieldId)?.label || 'PDF artifact';
  }
  if (fields.length === 1) return fields[0].label;
  return 'Legacy/default PDF artifact';
}
