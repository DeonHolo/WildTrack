const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareSortValues(first, second) {
  return collator.compare(String(first ?? ''), String(second ?? ''));
}

export function nextSort(current, column) {
  return { column, direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc' };
}
