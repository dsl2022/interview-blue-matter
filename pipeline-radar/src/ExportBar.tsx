import { useEffect, useState } from 'react';

// Milestone 5 toolbar: export the landscape report + save the watchlist.
// The report text is built lazily at click time so it always reflects the
// current enrichment maps — export is never blocked on pending badges, the
// pending count is just surfaced next to the buttons.

export function ExportBar({
  buildReport,
  filename,
  onSaveWatchlist,
  pendingCount,
}: {
  buildReport: () => string;
  filename: () => string;
  onSaveWatchlist: () => void;
  pendingCount: number;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  function download() {
    const blob = new Blob([buildReport()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
    } catch {
      /* clipboard permission denied — button simply stays unchanged */
    }
  }

  return (
    <div className="export-bar">
      <button type="button" onClick={download}>
        Export .md
      </button>
      <button type="button" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <button type="button" onClick={() => window.print()}>
        Print / PDF
      </button>
      <button type="button" className="save-watchlist" onClick={onSaveWatchlist}>
        Save watchlist
      </button>
      {pendingCount > 0 && (
        <span className="export-pending">{pendingCount} FDA badges still loading — exported now as “—”</span>
      )}
    </div>
  );
}
