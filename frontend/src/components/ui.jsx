import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Archive,
  ClipboardText,
  Eye,
  FilePdf,
  Gauge,
  GoogleLogo,
  ListChecks,
  MagnifyingGlass,
  SignOut,
  Student,
  Table,
  UsersThree,
  WarningCircle,
  X
} from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { getWorkspacePublicKey, statusTone } from '../lib/workflow.js';
import { setStoredPreviewRole, usePreviewRole } from '../hooks/usePreviewRole.js';
import { useWorkflow } from '../app/WorkflowContext.jsx';

export function Button({ children, variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={loading || props.disabled} {...props}>
      {Icon ? <Icon weight="regular" aria-hidden="true" /> : null}
      <span>{loading ? 'Working...' : children}</span>
    </button>
  );
}

export function Field({ label, helper, error, children, required = false }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required ? <b> *</b> : null}</span>
      {children}
      {helper ? <span className="field-helper">{helper}</span> : null}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </label>
  );
}

export function StatusBadge({ status }) {
  return <span className={`status status-${statusTone(status)}`}>{status}</span>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, description, icon: Icon = WarningCircle }) {
  return (
    <div className="empty-state">
      <Icon weight="regular" aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmText = '',
  confirmationValue = '',
  onConfirmationValueChange,
  onConfirm,
  onClose,
  intent = 'primary',
  loading = false,
  children
}) {
  const titleId = useId();
  if (!open) return null;
  const requiresText = Boolean(confirmText);
  const canConfirm = !requiresText || confirmationValue === confirmText;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={`confirm-dialog-icon ${intent === 'danger' ? 'danger' : ''}`}>
          <WarningCircle weight="regular" aria-hidden="true" />
        </div>
        <div className="confirm-dialog-copy">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {children ? <div className="confirm-dialog-details">{children}</div> : null}
        {requiresText ? (
          <div className="confirm-text-block">
            <p>Type the confirmation word below to continue:</p>
            <strong>{confirmText}</strong>
          </div>
        ) : null}
        {requiresText ? (
          <Field label="Confirmation">
            <input
              autoFocus
              value={confirmationValue}
              onChange={(event) => onConfirmationValueChange?.(event.target.value)}
              autoComplete="off"
              placeholder={`Type ${confirmText}`}
              aria-label={`Type ${confirmText} to continue`}
            />
          </Field>
        ) : null}
        <div className="button-row confirm-dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={intent === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={!canConfirm || loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function AppShell({ children }) {
  const previewRole = usePreviewRole();
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace } = useWorkflow();
  const adminNav = [
    { to: '/', label: 'Command Center', icon: Gauge },
    { to: '/forms', label: 'Forms', icon: ClipboardText },
    { to: '/tracker', label: 'Tracker', icon: Table },
    { to: '/review', label: 'Review', icon: ListChecks },
    { to: '/adviser', label: 'Team Review', icon: UsersThree },
    { to: '/archive', label: 'Archive', icon: Archive },
    { to: '/workspace', label: 'Workspace', icon: GoogleLogo }
  ];
  const adviserNav = [
    { to: '/adviser', label: 'Team Review', icon: UsersThree },
    { to: '/tracker', label: 'Tracker', icon: Table }
  ];
  const nav = previewRole === 'adviser' ? adviserNav : adminNav;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><FilePdf weight="regular" /></div>
          <div>
            <strong>CapVault</strong>
          </div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <item.icon weight="regular" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <div className="topbar">
          <div className="topbar-workspace">
            <label htmlFor="global-workspace-select">Workspace</label>
            <select id="global-workspace-select" value={activeWorkspaceId} onChange={(event) => switchWorkspace(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </div>
          <div className="topbar-context">
            <strong>{activeWorkspace?.program} | {activeWorkspace?.courseCode}</strong>
            <span>{previewRole === 'adviser' ? 'Adviser View' : 'Admin View'} | {activeWorkspace?.semester} {activeWorkspace?.academicYear}</span>
          </div>
        </div>
        <section className="main-surface">{children}</section>
      </main>
    </div>
  );
}

export function GlobalDevPreview() {
  const navigate = useNavigate();
  const role = usePreviewRole();
  const { activeWorkspace } = useWorkflow();
  const [open, setOpen] = useState(() => localStorage.getItem('capvault.v2.dev-preview-open') === 'true');

  useEffect(() => {
    localStorage.setItem('capvault.v2.dev-preview-open', String(open));
  }, [open]);

  function switchView(nextRole, destination) {
    setStoredPreviewRole(nextRole);
    setOpen(false);
    navigate(destination);
  }

  return (
    <aside className={`global-dev-preview ${open ? 'open' : ''}`} aria-label="Development view switcher">
      <button
        type="button"
        className="global-dev-trigger"
        aria-label={open ? 'Close Dev Preview' : 'Open Dev Preview'}
        aria-expanded={open}
        title={open ? 'Close Dev Preview' : 'Open Dev Preview'}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X weight="bold" aria-hidden="true" /> : <Eye weight="regular" aria-hidden="true" />}
      </button>
      {open ? (
        <div className="global-dev-panel">
          <div className="global-dev-heading">
            <span>Development tools</span>
            <strong>Preview role</strong>
          </div>
          <div className="global-dev-options">
            <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => switchView('admin', '/')}>
              <Gauge weight="regular" /><span>Admin View</span>
            </button>
            <button type="button" className={role === 'adviser' ? 'active' : ''} onClick={() => switchView('adviser', '/adviser')}>
              <UsersThree weight="regular" /><span>Adviser View</span>
            </button>
            <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => switchView('student', '/student')}>
              <Student weight="regular" /><span>Student View</span>
            </button>
            <button type="button" onClick={() => { setOpen(false); navigate(`/w/${getWorkspacePublicKey(activeWorkspace)}/submit/week-9-srs`); }}>
              <FilePdf weight="regular" /><span>Open sample form</span>
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function DataTable({ columns, children, minWidth = 780, className = '' }) {
  return (
    <div className={`table-wrap ${className}`} style={{ '--table-min': `${minWidth}px` }}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function PublicHeader({ subtitle }) {
  const navigate = useNavigate();
  const { state, logoutStudentAccount } = useWorkflow();
  const activeAccount = state.studentAccounts.find((account) => account.email.toLowerCase() === String(state.activeAccountEmail || '').toLowerCase());

  function logout() {
    logoutStudentAccount();
    navigate('/register');
  }

  return (
    <header className="public-header">
      <Link className="public-brand" to="/">
        <span className="brand-mark small"><FilePdf weight="regular" /></span>
        <span><strong>CapVault</strong><small>{subtitle || 'Capstone submissions'}</small></span>
      </Link>
      <nav className="public-nav" aria-label="Student access">
        <Link to="/student">Student Dashboard</Link>
        {activeAccount ? (
          <>
            <span className="public-account-email">{activeAccount.email}</span>
            <button type="button" className="public-nav-button" onClick={logout}>
              <SignOut weight="regular" /><span>Log out</span>
            </button>
          </>
        ) : <Link to="/register">Sign in / Register</Link>}
      </nav>
    </header>
  );
}

export function SearchableSelect({ id, value, onChange, options, placeholder = 'Search', getValue = (item) => item.value, getLabel = (item) => item.label, disabledOptions = () => false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const matches = useMemo(() => {
    const needle = String(query || value || '').toLowerCase().trim();
    return options
      .filter((item) => {
        const haystack = `${getValue(item)} ${getLabel(item)}`.toLowerCase();
        return !needle || haystack.includes(needle);
      });
  }, [getLabel, getValue, options, query, value]);
  const filtered = matches.slice(0, 24);

  function choose(item) {
    if (disabledOptions(item)) return;
    const nextValue = getValue(item);
    onChange(nextValue, item);
    setQuery(nextValue);
    setOpen(false);
  }

  return (
    <div className="combo">
      <input
        id={id}
        value={open ? query : value}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value, null);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value || '');
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open ? (
        <div className="combo-menu" role="listbox">
          {filtered.length ? filtered.map((item) => (
            <button
              type="button"
              key={getValue(item)}
              className="combo-option"
              disabled={disabledOptions(item)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <strong>{getValue(item)}</strong>
              <span>{getLabel(item)}</span>
              {disabledOptions(item) ? <em>Claimed</em> : null}
            </button>
          )) : <div className="combo-empty">No matching class record entry.</div>}
          {matches.length > filtered.length ? (
            <div className="combo-count">Showing 24 of {matches.length} matches. Type a Student Number or name to narrow the list.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="search-box">
      <MagnifyingGlass weight="regular" aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
