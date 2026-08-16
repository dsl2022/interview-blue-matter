import { useEffect, useState } from 'react';
import type { ReportExt } from './report';

// Milestone 5 toolbar: export the landscape report (.md / .html / .pdf) + save
// the watchlist. Report content is built lazily at click time so it always
// reflects the current enrichment maps — export is never blocked on pending
// badges, the pending count is just surfaced next to the buttons.

function downloadBlob(content: string, type: string, name: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportBar({
  buildMarkdown,
  buildHtml,
  exportPdf,
  filename,
  onSaveWatchlist,
  pendingCount = 0,
}: {
  buildMarkdown: () => string;
  buildHtml: () => string;
  exportPdf: () => Promise<void>; // async: jspdf is dynamically imported on first click
  filename: (ext: ReportExt) => string;
  onSaveWatchlist?: () => void; // drugs view only — the trials view has no watchlist
  pendingCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      setCopied(true);
    } catch {
      /* clipboard permission denied — button simply stays unchanged */
    }
  }

  async function pdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportPdf();
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="export-bar">
      <button type="button" onClick={() => downloadBlob(buildMarkdown(), 'text/markdown', filename('md'))}>
        Export .md
      </button>
      <button type="button" onClick={() => downloadBlob(buildHtml(), 'text/html', filename('html'))}>
        .html
      </button>
      <button type="button" onClick={pdf} disabled={pdfBusy}>
        {pdfBusy ? 'Generating…' : '.pdf'}
      </button>
      <button type="button" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <button type="button" onClick={() => window.print()}>
        Print
      </button>
      {onSaveWatchlist && (
        <button type="button" className="save-watchlist" onClick={onSaveWatchlist}>
          Save watchlist
        </button>
      )}
      {pendingCount > 0 && (
        <span className="export-pending">{pendingCount} FDA badges still loading — exported now as “—”</span>
      )}
    </div>
  );
}
