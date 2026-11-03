import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGa4DashboardReport } from '../../lib/marketing/ga4-reporting';

test('GA4 requests actual titles without splitting or adding path-only user/session totals', async () => {
  const report = await fetchGa4DashboardReport({ propertyId: '123456', accessToken: 'fixture', range: '28d', fetchImpl: async (_url, init) => {
    const { requests } = JSON.parse(String(init?.body)) as { requests: Array<{ dimensions?: Array<{ name: string }> }> };
    return new Response(JSON.stringify({ reports: requests.map(request => {
      const dims = request.dimensions?.map(value => value.name).join(',');
      if (dims === 'pagePath') return { rows: [{ dimensionValues: [{ value: '/ar/zakat' }], metricValues: [{ value: '100' }, { value: '40' }, { value: '60' }] }] };
      if (dims === 'pagePath,pageTitle') return { rows: [
        { dimensionValues: [{ value: '/ar/zakat' }, { value: '(not set)' }], metricValues: [{ value: '300' }] },
        { dimensionValues: [{ value: '/ar/zakat' }, { value: 'عنوان قديم' }], metricValues: [{ value: '30' }] },
        { dimensionValues: [{ value: '/ar/zakat' }, { value: 'زكاتك لفلسطين' }], metricValues: [{ value: '70' }] },
      ] };
      return {};
    }) }));
  } });
  assert.deepEqual(report.pages, [{ pagePath: '/ar/zakat', pageTitle: 'زكاتك لفلسطين', screenPageViews: 100, activeUsers: 40, sessions: 60 }]);
});

test('missing GA4 title evidence stays empty rather than inventing a site title', async () => {
  const report = await fetchGa4DashboardReport({ propertyId: '123456', accessToken: 'fixture', range: '7d', fetchImpl: async (_url, init) => {
    const { requests } = JSON.parse(String(init?.body)) as { requests: Array<{ dimensions?: Array<{ name: string }> }> };
    return new Response(JSON.stringify({ reports: requests.map(request => request.dimensions?.map(value => value.name).join(',') === 'pagePath' ? { rows: [{ dimensionValues: [{ value: '/unknown' }], metricValues: [{ value: '5' }, { value: '3' }, { value: '4' }] }] } : {}) }));
  } });
  assert.equal(report.pages[0].pageTitle, '');
  assert.equal(report.pages[0].sessions, 4);
});
