import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { describeVideoSource, extractVideoInput } from '../../lib/content/video-platform';
import { facebookVideoUrl, resolveFacebookVideoUrl } from '../../lib/content/resolve-facebook-video';
import * as videos from '../../lib/content/video-platform';
import * as locales from '../../lib/locales';
import { fromWallClock } from '../../lib/donations/recurring-schedule';
function isolated(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (...args: never[]) => unknown> };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, Date, Set, Map, URL, Response, Headers, console, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return loaded.exports;
}
test('Facebook iframe stores only a safe player source and legacy Facebook URLs never become YouTube IDs', () => {
  const input = '<iframe src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fminber%2Fvideos%2F123456789%2F&amp;show_text=false" width="560" onload="alert(1)"></iframe>';
  const parsed = describeVideoSource({ url: input });
  assert.equal(parsed.provider, 'facebook'); assert.equal(parsed.youtubeId, null);
  assert.equal(new URL(parsed.embedUrl!).hostname, 'www.facebook.com'); assert.ok(!parsed.sourceUrl.includes('<'));
  assert.equal(describeVideoSource({ youtubeId: 'https://www.facebook.com/share/v/1AsqfoELTb/' }).provider, 'facebook');
  for (const bad of ['<script>alert(1)</script>', '<iframe src="https://evil.example/player"></iframe>', '<iframe src="https://www.facebook.com/plugins/video.php" srcdoc="x"></iframe>', '<iframe src="https://www.youtube.com/embed/P_EiC5RUOpA"></iframe><script>x</script>']) assert.equal(extractVideoInput(bad), '');
});
test('Facebook resolver rejects private URLs and validates each redirect before issuing a request', async () => {
  for (const url of ['http://facebook.com/video.php?v=1','https://127.0.0.1/','https://facebook.com.evil.example/','https://user:secret@facebook.com/','https://facebook.com:8443/']) assert.equal(facebookVideoUrl(url), null);
  const requested: string[] = [];
  const result = await resolveFacebookVideoUrl('https://fb.watch/fixture', async url => { requested.push(String(url)); return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/metadata' } }); });
  assert.equal(result, 'https://fb.watch/fixture'); assert.deepEqual(requested, ['https://fb.watch/fixture']);
  await resolveFacebookVideoUrl('https://127.0.0.1/', async () => { throw new Error('must never fetch'); }); assert.equal(requested.length, 1);
});
test('project achievement publication creates a canonical project video with translated copy inside the caller transaction', async () => {
  let created: Record<string, unknown> | undefined;
  const loaded = isolated('lib/content/project-update-video.ts', { 'node:crypto': { randomUUID: () => 'revision' }, './video-platform': videos, '../locales': locales });
  const publish = loaded.publishProjectUpdateVideo as unknown as (db: unknown, update: unknown, campaignId: string) => Promise<unknown>;
  const db = { video: { create: async (args: { data: Record<string, unknown> }) => { created = args.data; return { id: 'canonical' }; } } };
  const update = { id: 'source', title: 'إنجاز', description: 'وصف الإنجاز', image: null, videoUrl: 'https://www.facebook.com/minber/videos/123456789/', translations: [{ locale: 'en', title: 'Achievement', description: 'Full description' }] };
  await publish(db, update, 'project'); assert.equal(created!.sourceUpdateId, 'source'); assert.equal(created!.description, update.description); assert.deepEqual(Array.from(created!.campaignIds as string[]), ['project']); assert.equal(created!.youtubeId, null);
  assert.equal(((created!.translations as {create:{description:string}[]}).create[0]).description, 'Full description');
  created = undefined; assert.equal(await publish(db, { ...update, videoUrl: null }, 'project'), null); assert.equal(created, undefined);
});
test('contact and concierge endpoints reject unauthenticated submission before parsing or writing', async () => {
  for (const file of ['app/api/messages/route.ts', 'app/api/ai/donation-concierge/support/route.ts']) {
    const denied = { json: (body: unknown, init: {status:number}) => ({ body, status: init.status }) };
    let writes = 0, parsed = false;
    const noop = new Proxy({}, { get: () => () => undefined });
    const deps = { 'next/server': { NextResponse: denied }, 'next-auth': { getServerSession: async () => null }, '../auth/[...nextauth]/options': { authOptions: {} }, '@/app/api/auth/[...nextauth]/options': { authOptions: {} }, '@/lib/prisma': { prisma: { message: { create: async () => { writes++; } } } }, '@/lib/locales': locales, '@/lib/audit-log': noop, '@/lib/messages/subjects': { isMessageSubject: () => true }, '@/lib/ai/concierge/events': noop, '@/lib/ai/concierge/rate-limit': noop, zod: { z } };
    const loaded = isolated(file, deps); const post = loaded.POST as unknown as (req: unknown) => Promise<{status:number}>;
    const response = await post({ json: async () => { parsed = true; return {}; } });
    assert.equal(response.status, 401, file); assert.equal(writes, 0); assert.equal(parsed, false);
  }
});
test('Google revenue uses the exact account calendar period across a daylight-saving transition', () => {
  const loaded = isolated('lib/marketing/google-search/revenue.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/donations/recurring-schedule': { fromWallClock } });
  const window = (loaded.searchReportWindow as unknown as (p: unknown, z: string) => {since:Date;until:Date})({startDate:'2026-10-24',endDate:'2026-10-25'}, 'Europe/Berlin');
  assert.equal(window.since.toISOString(), '2026-10-23T22:00:00.000Z'); assert.equal(window.until.toISOString(), '2026-10-25T23:00:00.000Z');
});
