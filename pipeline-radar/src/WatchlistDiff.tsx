import type { ReactNode } from 'react';
import type { LandscapeDiff, Snapshot } from './watchlist';

// Milestone 5: "what changed since last time" panel. Renders ONLY inside the
// drugs view — FDA badges stream only while that view is open, so anywhere else
// the current side of the diff would sit permanently at all-unknown.
// Caveats come from the differ itself (they're data, and tested there).

const NCT_LINK_CAP = 10;

function NctLinks({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.slice(0, NCT_LINK_CAP).map((nct, i) => (
        <span key={nct}>
          {i > 0 && ', '}
          <a href={`https://clinicaltrials.gov/study/${nct}`} target="_blank" rel="noreferrer">
            {nct}
          </a>
        </span>
      ))}
      {ids.length > NCT_LINK_CAP && <span className="more"> +{ids.length - NCT_LINK_CAP} more</span>}
    </>
  );
}

function Section({ summary, children, muted }: { summary: string; children: ReactNode; muted?: boolean }) {
  return (
    <details className={muted ? 'diff-section muted' : 'diff-section'}>
      <summary>{summary}</summary>
      <ul>{children}</ul>
    </details>
  );
}

export function WatchlistDiff({ snapshot, diff }: { snapshot: Snapshot; diff: LandscapeDiff }) {
  const when = new Date(snapshot.savedAt).toLocaleString();
  const newTrialTotal = diff.newTrials.reduce((n, t) => n + t.nctIds.length, 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <div className="diff-panel">
      <p className="diff-header">
        Watchlist: changes since {when}{' '}
        <span className="more">(saved with {snapshot.fetchedTrials.toLocaleString()} trials loaded)</span>
      </p>
      {diff.caveats.map((c) => (
        <p className="diff-caveat" key={c}>
          {c}
        </p>
      ))}
      {!diff.hasChanges ? (
        <p className="diff-none">No changes since last save.</p>
      ) : (
        <>
          {diff.added.length > 0 && (
            <Section summary={`${plural(diff.added.length, 'new drug')}`}>
              {diff.added.map((d) => (
                <li key={d.key}>
                  <strong>{d.displayName}</strong> — {d.phaseLabel}, {plural(d.trialCount, 'trial')}:{' '}
                  <NctLinks ids={d.nctIds} />
                </li>
              ))}
            </Section>
          )}
          {diff.phaseAdvanced.length > 0 && (
            <Section summary={`${plural(diff.phaseAdvanced.length, 'phase advance')}`}>
              {diff.phaseAdvanced.map((p) => (
                <li key={p.key}>
                  <strong>{p.displayName}</strong>: {p.from} → {p.to}
                </li>
              ))}
            </Section>
          )}
          {diff.fdaFlipped.length > 0 && (
            <Section summary={`${diff.fdaFlipped.length} newly FDA-approved`}>
              {diff.fdaFlipped.map((f) => (
                <li key={f.key}>
                  <strong>{f.displayName}</strong> — was Investigational at last save
                </li>
              ))}
            </Section>
          )}
          {diff.newTrials.length > 0 && (
            <Section summary={`${plural(diff.newTrials.length, 'drug')} with new trials (+${newTrialTotal})`}>
              {diff.newTrials.map((t) => (
                <li key={t.key}>
                  <strong>{t.displayName}</strong>: <NctLinks ids={t.nctIds} />
                </li>
              ))}
            </Section>
          )}
          {diff.removed.length > 0 && (
            <Section summary={`${plural(diff.removed.length, 'dropped drug')}`}>
              {diff.removed.map((d) => (
                <li key={d.key}>
                  <strong>{d.displayName}</strong> — no longer in the loaded trial set
                </li>
              ))}
            </Section>
          )}
          {diff.renamed.length > 0 && (
            <Section summary={`${plural(diff.renamed.length, 'renamed cluster')}`} muted>
              {diff.renamed.map((r) => (
                <li key={r.cur.key}>
                  {r.prev.displayName} → <strong>{r.cur.displayName}</strong> (same underlying trials — clustering
                  re-keyed, not a pipeline change)
                </li>
              ))}
            </Section>
          )}
          {diff.newlyResolved.length > 0 && (
            <Section summary={`${diff.newlyResolved.length} first FDA verdicts (not a change)`} muted>
              {diff.newlyResolved.map((r) => (
                <li key={r.key}>
                  <strong>{r.displayName}</strong>: {r.status} — badge was unresolved at last save
                </li>
              ))}
            </Section>
          )}
          {diff.phaseRegressed.length > 0 && (
            <Section summary={`${plural(diff.phaseRegressed.length, 'phase regression')} (usually load-depth noise)`} muted>
              {diff.phaseRegressed.map((p) => (
                <li key={p.key}>
                  <strong>{p.displayName}</strong>: {p.from} → {p.to}
                </li>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
