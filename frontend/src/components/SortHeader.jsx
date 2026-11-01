import { Table, UnstyledButton } from '@mantine/core';
import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';

export function SortHeader({ column, children, className, sort, onSort, label, mantine = false }) {
  const active = sort?.column === column;
  const ascending = sort?.direction === 'asc';
  const Icon = active ? (ascending ? CaretUp : CaretDown) : CaretUpDown;
  const Header = mantine ? Table.Th : 'th';
  return <Header className={className} aria-sort={active ? (ascending ? 'ascending' : 'descending') : undefined}>
    <UnstyledButton aria-label={`Sort by ${label || children}`} title={`Sort ${active ? (ascending ? 'descending' : 'ascending') : column === 'submitted' ? 'descending' : 'ascending'}`}
      data-sort-direction={active ? sort.direction : undefined} onClick={() => onSort(column)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: className === 'wt-review-status-cell' ? 'center' : undefined, gap: 5, width: '100%', minHeight: 32, color: active ? 'var(--mantine-color-wildtrackMaroon-7)' : 'inherit', fontSize: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', whiteSpace: 'nowrap' }}>
      {children}<Icon size={14} weight={active ? 'bold' : 'regular'} aria-hidden="true" style={{ flexShrink: 0 }} />
    </UnstyledButton>
  </Header>;
}
