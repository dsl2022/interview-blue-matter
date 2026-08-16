import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  METHODOLOGY,
  TABLE_HEADERS,
  TRIALS_SOURCE_NOTE,
  TRIALS_TABLE_HEADERS,
  drugRowCells,
  fdaSummary,
  scopeSentence,
  trialRowCells,
  type ReportMeta,
} from './report';
import type { Trial } from './types';
import type { Landscape } from './drugs/cluster';
import type { FdaBadge } from './drugs/openfda';

// PDF renderer for the consultant deliverable — a real .pdf file download, not
// the print dialog. Kept out of report.ts so the pure text renderers stay
// dependency-free, and imported dynamically from the export bar so jspdf
// (~350KB) never loads unless someone clicks Export .pdf.
//
// jsPDF's built-in fonts are WinAnsi-encoded: em dash and middle dot render,
// but anything beyond Latin-1 would not — all report text stays within that.

const MARGIN = 48; // pt
const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;

export function buildPdfReport(
  landscape: Landscape,
  fdaMap: ReadonlyMap<string, FdaBadge | null>,
  rxcuiMap: ReadonlyMap<string, string | null>,
  meta: ReportMeta,
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = PAGE_WIDTH - 2 * MARGIN;
  let y = MARGIN;

  const paragraph = (text: string, size: number, color: string, gapAfter: number) => {
    doc.setFontSize(size).setTextColor(color);
    const wrapped = doc.splitTextToSize(text, width) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * size * 1.25 + gapAfter;
  };

  const disease = meta.disease.charAt(0).toUpperCase() + meta.disease.slice(1);
  doc.setFont('helvetica', 'bold');
  paragraph(`Pipeline Radar — ${disease} development landscape`, 16, '#111827', 4);
  doc.setFont('helvetica', 'normal');
  paragraph(
    `Generated ${meta.generatedAt.toISOString().slice(0, 10)} from ClinicalTrials.gov, RxNorm and FDA (drugs@fda) public data.`,
    8.5,
    '#6b7280',
    6,
  );

  paragraph(scopeSentence(meta, (s) => s), 9.5, '#1f2937', 2);
  if (landscape.excludedCount > 0) {
    paragraph(
      `${landscape.excludedCount} non-drug / unspecified intervention mentions excluded from the drug rollup.`,
      9.5,
      '#1f2937',
      2,
    );
  }

  const stats = fdaSummary(landscape, fdaMap);
  const counts = [`${stats.approved} FDA-approved`, `${stats.investigational} investigational`];
  if (stats.pending > 0) counts.push(`${stats.pending} pending verification`);
  paragraph(`${landscape.drugs.length} unique drugs — ${counts.join(', ')}.`, 9.5, '#1f2937', 2);
  if (meta.phaseBuckets.length > 0) {
    paragraph(
      `Trials by phase: ${meta.phaseBuckets.map((b) => `${b.label}: ${b.count}`).join(' · ')}.`,
      9.5,
      '#374151',
      4,
    );
  }

  // FIXED column widths, never auto. Real registry data contains unbroken
  // 70-char intervention names and long sponsor strings; autotable's
  // content-proportional sizing hands those columns everything and squeezes
  // the rest to ~one character, wrapping their text vertically letter-by-
  // letter (seen on the real 353-drug lung-cancer export). With fixed widths
  // the 'linebreak' overflow mode breaks long words instead.
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [TABLE_HEADERS],
    body: landscape.drugs.map((d) => {
      const c = drugRowCells(d, fdaMap, rxcuiMap);
      return [c.name, c.phase, String(c.trials), c.fda, c.sponsor, c.aliases];
    }),
    styles: { fontSize: 8, cellPadding: 3, textColor: '#1f2937', overflow: 'linebreak' },
    headStyles: { fillColor: '#1a56db', textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#f8fafc' },
    columnStyles: {
      0: { cellWidth: 105 }, // Drug
      1: { cellWidth: 48 }, // Highest phase
      2: { cellWidth: 30, halign: 'right' }, // Trials
      3: { cellWidth: 80 }, // FDA status
      4: { cellWidth: 100 }, // Lead sponsor
      5: { cellWidth: 'auto' }, // Also known as — takes the remainder (~136pt)
    },
  });

  appendFootnote(doc, `Methodology. ${METHODOLOGY}`, width, PAGE_HEIGHT, y);
  return doc;
}

// Footnote below the table, spilling to a new page if the table ran long.
function appendFootnote(doc: jsPDF, text: string, width: number, pageHeight: number, fallbackY: number) {
  let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallbackY) + 18;
  doc.setFontSize(7.5).setTextColor('#4b5563');
  const wrapped = doc.splitTextToSize(text, width) as string[];
  if (y + wrapped.length * 7.5 * 1.25 > pageHeight - MARGIN) {
    doc.addPage();
    y = MARGIN;
  }
  doc.text(wrapped, MARGIN, y);
}

// Trials-view export: seven columns need the width, so this one is A4
// LANDSCAPE. Same fixed-width rule as the drug table — registry titles and
// intervention lists are long free text and must never starve the columns.
export function buildTrialsPdfReport(trials: Trial[], meta: ReportMeta): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = PAGE_HEIGHT; // A4 rotated
  const pageHeight = PAGE_WIDTH;
  const width = pageWidth - 2 * MARGIN;
  let y = MARGIN;

  const paragraph = (text: string, size: number, color: string, gapAfter: number) => {
    doc.setFontSize(size).setTextColor(color);
    const wrapped = doc.splitTextToSize(text, width) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * size * 1.25 + gapAfter;
  };

  const disease = meta.disease.charAt(0).toUpperCase() + meta.disease.slice(1);
  doc.setFont('helvetica', 'bold');
  paragraph(`Pipeline Radar — ${disease} active clinical trials`, 16, '#111827', 4);
  doc.setFont('helvetica', 'normal');
  paragraph(
    `Generated ${meta.generatedAt.toISOString().slice(0, 10)} from ClinicalTrials.gov public data.`,
    8.5,
    '#6b7280',
    6,
  );
  paragraph(scopeSentence(meta, (s) => s), 9.5, '#1f2937', 2);
  if (meta.phaseBuckets.length > 0) {
    paragraph(
      `Trials by phase: ${meta.phaseBuckets.map((b) => `${b.label}: ${b.count}`).join(' · ')}.`,
      9.5,
      '#374151',
      4,
    );
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [TRIALS_TABLE_HEADERS],
    body: trials.map((t) => {
      const c = trialRowCells(t);
      return [c.nctId, c.title, c.tested, c.sponsor, c.phase, c.status, c.enrollment];
    }),
    styles: { fontSize: 7.5, cellPadding: 3, textColor: '#1f2937', overflow: 'linebreak' },
    headStyles: { fillColor: '#1a56db', textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#f8fafc' },
    columnStyles: {
      0: { cellWidth: 62 }, // NCT ID
      1: { cellWidth: 'auto' }, // Title — takes the remainder
      2: { cellWidth: 150 }, // What's tested
      3: { cellWidth: 120 }, // Sponsor
      4: { cellWidth: 58 }, // Phase
      5: { cellWidth: 75 }, // Status
      6: { cellWidth: 48, halign: 'right' }, // Enrollment
    },
  });

  appendFootnote(doc, `Source. ${TRIALS_SOURCE_NOTE}`, width, pageHeight, y);
  return doc;
}
