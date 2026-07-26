import { useMemo, useState } from 'react';
import { CheckCircle, LinkSimple, PencilSimple, PlusCircle, Trash } from '@phosphor-icons/react';
import { Button, DataTable, Field, PageHeader, StatusBadge } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { formatDate, formatTime, getActiveTrackerColumns, getTrackerColumn, getWorkspacePublicKey, slugify, sortDeliverables } from '../lib/workflow.js';

const pdfField = { id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true };
const linkField = { id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false };

function todayAt2359() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59`;
}

function splitLocalDateTime(value) {
  const clean = String(value || todayAt2359()).slice(0, 16);
  const [date = '', time = '23:59'] = clean.split('T');
  return { date, time };
}

function joinLocalDateTime(date, time) {
  return `${date || splitLocalDateTime().date}T${time || '23:59'}`;
}

function makeDefaultForm(column = 'SRS') {
  return {
    id: '',
    title: `${column} Submission`,
    dueAt: todayAt2359(),
    trackerColumn: column,
    instructions: `Submit your ${column} as a PDF Drive file.`,
    pdfRequired: true,
    status: 'Published'
  };
}

export function FormsPage() {
  const {
    state,
    activeWorkspace,
    publishDeliverable,
    removeDeliverable,
    generateFormsFromSuggestions
  } = useWorkflow();
  const activeColumns = getActiveTrackerColumns(state);
  const firstColumn = activeColumns[0]?.key || activeColumns[0]?.label || 'SRS';
  const [form, setForm] = useState(() => {
    const existing = state.deliverables.find((item) => item.trackerColumn === firstColumn);
    return existing ? editableForm(existing) : makeDefaultForm(firstColumn);
  });
  const [editing, setEditing] = useState(null);
  const [copied, setCopied] = useState('');
  const selectedColumn = getTrackerColumn(state, form.trackerColumn);
  const selectedExisting = state.deliverables.find((item) => item.trackerColumn === form.trackerColumn);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, state.deliverables), [state]);
  const pendingSuggestions = state.classRecord.pendingFormSuggestions || state.classRecord.importSummary?.suggestedForms || [];
  const previewSlug = useMemo(() => slugify(form.title || `${form.trackerColumn} Submission`), [form.title, form.trackerColumn]);
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);

  function updateDeliverable(columnKey, targetSetter = setForm) {
    const column = getTrackerColumn(state, columnKey);
    const label = column?.label || columnKey;
    const existing = state.deliverables.find((item) => item.trackerColumn === (column?.key || columnKey));
    if (existing) {
      targetSetter(editableForm(existing));
      return;
    }
    targetSetter((current) => ({
      ...current,
      trackerColumn: column?.key || columnKey,
      title: current.id ? current.title : `${label} Submission`,
      instructions: column?.pdfRequired ? `Submit your ${label} as a PDF Drive file.` : `Submit the required link for ${label}.`,
      pdfRequired: column?.pdfRequired ?? current.pdfRequired
    }));
  }

  function buildPayload(source) {
    const column = getTrackerColumn(state, source.trackerColumn);
    const shortTitle = column?.label || source.trackerColumn;
    return {
      ...source,
      title: source.title || `${shortTitle} Submission`,
      shortTitle,
      dueAt: `${String(source.dueAt || todayAt2359()).slice(0, 16)}:00+08:00`,
      audience: 'Students',
      status: 'Published',
      fields: source.pdfRequired ? [pdfField] : [linkField]
    };
  }

  function submit(event) {
    event.preventDefault();
    publishDeliverable(buildPayload(form));
    if (!form.id) setForm(makeDefaultForm(selectedColumn?.key || selectedColumn?.label || firstColumn));
  }

  function openEditor(item) {
    setEditing(editableForm(item));
  }

  function saveEdit(event) {
    event.preventDefault();
    publishDeliverable(buildPayload(editing));
    setEditing(null);
  }

  async function copyLink(item) {
    const path = `${window.location.origin}/w/${workspaceKey}/submit/${item.slug}`;
    await navigator.clipboard?.writeText(path);
    setCopied(item.id);
    window.setTimeout(() => setCopied(''), 1600);
  }

  function confirmRemove(item) {
    if (window.confirm(`Unpublish ${item.shortTitle}? Existing responses stay connected to this deliverable.`)) {
      removeDeliverable(item.id);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Form Publisher" description="Publish one student submission link per deliverable from the connected class record." />

      {pendingSuggestions.length ? (
        <section className="suggested-forms-banner">
          <div>
            <strong>{pendingSuggestions.length} form suggestion{pendingSuggestions.length === 1 ? '' : 's'} ready</strong>
            <span>Deadlines were detected in the connected Tracker. Review and generate the forms when ready.</span>
          </div>
          <Button type="button" icon={CheckCircle} onClick={() => generateFormsFromSuggestions(pendingSuggestions)}>
            Generate suggested forms
          </Button>
        </section>
      ) : null}

      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <div className="panel-header">
            <div>
              <h2>{selectedExisting ? 'Update a deliverable form' : 'Publish a deliverable form'}</h2>
              <p>Choose a mapped deliverable, confirm the deadline, then share the generated link.</p>
            </div>
          </div>
          <div className="two-col">
            <Field label="Deliverable" helper="Loaded from the connected Tracker columns." required>
              <select value={form.trackerColumn} onChange={(event) => updateDeliverable(event.target.value)}>
                {activeColumns.map((column) => <option key={column.id} value={column.key}>{column.label}</option>)}
              </select>
            </Field>
            <Field label="Due date" required>
              <DateTimeFields value={form.dueAt} onChange={(dueAt) => setForm({ ...form, dueAt })} />
            </Field>
          </div>
          <div className="two-col">
            <Field label="Form title" required>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
            <Field label="Document rule">
              <select value={form.pdfRequired ? 'pdf' : 'link'} onChange={(event) => setForm({ ...form, pdfRequired: event.target.value === 'pdf' })}>
                <option value="pdf">PDF Drive link only</option>
                <option value="link">General link field</option>
              </select>
            </Field>
          </div>
          <Field label="Instructions">
            <textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} rows={3} />
          </Field>
          <div className="form-preview compact-preview">
            <span>Generated link</span>
            <strong>/w/{workspaceKey}/submit/{previewSlug}</strong>
          </div>
          <div className="button-row">
            <Button icon={selectedExisting ? CheckCircle : PlusCircle}>{selectedExisting ? 'Update existing form' : 'Publish form'}</Button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Published forms</h2>
            <p>Each deliverable can have only one form. Unpublishing closes the public link but keeps responses.</p>
          </div>
        </div>
        <DataTable columns={['Deliverable', 'Due', 'Rule', 'Link', 'Status', 'Actions']} minWidth={920} className="forms-table-wrap">
          {orderedDeliverables.map((item) => {
            const isPdf = item.fields.some((field) => field.pdfRequired);
            return (
              <tr key={item.id}>
                <td><strong>{item.shortTitle}</strong><small>{item.title}</small></td>
                <td><strong className="due-inline">{formatDate(item.dueAt)} | {formatTime(item.dueAt)}</strong></td>
                <td><StatusBadge status={isPdf ? 'PDF required' : 'Link fields'} /></td>
                <td>
                  <div className="form-link-cell">
                    <button className="icon-copy-button" type="button" onClick={() => copyLink(item)} aria-label={`Copy ${item.shortTitle} form link`} title="Copy link">
                      <LinkSimple weight="regular" />
                    </button>
                    <a className="form-link-url" href={`/w/${workspaceKey}/submit/${item.slug}`} target="_blank" rel="noreferrer">
                      /w/{workspaceKey}/submit/{item.slug}
                    </a>
                  </div>
                  {copied === item.id ? <small>Copied</small> : null}
                </td>
                <td><StatusBadge status={item.status || 'Published'} /></td>
                <td>
                  <div className="row-action-group">
                    <Button type="button" size="sm" variant="secondary" icon={PencilSimple} onClick={() => openEditor(item)}>Edit</Button>
                    {item.status === 'Unpublished' ? (
                      <Button type="button" size="sm" variant="primary" icon={CheckCircle} onClick={() => publishDeliverable({ ...item, status: 'Published' })}>Republish</Button>
                    ) : (
                      <Button type="button" size="sm" variant="secondary" icon={Trash} onClick={() => confirmRemove(item)}>Unpublish</Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      {editing ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel form-grid" onSubmit={saveEdit} role="dialog" aria-modal="true" aria-label="Edit published form">
            <div className="panel-header">
              <div>
                <h2>Edit form</h2>
                <p>Changes update the existing deliverable link and preserve all responses.</p>
              </div>
            </div>
            <Field label="Deliverable" required>
              <select value={editing.trackerColumn} onChange={(event) => updateDeliverable(event.target.value, setEditing)}>
                {activeColumns.map((column) => <option key={column.id} value={column.key}>{column.label}</option>)}
              </select>
            </Field>
            <Field label="Form title" required>
              <input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
            </Field>
            <div className="two-col">
              <Field label="Due date" required>
                <DateTimeFields value={editing.dueAt} onChange={(dueAt) => setEditing({ ...editing, dueAt })} />
              </Field>
              <Field label="Document rule">
                <select value={editing.pdfRequired ? 'pdf' : 'link'} onChange={(event) => setEditing({ ...editing, pdfRequired: event.target.value === 'pdf' })}>
                  <option value="pdf">PDF Drive link only</option>
                  <option value="link">General link field</option>
                </select>
              </Field>
            </div>
            <Field label="Instructions">
              <textarea value={editing.instructions} onChange={(event) => setEditing({ ...editing, instructions: event.target.value })} rows={3} />
            </Field>
            <div className="button-row">
              <Button icon={CheckCircle}>Save changes</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function editableForm(item) {
  return {
    id: item.id,
    title: item.title,
    dueAt: item.dueAt.slice(0, 16),
    trackerColumn: item.trackerColumn,
    instructions: item.instructions,
    pdfRequired: item.fields.some((field) => field.pdfRequired),
    status: item.status || 'Published'
  };
}

function DateTimeFields({ value, onChange }) {
  const parts = splitLocalDateTime(value);
  return (
    <div className="date-time-pair">
      <input
        aria-label="Due date"
        type="date"
        value={parts.date}
        onChange={(event) => onChange(joinLocalDateTime(event.target.value, parts.time))}
      />
      <span aria-hidden="true">|</span>
      <input
        aria-label="Due time"
        type="time"
        value={parts.time}
        onChange={(event) => onChange(joinLocalDateTime(parts.date, event.target.value))}
      />
    </div>
  );
}
