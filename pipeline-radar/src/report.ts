import type { Landscape } from './drugs/cluster';
import type { FdaBadge } from './drugs/openfda';
import type { PhaseBucket } from './summarize';

// Milestone 5: the consultant deliverable. Pure landscape → Markdown; no fetch,
// no Date.now() — generatedAt is injected so the output is snapshot-testable.
//
// The one rule that matters here is the scope line: the report must never claim
// more coverage than it has. Three distinct numbers exist (registry total,
// trials fetched, trials surviving filters) and conflating any two of them is
// the milestone's named failure mode (MILESTONE-5-PLAN.md step 1).

export interface ReportMeta {
  disease: string;
  generatedAt: Date;
  totalTrials: number; // registry total for the query
  fetchedTrials: number; // true load depth
  filteredTrials: number; // what the exported landscape derives from
  filters: { phases: string[]; statuses: string[] }; // human-readable labels
  phaseBuckets: PhaseBucket[]; // trialsByPhase(filtered), computed at call site
}

// Free text goes into table cells: strip pipes and collapse whitespace so one
// weird intervention name can't break the whole table.
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Mirrors DrugTable's FdaChip + the RxNorm hint: absent key = pending, never a
// verdict; pending + definitive RxNorm miss keeps the likely-investigational hint.
function fdaCell(
  key: string,
  fdaMap: ReadonlyMap<string, FdaBadge | null>,
  rxcuiMap: ReadonlyMap<string, string | null>,
): string {
  if (!fdaMap.has(key)) {
    return rxcuiMap.get(key) === null ? '— (not in RxNorm · likely investigational)' : '—';
  }
  const badge = fdaMap.get(key);
  if (!badge) return 'Investigational';
  if (!badge.approvalYear) return 'Approved';
  return badge.approvalApprox
    ? `Approved · records since ${badge.approvalYear}`
    : `Approved ${badge.approvalYear}`;
}

export function buildMarkdownReport(
  landscape: Landscape,
  fdaMap: ReadonlyMap<string, FdaBadge | null>,
  rxcuiMap: ReadonlyMap<string, string | null>,
  meta: ReportMeta,
): string {
  const lines: string[] = [];
  const filtersActive = meta.filters.phases.length > 0 || meta.filters.statuses.length > 0;

  lines.push(`# Pipeline Radar — ${capitalize(meta.disease)} development landscape`);
  lines.push('');
  lines.push(`Generated ${meta.generatedAt.toISOString().slice(0, 10)} from ClinicalTrials.gov, RxNorm and FDA (drugs@fda) public data.`);
  lines.push('');

  // Scope line — three numbers when filters are active, never filtered-as-loaded.
  const loaded = `**${meta.fetchedTrials.toLocaleString()} of ${meta.totalTrials.toLocaleString()}** active trials loaded from ClinicalTrials.gov`;
  if (filtersActive) {
    const labels = [
      meta.filters.phases.length > 0 ? `phase: ${meta.filters.phases.join(', ')}` : '',
      meta.filters.statuses.length > 0 ? `status: ${meta.filters.statuses.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    lines.push(
      `Scope: based on **${meta.filteredTrials.toLocaleString()}** trials matching filters (${labels}), filtered from ${loaded}.`,
    );
  } else {
    lines.push(`Scope: based on ${loaded}.`);
  }
  if (landscape.excludedCount > 0) {
    lines.push(`${landscape.excludedCount} non-drug / unspecified intervention mentions excluded from the drug rollup.`);
  }
  lines.push('');

  // Headline stats — pending is its own bucket, never folded into investigational.
  let approved = 0;
  let investigational = 0;
  let pending = 0;
  for (const d of landscape.drugs) {
    if (!fdaMap.has(d.key)) pending++;
    else if (fdaMap.get(d.key)) approved++;
    else investigational++;
  }
  const counts = [`**${approved}** FDA-approved`, `**${investigational}** investigational`];
  if (pending > 0) counts.push(`**${pending}** pending verification`);
  lines.push(`**${landscape.drugs.length} unique drugs** — ${counts.join(', ')}.`);
  if (meta.phaseBuckets.length > 0) {
    lines.push(`Trials by phase: ${meta.phaseBuckets.map((b) => `${b.label}: ${b.count}`).join(' · ')}.`);
  }
  lines.push('');

  // The landscape table.
  lines.push('| Drug | Highest phase | Trials | FDA status | Lead sponsor | Also known as |');
  lines.push('| --- | --- | ---: | --- | --- | --- |');
  for (const d of landscape.drugs) {
    const sponsor =
      d.sponsors.length === 0
        ? '—'
        : cell(d.sponsors[0]) + (d.sponsors.length > 1 ? ` +${d.sponsors.length - 1}` : '');
    const aliases =
      d.aliases.length === 0
        ? '—'
        : d.aliases.slice(0, 3).map(cell).join(', ') +
          (d.aliases.length > 3 ? ` +${d.aliases.length - 3} more` : '');
    lines.push(
      `| ${cell(d.displayName)} | ${d.phaseLabel} | ${d.trialCount} | ${fdaCell(d.key, fdaMap, rxcuiMap)} | ${sponsor} | ${aliases} |`,
    );
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(
    '**Methodology.** Drug rows are clustered from free-text trial intervention names by heuristic alias voting (no transitive merging); perfect normalization of registry free text is not possible, so rare split/merge errors are expected. FDA status is a name match against drugs@fda (generic then brand names): "Investigational" means no FDA approval record was found under any known name, and "—" means the check has not completed. "Not in RxNorm" flags names absent from the NLM drug vocabulary — typical for new compounds and research codes.',
  );
  lines.push('');
  return lines.join('\n');
}

export function reportFilename(disease: string, date: Date): string {
  const slug = disease
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `pipeline-radar-${slug || 'landscape'}-${date.toISOString().slice(0, 10)}.md`;
}
