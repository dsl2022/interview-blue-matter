import type { Trial } from './types';
import { formatPhases, formatStatus } from './mapStudy';

export function TrialsTable({ trials }: { trials: Trial[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>NCT ID</th>
          <th>Title</th>
          <th>What's tested</th>
          <th>Sponsor</th>
          <th>Phase</th>
          <th>Status</th>
          <th>Enrollment</th>
        </tr>
      </thead>
      <tbody>
        {trials.map((t) => (
          <tr key={t.nctId}>
            <td>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noreferrer">
                {t.nctId}
              </a>
            </td>
            <td className="title">{t.title}</td>
            <td>{t.interventions.map((i) => i.name).join(', ') || '—'}</td>
            <td>{t.sponsor}</td>
            <td>{formatPhases(t.phases)}</td>
            <td>
              <span className={`status status-${t.status.toLowerCase()}`}>{formatStatus(t.status)}</span>
            </td>
            <td className="num">{t.enrollment ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
