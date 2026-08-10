# MILESTONE-3-PLAN.md — "One drug, one row" implementation plan

AUDIENCE: coding agent implementing Milestone 3 in `pipeline-radar/` during the live session.
Evidence base: `research/DATA-RESEARCH.md` (all §-references below point there). Do not re-derive; copy the verified regexes/constants from it.
Fits the existing architecture: `api.ts` (fetch) → `mapStudy.ts` (raw→`Trial`) → NEW `src/drugs/` (pure `Trial[]`→landscape) → NEW `DrugTable.tsx` (render) → NEW `drugs/rxnorm.ts` (async enrichment, cuttable).

## Goal / definition of done

Search results gain a "Drugs" view: one row per unique drug with display name, most-advanced phase, trial count, sponsors, known aliases; non-drug interventions in a visible excluded bucket; Jest goldens green. RxNorm RxCUI enrichment is a bonus layer, not on the critical path.

## Existing code contract (already true, rely on it)

- `Trial.interventions: { type: string; name: string; otherNames: string[] }[]` — otherNames already mapped (`mapStudy.ts:30`).
- `App.tsx` state machine holds `result.trials` on `kind: 'results'` — landscape derives from it with `useMemo`, no new async state needed.
- Jest + ts-jest configured; tests colocated `src/*.test.ts`; golden style already established in `mapStudy.test.ts`.

## Step 1 — `src/drugs/canon.ts` (pure string layer) — ~10 min

Exports (implementations verbatim from DATA-RESEARCH §2.2 step 2–4 / `research/cluster3.mjs`):
- `canon(s: string): string` — NFKD accent-fold → strip `®™©` → lowercase → drop `\(.*?\)` → drop route/form words → drop dose tokens → non-alnum→space → squash spaces → trim.
- `nameKey(s: string): string` — `canon(s)` with spaces removed (`MK 3475` ≡ `mk-3475` ≡ `MK3475`).
- `isResearchCode(s)` — `^[A-Z]{1,5}[- ]?\d{2,7}[A-Za-z]?$` on trimmed raw.
- `isCombo(s)` / `splitCombo(s): string[]` — detector + split regex from §2.2 step 4 (comma-split ONLY combo-flagged names).
- `isCategoryTerm(canonForm)` — blocklist regex from §2.2 step 3 (include `steroid`, `vaccine`, `cells?` — measured leaks).

Tests (write FIRST, they encode measured reality):
- `canon('Pembrolizumab (KEYTRUDA®)') === 'pembrolizumab'`
- `canon('Osimertinib 80 mg/40 mg') === 'osimertinib'`; `canon('Adebrelimab Injection') === 'adebrelimab'`
- `nameKey('MK 3475') === nameKey('MK-3475') === 'mk3475'`
- `splitCombo('Carboplatin + Pemetrexed + Pembrolizumab')` → 3 parts
- `isCategoryTerm(canon('Placebo'))`, `isCategoryTerm(canon('Platinum-based chemotherapy'))` true; `isCategoryTerm(canon('Pembrolizumab'))` false.

## Step 2 — `src/drugs/cluster.ts` (the core) — ~15 min

```ts
export interface DrugRow {
  key: string;            // cluster key (internal — never display)
  displayName: string;    // §2.2 step 6: top-trial-count single-agent raw name, title-cased
  trialCount: number;     // UNIQUE nctIds (dedupe! same trial may mention drug twice)
  maxPhase: number;       // -1..4, see ranking below
  phaseLabel: string;     // 'Phase 3', 'N/A', …
  sponsors: string[];     // unique, by frequency desc
  aliases: string[];      // union of otherNames + absorbed raw variants
  nctIds: string[];
  rxcui?: string | null;  // filled by step 5; undefined = not queried, null = queried+miss
}
export interface Landscape { drugs: DrugRow[]; excludedCount: number; excludedNames: string[] }
export function buildDrugLandscape(trials: Trial[]): Landscape
```

Algorithm (DATA-RESEARCH §2.2 — alias VOTING, explicitly NO transitive union-find, §2.1):
1. Records: for each trial, each intervention with `type ∈ {DRUG, BIOLOGICAL}` (§1.2 — BIOLOGICAL is mandatory).
2. Vote pass: records whose name is single-agent AND non-category vote `nameKey(otherName) → nameKey(name)`, weight 1 per record; skip alias if combo/category.
3. Resolve `aliasMap` with BOTH guards (measured necessary): ambiguity-drop (tie between claimants ⇒ drop alias) and count-guard (never remap a key that is itself a primary name at least as frequent as the claimant — prevents the `hlx10` hijack of carboplatin).
4. Assign pass per record: category → excluded bucket; combo → `splitCombo`, resolve each non-category part; else resolve `nameKey(name)`. Resolve = follow `aliasMap` max 3 hops.
5. Aggregate rows; phase ranking `EARLY_PHASE1=0 < PHASE1=1 < PHASE2=2 < PHASE3=3 < PHASE4=4`, `NA`/missing = -1 and can never win max (§1.1). Sort trialCount desc.

Golden tests (all verified true against the real corpus, §5):
- Pembrolizumab absorbs `pembrolizumab`, `Pembrolizumab (KEYTRUDA®)`, `Pembrolizumab 200 mg`, and the component from `Carboplatin + Pemetrexed + Pembrolizumab`.
- A trial with intervention `Tagrisso` + a trial with `Osimertinib` (otherNames `[AZD9291, Tagrisso]`) → ONE row, display "Osimertinib".
- Over-merge canary: `carboplatin` and `cisplatin` rows stay SEPARATE even when a combo record's otherNames lists both.
- `Placebo` / `Chemotherapy` never become drug rows; land in excluded bucket.
- Conservation: every DRUG/BIOLOGICAL intervention occurrence lands in ≥1 row or the excluded bucket (no silent loss).
- Trial-count dedup: one trial mentioning `Nivolumab` and `nivolumab` counts 1.

## Step 3 — UI: `src/DrugTable.tsx` + view toggle in `App.tsx` — ~10 min

- Toggle `Trials (N) | Drugs (M)` above the table; landscape via `useMemo(() => buildDrugLandscape(trials), [trials])`.
- Columns: Drug · Highest phase · Trials · Sponsors (top 2, "+n more") · Also known as (first 3 aliases, title attr for rest) · Badge (render `—` placeholder; M4 fills it).
- Below table: one muted line `Excluded: N non-drug/unspecified interventions` (transparency = verification talking point).
- Reuse existing table CSS; no new styling work.

## Step 4 — more data per search (tiny `api.ts` change) — ~3 min

Landscape over 100 trials is demoable but thin. Change `pageSize` to `'500'` in `fetchTrials` (research fetched 1000-size pages in seconds; §Corpus). Show "based on N loaded trials" in the Drugs view header. CUTTABLE — everything works on 100.

## Step 5 — `src/drugs/rxnorm.ts` enrichment — ~10 min, CUT LINE ABOVE

Rules measured in §3 — do not improvise:
- `GET https://rxnav.nlm.nih.gov/REST/rxcui.json?name=<canon(displayName)>&allsrc=1` — `allsrc=1` is the single highest-leverage flag (clean-name hits 52%→77%). Miss = HTTP 200 `{"idGroup":{}}`.
- Skip `search=2` (adds 0). Skip case variants (endpoint is case-insensitive). **NO approximateTerm/fuzzy in the live session** (scores unusable; wrong-drug risk on research codes).
- On miss: retry once with up to 2 brand-ish aliases (`^[A-Z][a-z]{3,12}$` from row.aliases); still miss ⇒ `rxcui: null` ⇒ show "unregistered — likely investigational" hint (M4 bridge; §3.2 "miss is signal").
- Budget: top 30 rows only, concurrency ≤4 (p50 27ms), cache `Map` + `localStorage['rxnorm:'+key]`, no expiry.
- UI: rows render instantly from local clustering; RxCUI (link to `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=<cui>`) appears progressively. State: `Map<key, string|null>` in App, updated as promises settle.

## Step 6 — stretch (only if time)

Expandable row → member trial NCT links; alias-source tooltip; wire the M4 openFDA badge using §4 fallback chain (generic_name → brand_name → 404 = Investigational).

## Deliberate non-goals (say them out loud, cite measurements)

- No transitive union-find — fused 174 distinct drugs in testing (§2.1).
- No fuzzy matching — a correct typo-fix scores inside the garbage band; research codes fuzzy-match to WRONG drugs (§3.2).
- No salt-form unification (Afatinib vs Afatinib Dimaleate stay separate rows) and no full-corpus RxNorm resolution (call budget, §3.3).
- Research-code rows that never resolve are EXPECTED (14% of names, ~0% RxNorm coverage) — they are real investigational assets, shown as-is.

## Demo verification script (minute-55 walkthrough)

1. `npm test` — canon + cluster goldens green.
2. Search "lung cancer" → toggle Drugs → point at Pembrolizumab row: aliases show MK-3475/Keytruda folded in; trial count > any single raw name.
3. Point at carboplatin/cisplatin as separate rows (over-merge canary held).
4. Point at excluded bucket count (nothing silently dropped).
5. If step 5 shipped: point at an RxCUI link and one "likely investigational" miss (e.g. a research code).
