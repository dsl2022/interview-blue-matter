import { useMemo, useState } from 'react';
import { fetchTrials } from './api';
import { TrialsTable, type SortState } from './TrialsTable';
import { FiltersBar, type FilterOption } from './FiltersBar';
import { SummaryPanel } from './SummaryPanel';
import { filterTrials, sortTrials, mergeTrials, trialsByPhase, type SortKey } from './summarize';
import { formatStatus } from './mapStudy';
import type { Trial } from './types';
import './App.css';

// §5: cap pagination at 2–3 pages; past that, narrowing with filters is the honest tool.
const MAX_PAGES = 3;

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'results';
      disease: string;
      trials: Trial[];
      total: number;
      nextPageToken?: string;
      pages: number;
    };

export default function App() {
  const [query, setQuery] = useState('lung cancer');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function search() {
    const disease = query.trim();
    if (!disease) return;
    setState({ kind: 'loading' });
    setSelectedPhases([]);
    setSelectedStatuses([]);
    setSort(null);
    try {
      const result = await fetchTrials(disease);
      setState({
        kind: 'results',
        disease,
        trials: result.trials,
        total: result.total,
        nextPageToken: result.nextPageToken,
        pages: 1,
      });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function loadMore() {
    if (state.kind !== 'results' || !state.nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchTrials(state.disease, state.nextPageToken);
      setState({
        ...state,
        trials: mergeTrials(state.trials, result.trials),
        nextPageToken: result.nextPageToken,
        pages: state.pages + 1,
      });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleIn(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  function onSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      // Numeric-ish columns are most useful biggest-first on first click.
      return { key, dir: key === 'phase' || key === 'enrollment' ? 'desc' : 'asc' };
    });
  }

  const allTrials = state.kind === 'results' ? state.trials : [];

  const filtered = useMemo(
    () => filterTrials(allTrials, { phases: selectedPhases, statuses: selectedStatuses }),
    [allTrials, selectedPhases, selectedStatuses],
  );

  const visible = useMemo(
    () => (sort ? sortTrials(filtered, sort.key, sort.dir) : filtered),
    [filtered, sort],
  );

  // Filter chips are derived from the FETCHED set (with counts), never hardcoded.
  const phaseOptions: FilterOption[] = useMemo(
    () => trialsByPhase(allTrials).map((b) => ({ key: b.key, label: b.label, count: b.count })),
    [allTrials],
  );

  const statusOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of allTrials) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: formatStatus(key), count }));
  }, [allTrials]);

  const filtersActive = selectedPhases.length > 0 || selectedStatuses.length > 0;

  return (
    <main>
      <h1>Pipeline Radar</h1>
      <p className="tagline">Enter a disease → see the active clinical-trial landscape.</p>

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. lung cancer"
          autoFocus
        />
        <button type="submit" disabled={state.kind === 'loading'}>
          Search
        </button>
      </form>

      {state.kind === 'loading' && <p className="info">Searching ClinicalTrials.gov…</p>}

      {state.kind === 'error' && <p className="error">Something went wrong: {state.message}</p>}

      {state.kind === 'results' && state.trials.length === 0 && (
        <p className="info">No active trials found for “{state.disease}”.</p>
      )}

      {state.kind === 'results' && state.trials.length > 0 && (
        <>
          <FiltersBar
            phaseOptions={phaseOptions}
            statusOptions={statusOptions}
            selectedPhases={selectedPhases}
            selectedStatuses={selectedStatuses}
            onTogglePhase={(k) => setSelectedPhases((p) => toggleIn(p, k))}
            onToggleStatus={(k) => setSelectedStatuses((s) => toggleIn(s, k))}
            onClear={() => {
              setSelectedPhases([]);
              setSelectedStatuses([]);
            }}
          />

          <p className="info">
            Showing <strong>{visible.length}</strong>
            {filtersActive && <> (filtered from {allTrials.length} fetched)</>} of{' '}
            <strong>{state.total.toLocaleString()}</strong> active trials for “{state.disease}”
          </p>

          <SummaryPanel trials={filtered} />

          <TrialsTable trials={visible} sort={sort} onSort={onSort} />

          {state.nextPageToken && state.pages < MAX_PAGES && (
            <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load 100 more'}
            </button>
          )}
          {state.nextPageToken && state.pages >= MAX_PAGES && (
            <p className="info page-cap">
              Page cap reached — first {allTrials.length} trials fetched of {state.total.toLocaleString()}.
              Narrow with filters or a more specific disease.
            </p>
          )}
        </>
      )}
    </main>
  );
}
