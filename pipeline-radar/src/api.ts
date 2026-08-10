import { mapStudy, type RawStudy } from './mapStudy';
import type { SearchResult } from './types';
import sampleLungCancer from './samples/lung-cancer.json';

const BASE = 'https://clinicaltrials.gov/api/v2/studies';

// Offline parachute: flip to true to serve the saved sample instead of the live API.
const USE_SAMPLES = false;

const FIELDS = [
  'NCTId',
  'BriefTitle',
  'OverallStatus',
  'Phase',
  'EnrollmentCount',
  'LeadSponsorName',
  'InterventionType',
  'InterventionName',
  'InterventionOtherName',
].join(',');

interface RawResponse {
  studies?: RawStudy[];
  totalCount?: number;
  nextPageToken?: string;
}

export async function fetchTrials(disease: string, pageToken?: string): Promise<SearchResult> {
  let data: RawResponse;

  if (USE_SAMPLES) {
    data = sampleLungCancer as RawResponse;
  } else {
    const params = new URLSearchParams({
      'query.cond': disease,
      'filter.overallStatus': 'RECRUITING,ACTIVE_NOT_RECRUITING',
      pageSize: '100',
      countTotal: 'true',
      fields: FIELDS,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${BASE}?${params}`);
    if (!res.ok) throw new Error(`ClinicalTrials.gov returned ${res.status}`);
    data = await res.json();
  }

  return {
    trials: (data.studies ?? []).map(mapStudy),
    total: data.totalCount ?? 0,
    nextPageToken: data.nextPageToken,
  };
}
