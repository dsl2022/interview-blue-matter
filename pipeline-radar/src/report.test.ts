import { buildMarkdownReport, reportFilename, type ReportMeta } from './report';
import type { Landscape, DrugRow } from './drugs/cluster';
import type { FdaBadge } from './drugs/openfda';

function row(over: Partial<DrugRow> & { key: string; displayName: string }): DrugRow {
  return {
    trialCount: 1,
    maxPhase: 3,
    phaseLabel: 'Phase 2',
    sponsors: ['Merck Sharp & Dohme'],
    aliases: [],
    nctIds: ['NCT00000001'],
    ...over,
  };
}

const approvedBadge: FdaBadge = { status: 'approved', approvalYear: '2014', via: 'generic' };
const approxBadge: FdaBadge = { status: 'approved', approvalYear: '2004', approvalApprox: true, via: 'generic' };

const landscape: Landscape = {
  drugs: [
    row({ key: 'pembrolizumab', displayName: 'Pembrolizumab', aliases: ['Keytruda', 'MK-3475'] }),
    row({ key: 'carboplatin', displayName: 'Carboplatin' }),
    row({ key: 'ab106', displayName: 'AB-106' }),
    row({ key: 'xy123', displayName: 'XY|123 weird', sponsors: [] }),
  ],
  excludedCount: 7,
  excludedNames: ['Chemotherapy'],
  assignedCount: 10,
  mentionTotal: 17,
};

const fdaMap = new Map<string, FdaBadge | null>([
  ['pembrolizumab', approvedBadge],
  ['carboplatin', approxBadge],
  ['ab106', null],
  // xy123 absent = pending
]);

const rxcuiMap = new Map<string, string | null>([
  ['pembrolizumab', '1547545'],
  ['xy123', null], // definitive RxNorm miss while FDA still pending
]);

function meta(over: Partial<ReportMeta> = {}): ReportMeta {
  return {
    disease: 'lung cancer',
    generatedAt: new Date('2026-08-14T12:00:00Z'),
    totalTrials: 6000,
    fetchedTrials: 1000,
    filteredTrials: 1000,
    filters: { phases: [], statuses: [] },
    phaseBuckets: [
      { key: 'PHASE3', label: 'Phase 3', count: 120 },
      { key: 'PHASE2', label: 'Phase 2', count: 300 },
    ],
    ...over,
  };
}

describe('buildMarkdownReport', () => {
  it('renders a two-number scope line when no filters are active', () => {
    const md = buildMarkdownReport(landscape, fdaMap, rxcuiMap, meta());
    expect(md).toContain('**1,000 of 6,000** active trials loaded');
    expect(md).not.toContain('matching filters');
    expect(md).toContain('7 non-drug / unspecified intervention mentions excluded');
  });

  it('renders THREE numbers when filters are active — filtered is never presented as load depth', () => {
    const md = buildMarkdownReport(
      landscape,
      fdaMap,
      rxcuiMap,
      meta({ filteredTrials: 300, filters: { phases: ['Phase 3'], statuses: ['Recruiting'] } }),
    );
    expect(md).toContain('**300** trials matching filters (phase: Phase 3; status: Recruiting)');
    expect(md).toContain('filtered from **1,000 of 6,000** active trials loaded');
  });

  it('mirrors the UI FDA cell rules, keeping pending separate from investigational', () => {
    const md = buildMarkdownReport(landscape, fdaMap, rxcuiMap, meta());
    expect(md).toContain('| Pembrolizumab | Phase 2 | 1 | Approved 2014 |');
    expect(md).toContain('| Carboplatin | Phase 2 | 1 | Approved · records since 2004 |');
    expect(md).toContain('| AB-106 | Phase 2 | 1 | Investigational |');
    // Pending + RxNorm definitive miss → hint, not a verdict.
    expect(md).toContain('— (not in RxNorm · likely investigational)');
    expect(md).toContain('**2** FDA-approved, **1** investigational, **1** pending verification.');
  });

  it('pending row without an RxNorm miss renders a bare dash', () => {
    const md = buildMarkdownReport(landscape, fdaMap, new Map(), meta());
    expect(md).not.toContain('not in RxNorm');
    expect(md).toContain('| XY\\|123 weird | Phase 2 | 1 | — | — | — |');
  });

  it('escapes pipes in free-text cells so the table stays parseable', () => {
    const md = buildMarkdownReport(landscape, fdaMap, rxcuiMap, meta());
    expect(md).toContain('XY\\|123 weird');
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'));
    // Header + separator + 4 drug rows, each with exactly 6 columns (7 unescaped pipes).
    expect(tableLines).toHaveLength(6);
    for (const line of tableLines) {
      expect(line.replace(/\\\|/g, '').split('|')).toHaveLength(8);
    }
  });

  it('caps aliases at 3 and abbreviates extra sponsors', () => {
    const many = {
      ...landscape,
      drugs: [
        row({
          key: 'k',
          displayName: 'Drug',
          aliases: ['a1', 'a2', 'a3', 'a4', 'a5'],
          sponsors: ['S1', 'S2', 'S3'],
        }),
      ],
    };
    const md = buildMarkdownReport(many, new Map(), new Map(), meta());
    expect(md).toContain('a1, a2, a3 +2 more');
    expect(md).toContain('S1 +2');
  });

  it('is deterministic for a fixed generatedAt', () => {
    const a = buildMarkdownReport(landscape, fdaMap, rxcuiMap, meta());
    const b = buildMarkdownReport(landscape, fdaMap, rxcuiMap, meta());
    expect(a).toBe(b);
    expect(a).toContain('Generated 2026-08-14');
  });
});

describe('reportFilename', () => {
  it('slugs the disease and stamps the date', () => {
    expect(reportFilename('Non-Small Cell Lung Cancer!', new Date('2026-08-14T12:00:00Z'))).toBe(
      'pipeline-radar-non-small-cell-lung-cancer-2026-08-14.md',
    );
  });
  it('falls back when the slug is empty', () => {
    expect(reportFilename('!!!', new Date('2026-08-14T12:00:00Z'))).toBe('pipeline-radar-landscape-2026-08-14.md');
  });
});
