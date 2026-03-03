export function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null>>): void {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0] ?? {});
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const normalized = value === null ? '' : String(value);
          const escaped = normalized.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
