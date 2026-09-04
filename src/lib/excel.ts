function escapeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function excelWorkbook(title: string, columns: string[], rows: unknown[][]): string {
  const header = columns.map((cell) => `<th>${escapeCell(cell)}</th>`).join("");
  const body = rows.map((row) =>
    `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`).join("");
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(new Date());
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
    <meta name="ProgId" content="Excel.Sheet"><title>${escapeCell(title)}</title>
    <style>
      @page{margin:.35in; mso-page-orientation:landscape}
      body{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#fff}
      .report{border-collapse:collapse;border:1px solid #b8c2d1;min-width:900px}
      .report th,.report td{border:1px solid #d5dce7;padding:8px 10px;font-size:10pt;vertical-align:middle}
      .report .title{background:#173b68;color:#fff;font-size:16pt;font-weight:bold;text-align:left;padding:14px 12px}
      .report .meta{background:#edf3f9;color:#526174;font-size:9pt;text-align:left;padding:7px 12px}
      .report th{background:#2f6da5;color:#fff;font-weight:bold;text-align:left;white-space:nowrap}
      .report tbody tr:nth-child(even){background:#f5f8fb}
      .report tbody tr:hover{background:#e8f1fb}
      .report td:nth-child(1){font-family:Consolas,monospace;font-weight:bold}
      .empty{color:#667085;font-style:italic;text-align:center;padding:18px!important}
    </style></head><body>
    <table class="report">
      <thead>
        <tr><th class="title" colspan="${Math.max(columns.length, 1)}">${escapeCell(title)}</th></tr>
        <tr><td class="meta" colspan="${Math.max(columns.length, 1)}">Generated ${escapeCell(generatedAt)} · ${rows.length} record${rows.length === 1 ? "" : "s"}</td></tr>
        <tr>${header}</tr>
      </thead>
      <tbody>${rows.length ? body : `<tr><td class="empty" colspan="${Math.max(columns.length, 1)}">No records found for this report.</td></tr>`}</tbody>
    </table></body></html>`;
}

export function moneyPaise(value: number): string {
  return (value / 100).toFixed(2);
}
