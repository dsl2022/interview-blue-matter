import { useState } from 'react';
import { fetchTrials } from './api';
import { TrialsTable } from './TrialsTable';
import type { SearchResult } from './types';
import './App.css';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; disease: string; result: SearchResult };

export default function App() {
  const [query, setQuery] = useState('lung cancer');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function search() {
    const disease = query.trim();
    if (!disease) return;
    setState({ kind: 'loading' });
    try {
      const result = await fetchTrials(disease);
      setState({ kind: 'results', disease, result });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

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

      {state.kind === 'results' && state.result.trials.length === 0 && (
        <p className="info">No active trials found for “{state.disease}”.</p>
      )}

      {state.kind === 'results' && state.result.trials.length > 0 && (
        <>
          <p className="info">
            Showing <strong>{state.result.trials.length}</strong> of{' '}
            <strong>{state.result.total.toLocaleString()}</strong> active trials for “{state.disease}”
          </p>
          <TrialsTable trials={state.result.trials} />
        </>
      )}
    </main>
  );
}
