import {
  MagnifyingGlass,
  WarningCircle
} from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { statusTone } from '../lib/workflow.js';

export { DevelopmentRolePreview as GlobalDevPreview } from './layout/DevelopmentRolePreview.jsx';

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
