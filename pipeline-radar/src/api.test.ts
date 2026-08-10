import { fetchTrials } from './api';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok, status, json: async () => body } as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('fetchTrials', () => {
  it('builds the documented query URL', async () => {
    const spy = mockFetchOnce({ studies: [], totalCount: 0 });
    await fetchTrials('lung cancer');

    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://clinicaltrials.gov/api/v2/studies');
    expect(url.searchParams.get('query.cond')).toBe('lung cancer');
    expect(url.searchParams.get('filter.overallStatus')).toBe('RECRUITING,ACTIVE_NOT_RECRUITING');
    expect(url.searchParams.get('pageSize')).toBe('100');
    expect(url.searchParams.get('countTotal')).toBe('true');
    expect(url.searchParams.get('fields')).toContain('InterventionOtherName');
    expect(url.searchParams.get('pageToken')).toBeNull();
  });

  it('passes pageToken through for pagination', async () => {
    const spy = mockFetchOnce({ studies: [], totalCount: 0 });
    await fetchTrials('lung cancer', 'abc123');

    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.searchParams.get('pageToken')).toBe('abc123');
  });

  it('maps studies and surfaces total + nextPageToken', async () => {
    mockFetchOnce({
      studies: [{ protocolSection: { identificationModule: { nctId: 'NCT00000001' } } }],
      totalCount: 42,
      nextPageToken: 'tok',
    });

    const result = await fetchTrials('als');
    expect(result.total).toBe(42);
    expect(result.nextPageToken).toBe('tok');
    expect(result.trials).toHaveLength(1);
    expect(result.trials[0].nctId).toBe('NCT00000001');
  });

  it('returns empty results without crashing when the API omits fields', async () => {
    mockFetchOnce({});
    const result = await fetchTrials('asdfgh');
    expect(result).toEqual({ trials: [], total: 0, nextPageToken: undefined });
  });

  it('throws a readable error on a non-OK response', async () => {
    mockFetchOnce({}, false, 500);
    await expect(fetchTrials('lung cancer')).rejects.toThrow('ClinicalTrials.gov returned 500');
  });
});
