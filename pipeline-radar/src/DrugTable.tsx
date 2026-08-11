import type { DrugRow } from './drugs/cluster';

// One drug, one row (milestone 3). Rows render instantly from local clustering;
// the RxNorm column fills in progressively as enrichment settles.
// rxcuiMap: key present + string = resolved; key present + null = definitive miss
// (likely investigational, DATA-RESEARCH §3.2); key absent = not queried (yet).

export function DrugTable({
  drugs,
  rxcuiMap,
}: {
  drugs: DrugRow[];
  rxcuiMap: ReadonlyMap<string, string | null>;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Drug</th>
          <th>Highest phase</th>
          <th className="num">Trials</th>
          <th>Sponsors</th>
          <th>Also known as</th>
          <th>RxNorm</th>
        </tr>
      </thead>
      <tbody>
        {drugs.map((d) => (
          <tr key={d.key}>
            <td className="drug-name">{d.displayName}</td>
            <td>
              <span className={`phase-badge ${d.maxPhase === 0 ? 'phase-na' : ''}`}>{d.phaseLabel}</span>
            </td>
            <td className="num">{d.trialCount}</td>
            <td>
              {d.sponsors.slice(0, 2).join(', ')}
              {d.sponsors.length > 2 && (
                <span className="more" title={d.sponsors.slice(2).join(', ')}>
                  {' '}
                  +{d.sponsors.length - 2} more
                </span>
              )}
            </td>
            <td className="aliases" title={d.aliases.join(', ')}>
              {d.aliases.slice(0, 3).join(', ') || '—'}
              {d.aliases.length > 3 && <span className="more"> +{d.aliases.length - 3}</span>}
            </td>
            <td>
              {!rxcuiMap.has(d.key) ? (
                <span className="rx-pending">—</span>
              ) : rxcuiMap.get(d.key) ? (
                <a
                  href={`https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${rxcuiMap.get(d.key)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  RxCUI {rxcuiMap.get(d.key)}
                </a>
              ) : (
                <span className="rx-miss" title="No RxNorm concept even including investigational sources — typical for new compounds and research codes.">
                  unregistered · likely investigational
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
