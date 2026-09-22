export function academicExportValue(value) {
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function csvCell(value) {
  const text = academicExportValue(value);
  // Spreadsheet applications may execute formulas when opening CSV files.
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildAcademicCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

export function downloadAcademicCsv(kind, columns, rows) {
  const blob = new Blob([buildAcademicCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `wildtrack-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // A delayed revoke leaves the object URL available to the browser's download handler.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
