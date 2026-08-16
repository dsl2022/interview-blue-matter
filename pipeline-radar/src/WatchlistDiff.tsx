import type { ReactNode } from 'react';
import type { LandscapeDiff, Snapshot } from './watchlist';

// Milestone 5: "what changed since last time" panel. Renders ONLY inside the
// drugs view — FDA badges stream only while that view is open, so anywhere else
// the current side of the diff would sit permanently at all-unknown.
// Caveats come from the differ itself (they're data, and tested there).
//
// Layout: one compact card; each change category is an expandable row with a
// color-coded dot and a count badge, and the expanded list scrolls past ~7
// items so a big delta can never take over the page.

const NCT_LINK_CAP = 10;

function NctLinks({ ids }: { ids: string[] }) {
  return (
    <span className="nct-list">
      {ids.slice(0, NCT_LINK_CAP).map((nct, i) => (
        <span key={nct}>
          {i > 0 && ', '}
          <a href={`https://clinicaltrials.gov/study/${nct}`} target="_blank" rel="noreferrer">
            {nct}
          </a>
        </span>
      ))}
      {ids.length > NCT_LINK_CAP && <span className="more"> +{ids.length - NCT_LINK_CAP} more</span>}
    </span>
  );
}

type Tone = 'add' | 'up' | 'fda' | 'trials' | 'drop' | 'muted';

function Section({
  count,
  label,
  tone,
  children,
}: {
  count: number;
  label: string;
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <details className={`diff-section tone-${tone}`}>
      <summary>
        <span className="dot" aria-hidden="true" />
        <span className="count">{count}</span>
        <span className="label">{label}</span>
        <span className="chev" aria-hidden="true">
          ▸
        </span>
      </summary>
      <ul>{children}</ul>
    </details>
  );
}

export function WatchlistDiff({ snapshot, diff }: { snapshot: Snapshot; diff: LandscapeDiff }) {
  const when = new Date(snapshot.savedAt).toLocaleString();
  const newTrialTotal = diff.newTrials.reduce((n, t) => n + t.nctIds.length, 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <section className="diff-panel">
      <header className="diff-header">
        <span className="diff-title">Watchlist</span>
        <span className="diff-when">
          changes since {when} · saved with {snapshot.fetchedTrials.toLocaleString()} trials loaded
        </span>
      </header>
      {diff.caveats.map((c) => (
        <p className="diff-caveat" key={c}>
          {c}
        </p>
      ))}
      {!diff.hasChanges ? (
        <p className="diff-none">No changes since last save.</p>
      ) : (
        <div className="diff-sections">
          {diff.added.length > 0 && (
            <Section count={diff.added.length} label={`new drug${diff.added.length === 1 ? '' : 's'}`} tone="add">
              {diff.added.map((d) => (
                <li key={d.key}>
                  <strong>{d.displayName}</strong>
                  <span className="li-detail">
                    {d.phaseLabel} · {plural(d.trialCount, 'trial')} · <NctLinks ids={d.nctIds} />
                  </span>
                </li>
              ))}
            </Section>
          )}
          {diff.phaseAdvanced.length > 0 && (
            <Section
              count={diff.phaseAdvanced.length}
              label={`phase advance${diff.phaseAdvanced.length === 1 ? '' : 's'}`}
              tone="up"
            >
              {diff.phaseAdvanced.map((p) => (
                <li key={p.key}>
                  <strong>{p.displayName}</strong>
                  <span className="li-detail">
                    {p.from} → {p.to}
                  </span>
                </li>
              ))}
            </Section>
          )}
          {diff.fdaFlipped.length > 0 && (
            <Section count={diff.fdaFlipped.length} label="newly FDA-approved" tone="fda">
              {diff.fdaFlipped.map((f) => (
                <li key={f.key}>
                  <strong>{f.displayName}</strong>
                  <span className="li-detail">was Investigational at last save</span>
                </li>
              ))}
            </Section>
          )}
          {diff.newTrials.length > 0 && (
            <Section
              count={diff.newTrials.length}
              label={`drug${diff.newTrials.length === 1 ? '' : 's'} with new trials (+${newTrialTotal})`}
              tone="trials"
            >
              {diff.newTrials.map((t) => (
                <li key={t.key}>
                  <strong>{t.displayName}</strong>
                  <span className="li-detail">
                    <NctLinks ids={t.nctIds} />
                  </span>
                </li>
              ))}
            </Section>
          )}
          {diff.removed.length > 0 && (
            <Section
              count={diff.removed.length}
              label={`dropped drug${diff.removed.length === 1 ? '' : 's'}`}
              tone="drop"
            >
              {diff.removed.map((d) => (
                <li key={d.key}>
                  <strong>{d.displayName}</strong>
                  <span className="li-detail">no longer in the loaded trial set</span>
                </li>
              ))}
            </Section>
          )}
          {diff.renamed.length > 0 && (
            <Section
              count={diff.renamed.length}
              label={`renamed cluster${diff.renamed.length === 1 ? '' : 's'} — re-keyed, not a pipeline change`}
              tone="muted"
            >
              {diff.renamed.map((r) => (
                <li key={r.cur.key}>
                  <strong>{r.cur.displayName}</strong>
                  <span className="li-detail">was “{r.prev.displayName}” — same underlying trials</span>
                </li>
              ))}
            </Section>
          )}
          {diff.newlyResolved.length > 0 && (
            <Section
              count={diff.newlyResolved.length}
              label={`first FDA verdict${diff.newlyResolved.length === 1 ? '' : 's'} — not a change`}
              tone="muted"
            >
              {diff.newlyResolved.map((r) => (
                <li key={r.key}>
                  <strong>{r.displayName}</strong>
                  <span className="li-detail">{r.status} — badge was unresolved at last save</span>
                </li>
              ))}
            </Section>
          )}
          {diff.phaseRegressed.length > 0 && (
            <Section
              count={diff.phaseRegressed.length}
              label={`phase regression${diff.phaseRegressed.length === 1 ? '' : 's'} — usually load-depth noise`}
              tone="muted"
            >
              {diff.phaseRegressed.map((p) => (
                <li key={p.key}>
                  <strong>{p.displayName}</strong>
                  <span className="li-detail">
                    {p.from} → {p.to}
                  </span>
                </li>
              ))}
            </Section>
          )}
        </div>
      )}
    </section>
  );
}
