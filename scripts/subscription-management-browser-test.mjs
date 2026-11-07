import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const require = createRequire(import.meta.url);
const { subscriptionReductionEligibility } = require('../lib/donations/subscription-reduction-policy.ts');
const donorA = 'b'.repeat(24), donorB = 'e'.repeat(24), planA = 'a'.repeat(24), planB = 'd'.repeat(24), requestA = 'c'.repeat(24), requestB = 'f'.repeat(24), failedPlan = '1'.repeat(24);
const catalogs = { en: require('../lib/dashboard/i18n/catalog/en.json'), tr: require('../lib/dashboard/i18n/catalog/tr.json') };
const label = (lang, text) => lang === 'ar' ? text : catalogs[lang][text] || text;
const output = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || '.artifacts/subscription-management');
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import Monthly from './app/(dashboard)/dashboard/monthly/page';import Requests from './app/(dashboard)/dashboard/subscription-requests/page';import{usePathname}from'next/navigation';import {setDashLocale} from './lib/dashboard/i18n';const lang=new URLSearchParams(location.search).get('lang')||'ar';setDashLocale(lang);function App(){const pathname=usePathname();return pathname==='/dashboard/subscription-requests'?<Requests/>:<Monthly/>}createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={lang} messages={window.fixtureMessages} timeZone='Europe/Istanbul'><App/></NextIntlClientProvider>);`;
const navigation = `import React,{useMemo,useState,useEffect} from 'react';export function useSearchParams(){const [search,setSearch]=useState(location.search);useEffect(()=>{const update=()=>setSearch(location.search);window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update)},[]);return useMemo(()=>new URLSearchParams(search),[search])}export function useRouter(){return {push:window.fixtureNavigate,replace:window.fixtureNavigate,refresh:()=>{}}}export function usePathname(){const [pathname,setPathname]=useState(location.pathname);useEffect(()=>{const update=()=>setPathname(location.pathname);window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update)},[]);return pathname}export function useParams(){return {locale:new URLSearchParams(location.search).get('lang')||'ar'}}`;
const mocks = {
  'next/navigation': navigation,
  'next/link': `import React from 'react';export default function Link({children,onClick,scroll,prefetch,...props}){return <a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey){event.preventDefault();window.fixtureNavigate(props.href)}}}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({src,alt}){return <img src={typeof src==='string'?src:src?.src} alt={alt}/>}`,
  'next-auth/react': `export function useSession(){return {data:{user:{id:'fixture-admin',role:'ADMIN'}},status:'authenticated'}}`,
  '@/context/CurrencyContext': `const currency={getSelectedCurrency:()=> 'DEFAULT',convertToCurrency:value=>({convertedValue:value,currency:'USD'}),convertToUSD:value=>value};export function useCurrency(){return currency}`,
  '@/context/ViewUserProfileContext': `export function useViewUserProfile(){return {openUserProfile:()=>{},openUserProfileCard:()=>{}}}`,
};
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outfile: 'fixture.js', format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'framework-boundaries', setup(builder) { builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : null); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: process.cwd() })); } }] });
const css = (await postcss([tailwindcss({ ...require('../tailwind.config.ts').default, content: [{ raw: await readFile('app/(dashboard)/dashboard/monthly/page.tsx', 'utf8'), extension: 'tsx' }, 'components/dashboard/**/*.tsx', 'components/ui/*.tsx'] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined })).css;
const theme = (await readFile('app/[locale]/globals.css', 'utf8')).match(/:root\s*\{[\s\S]*?\}/)?.[0] || '';
const messages = Object.fromEntries(await Promise.all(['ar', 'en', 'tr'].map(async lang => [lang, JSON.parse(await readFile(`i18n/messages/${lang}.json`, 'utf8'))])));
const requests = [], errors = [];
let plans, tickets, slowDonor = '', omitListRequest = false, proofMode = 'normal', billingMode = 'normal', rejectReduction = false;
function reset() {
  omitListRequest = false; proofMode = 'normal'; billingMode = 'normal'; rejectReduction = false;
  plans = [
    { id: planA, donor: { id: donorA, name: 'Donor Alpha', email: 'alpha@example.test' }, status: 'ACTIVE', amount: 107.87, amountUSD: 118, currency: 'EUR', frequency: 'MONTHLY' },
    { id: failedPlan, donor: { id: donorA, name: 'Donor Alpha', email: 'alpha@example.test' }, status: 'PAYMENT_FAILED', amount: 1, amountUSD: 1, currency: 'USD', frequency: 'DAILY' },
    { id: planB, donor: { id: donorB, name: 'Donor Beta', email: 'beta@example.test' }, status: 'PAUSED', amount: 25, amountUSD: 25, currency: 'USD', frequency: 'MONTHLY' },
  ].map(plan => ({ ...plan, provider: 'ALBARAKA', chargeAttempts:0, billingLeaseUntil:null, amountChangeLock:null, campaigns: [], categories: [], referral: null, createdAt: '2026-10-01T12:00:00Z', lastBillingDate: '2026-10-31T12:00:00Z', nextBillingDate: '2030-12-01T12:00:00Z' }));
  tickets = [
    { id: requestA, donorId: donorA, donorName: 'Donor Alpha', subscriptionId: planA, kind: 'AMOUNT_CHANGE', requestedAmount: 10, currency: 'EUR', note: 'Please reduce my donation to 10 EUR.', staffNote: null, status: 'NEW', createdAt: '2026-10-31T12:00:00Z', updatedAt: '2026-10-31T12:00:00.000Z' },
    { id: requestB, donorId: donorB, donorName: 'Donor Beta', subscriptionId: planB, kind: 'AMOUNT_CHANGE', requestedAmount: 5, currency: 'USD', note: 'Please reduce my donation to 5 USD.', staffNote: null, status: 'NEW', createdAt: '2026-10-31T12:00:00Z', updatedAt: '2026-10-31T12:00:00.000Z' },
  ];
}
reset();
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture');
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
  if (url.pathname.startsWith('/fonts/cairo/')) { res.setHeader('Content-Type', 'font/woff2'); return res.end(await readFile('public' + url.pathname)); }
  if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css + theme); }
  if (url.pathname.startsWith('/api/')) {
    let body = null;
    if (req.method !== 'GET') { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); }
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method, body });
    if (url.pathname === '/api/admin/subscription-requests') {
      if (req.method === 'PATCH') {
        const ticket = tickets.find(row => row.id === body.id);
        if (body.status === 'COMPLETED' && plans.find(plan => plan.id === ticket.subscriptionId).amount !== ticket.requestedAmount) return json({ error: 'Change the subscription first' }, 409);
        assert.equal(body.updatedAt,ticket.updatedAt); ticket.status = body.status; ticket.staffNote = body.staffNote; ticket.updatedAt=new Date().toISOString(); return json({ ok: true, billingChanged: false, updatedAt: ticket.updatedAt });
      }
      if (url.searchParams.get('kind') === 'AMOUNT_CHANGE') {
        if (proofMode === 'error') return json({error:'proof fixture unavailable'},503);
        if (proofMode === 'empty') return json({requests:[],openCount:0});
        if (proofMode === 'foreign') return json({requests:[tickets.find(row=>row.id===requestB)],openCount:1});
        if (proofMode === 'closed') return json({requests:[{...tickets.find(row=>row.id===requestA),status:'COMPLETED'}],openCount:1});
      }
      const scope = tickets.filter(row => (!url.searchParams.has('userId') || row.donorId === url.searchParams.get('userId')) && (!url.searchParams.has('subscriptionId') || row.subscriptionId === url.searchParams.get('subscriptionId')));
      const list = scope.filter(row => url.searchParams.has('requestId') ? row.id === url.searchParams.get('requestId') : url.searchParams.get('status') === 'COMPLETED' ? row.status === 'COMPLETED' : row.status !== 'COMPLETED');
      return json({ requests: omitListRequest && !url.searchParams.has('requestId') ? [] : list.map(row=>({...row,canComplete:plans.find(plan=>plan.id===row.subscriptionId)?.amount===row.requestedAmount})), openCount: scope.filter(row => row.status !== 'COMPLETED').length });
    }
    if (url.pathname === '/api/admin/subscriptions') {
      if (billingMode === 'error' && url.searchParams.has('subscriptionId')) return json({error:'private upstream failure'},503);
      const userId = url.searchParams.get('userId'), subscriptionId = url.searchParams.get('subscriptionId');
      const rows = plans.filter(row => (!userId || row.donor.id === userId) && (!subscriptionId || row.id === subscriptionId) && (url.searchParams.get('status') === 'ALL' || row.status === url.searchParams.get('status')));
      await new Promise(resolve => setTimeout(resolve, userId === slowDonor ? 650 : 120));
      return json({ subscriptions: rows.map(row=>({...row,reductionEligibility:subscriptionReductionEligibility({...row,nextBillingDate:row.nextBillingDate?new Date(row.nextBillingDate):null})})), pagination: { total: rows.length, pages: 1 } });
    }
    if (req.method === 'PATCH' && url.pathname === `/api/admin/subscriptions/${planA}`) {
      assert.equal(body.consentRequestId, requestA); assert.equal(body.consentMethod, 'DONOR_REQUEST'); assert.equal(body.amount, 10);
      if (rejectReduction) return json({error:'Billing is due soon, already pending, or under retry. Schedule a reduction after this cycle settles.',code:'BILLING_WINDOW_LOCKED',reductionEligibility:subscriptionReductionEligibility({...plans.find(plan=>plan.id===planA),nextBillingDate:new Date(),chargeAttempts:2})},409);
      plans.find(plan => plan.id === planA).amount = 10; plans.find(plan => plan.id === planA).amountUSD = 11; return json({ ok: true, amount: 10, provider: { rail: 'ALBARAKA', confirmed: true } });
    }
    if (url.pathname === '/api/admin/subscriptions/health') return json({ groups: [], providers: {}, complete: true, checkedAt: new Date().toISOString(), lastCheck: null, schedulerState: 'recent' });
    if (url.pathname === '/api/admin/subscriptions/overview/stats') return json({});
    if (url.pathname === '/api/admin/subscriptions/overview/chart') return json([]);
    if (url.pathname === '/api/admin/subscriptions/overview/day-of-month') return json({ collected: [], expected: [] });
    if (url.pathname === '/api/admin/donations/countries') return json({ countries: [], unsetCount: 0 });
    if (url.pathname === '/api/categories' || url.pathname === '/api/campaigns/all') return json({ items: [] });
    if (url.pathname === '/api/donations') return json({ donations: [], pagination: { total: 0, pages: 0 } });
    if (url.pathname.startsWith('/api/users/')) { const id = url.pathname.split('/').at(-1); return json({ user: { id, name: id === donorA ? 'Donor Alpha' : 'Donor Beta', email: 'fixture@example.test' } }); }
    return json({ error: 'Unexpected fixture request: ' + url.pathname }, 404);
  }
  const lang = url.searchParams.get('lang') || 'ar';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang='${lang}' dir='${lang === 'ar' ? 'rtl' : 'ltr'}'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/style.css'><style>@font-face{font-family:Cairo;src:url('/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2');font-weight:200 1000}body{margin:0;font-family:Cairo,Arial,sans-serif;background:#f8fafc}*{box-sizing:border-box}#root{max-width:1440px;margin:auto}</style></head><body><div id='root'></div><script>window.fixtureMessages=${JSON.stringify(messages[lang]).replace(/</g, '\\u003c')};window.fixtureNavigate=href=>{const next=new URL(href,location.origin);next.searchParams.set('lang','${lang}');history.pushState(null,'',next);window.dispatchEvent(new PopStateEvent('popstate'))};</script><script src='/fixture.js'></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let checks = 0, activePage;
try {
  for (const lang of ['ar', 'en', 'tr']) for (const width of [390, 1440]) {
    reset(); slowDonor = ''; const before = requests.length;
    const context = await browser.newContext({ viewport: { width, height: width < 640 ? 700 : 1000 } }); const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.route('https://**/*', route => route.abort());
    await page.goto(`${origin}/dashboard/monthly?lang=${lang}&userId=${donorA}`);
    const section = page.locator('#subscriptions');
    await expect(section).toBeInViewport(); await expect(section.getByRole('row')).toHaveCount(3); checks++;
    assert.ok(requests.slice(before).some(row => row.path === '/api/admin/subscriptions' && row.query.userId === donorA && row.query.status === 'ALL')); checks++;
    // The direct-account method is available from a normal plan row, even
    // without requestId in the URL. Only a fresh scoped request can authorize it.
    const genericPlan=page.locator(`#subscription-${planA}`);
    await genericPlan.getByRole('button',{name:label(lang,'تخفيض مبلغ الاشتراك'),exact:true}).click();
    const genericDialog=page.getByRole('dialog');
    await genericDialog.getByRole('combobox').click();
    await page.getByRole('option',{name:label(lang,'طلب مباشر من حسابه الشخصي'),exact:true}).click();
    await expect(genericDialog.getByRole('spinbutton')).toHaveValue('10');
    await expect(genericDialog.locator('textarea')).toHaveValue(new RegExp(requestA));
    await expect(genericDialog.getByRole('combobox',{name:label(lang,'طلب المتبرع الموثّق'),exact:true})).toHaveValue(requestA);
    assert.ok(requests.slice(before).some(row=>row.path==='/api/admin/subscription-requests'&&row.query.userId===donorA&&row.query.subscriptionId===planA&&row.query.kind==='AMOUNT_CHANGE'));checks++;
    for(const mode of ['empty','foreign','closed','error']){
      proofMode=mode;
      await genericDialog.getByRole('button',{name:label(lang,'تحديث طلبات المتبرع'),exact:true}).click();
      await expect(genericDialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeDisabled();
      await expect(genericDialog.getByRole('spinbutton')).toHaveValue('');
      await expect(genericDialog.locator('textarea')).toHaveValue('');
      await expect(genericDialog.getByText(label(lang,mode==='error'?'تعذّر تحميل طلبات المتبرع. أعد المحاولة.':'لا يوجد طلب تغيير مبلغ مفتوح وصالح لهذا الاشتراك من حساب المتبرع.'),{exact:true})).toBeVisible();checks++;
    }
    proofMode='normal';await genericDialog.getByRole('button',{name:label(lang,'تحديث طلبات المتبرع'),exact:true}).click();
    await expect(genericDialog.getByRole('spinbutton')).toHaveValue('10');await expect(genericDialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeEnabled();checks++;
    await genericDialog.getByRole('combobox').first().click();await page.getByRole('option',{name:label(lang,'مكالمة هاتفية'),exact:true}).click();
    await expect(genericDialog.locator('textarea')).toHaveValue('');await expect(genericDialog.locator('textarea')).not.toHaveAttribute('readonly','');checks++;
    assert.equal(requests.slice(before).filter(row=>row.method!=='GET').length,0);
    await page.keyboard.press('Escape');await expect(genericDialog).toBeHidden();
    // The table may be stale: opening the dialog must read server eligibility.
    const currentPlan=plans.find(plan=>plan.id===planA), baseline={...currentPlan};
    for(const [patch,message] of [
      [{chargeAttempts:2,lastChargeError:'Onaylanmadi'},'توجد محاولات تحصيل غير ناجحة لهذه الدورة. راجع آخر سبب لتعذّر الخصم، ثم حدّث الحالة بعد تسوية الدورة. يبقى طلب المتبرع محفوظًا دون تنفيذ.'],
      [{nextBillingDate:new Date(Date.now()+3600_000).toISOString()},'موعد التحصيل قريب أو مستحق خلال 24 ساعة. حدّث الحالة بعد تسوية هذه الدورة؛ يبقى طلب المتبرع محفوظًا دون تنفيذ.'],
      [{nextBillingDate:null},'موعد التحصيل غير محدد أو غير صالح. راجع جدولة الاشتراك قبل التخفيض؛ لم يُنفّذ التخفيض.'],
      [{billingLeaseUntil:new Date(Date.now()+60_000)},'تجري معالجة تحصيل لهذا الاشتراك. انتظر ظهور نتيجته ثم حدّث الحالة؛ لم يُنفّذ التخفيض.'],
      [{amountChangeLock:'fixture-private-lock'},'يوجد تغيير يحتاج مطابقة مع مزوّد الدفع. راجع نتيجته قبل أي محاولة جديدة؛ لا تُكرر التخفيض قبل التحقق.'],
    ]) {
      Object.assign(currentPlan,baseline,patch);
      await genericPlan.getByRole('button',{name:label(lang,'تخفيض مبلغ الاشتراك'),exact:true}).click();
      await expect(genericDialog.getByRole('alert')).toContainText(label(lang,message));
      await expect(genericDialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeDisabled();
      assert.equal(currentPlan.amount,107.87);assert.equal(tickets.find(row=>row.id===requestA).status,'NEW');checks++;
      await page.keyboard.press('Escape');await expect(genericDialog).toBeHidden();
    }
    Object.assign(currentPlan,baseline);billingMode='error';
    await genericPlan.getByRole('button',{name:label(lang,'تخفيض مبلغ الاشتراك'),exact:true}).click();
    await expect(genericDialog.getByRole('alert')).toContainText(label(lang,'تعذّر فحص حالة التحصيل. حدّث الحالة قبل تأكيد التخفيض.'));
    await expect(genericDialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeDisabled();checks++;
    billingMode='normal';await genericDialog.getByRole('button',{name:label(lang,'تحديث حالة الاشتراك'),exact:true}).click();
    await expect(genericDialog.getByRole('alert')).toHaveCount(0);checks++;
    await page.keyboard.press('Escape');await expect(genericDialog).toBeHidden();
    assert.equal(requests.slice(before).filter(row=>row.method!=='GET').length,0);
    await page.getByRole('link',{name:label(lang,'طلبات إدارة التبرع')+' ←',exact:true}).click();
    const ticket = page.locator(`#subscription-request-${requestA}`);
    await expect(ticket).toBeVisible();
    const open = ticket.getByRole('link', { name: label(lang, 'فتح اشتراكات المتبرع'), exact: true });
    await open.click();
    const selected = page.locator(`#subscription-${planA}`);
    await expect(selected).toBeInViewport(); await expect(section.getByRole('row')).toHaveCount(2); assert.equal(new URL(page.url()).searchParams.get('requestId'), requestA); checks++;
    await section.getByRole('link',{name:label(lang,'فتح طلب المتبرع'),exact:true}).click();await expect(ticket).toBeVisible();await open.click(); await expect(selected).toBeInViewport(); checks++;
    await selected.getByRole('button', { name: label(lang, 'تخفيض مبلغ الاشتراك'), exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('spinbutton')).toHaveValue('10'); await expect(dialog.getByRole('spinbutton')).toHaveAttribute('readonly', ''); await expect(dialog).toContainText(label(lang, 'طلب مباشر من حسابه الشخصي')); await expect(dialog.locator('textarea')).toHaveValue(new RegExp(requestA));const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=page.viewportSize().height+1);checks++; await page.screenshot({path:path.join(output,`${lang}-${width}-request-reduction.png`),animations:'disabled'});checks++;
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden(); assert.equal(requests.slice(before).filter(row => row.method !== 'GET').length, 0); checks++;
    await selected.getByRole('button', { name: label(lang, 'تخفيض مبلغ الاشتراك'), exact: true }).click();
    rejectReduction=true;
    await dialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText(label(lang,'توجد محاولات تحصيل غير ناجحة لهذه الدورة. راجع آخر سبب لتعذّر الخصم، ثم حدّث الحالة بعد تسوية الدورة. يبقى طلب المتبرع محفوظًا دون تنفيذ.'));
    await expect(dialog).not.toContainText('Billing is due soon');await expect(dialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeDisabled();
    await expect(dialog.getByRole('spinbutton')).toHaveValue('10');await expect(dialog.locator('textarea')).toHaveValue(new RegExp(requestA));assert.equal(currentPlan.amount,107.87);checks++;
    rejectReduction=false;await dialog.getByRole('button',{name:label(lang,'تحديث حالة الاشتراك'),exact:true}).click();
    await expect(dialog.getByRole('button',{name:label(lang,'تأكيد التخفيض'),exact:true})).toBeEnabled();checks++;
    await dialog.getByRole('button', { name: label(lang, 'تأكيد التخفيض'), exact: true }).click(); await expect(dialog).toBeHidden(); await expect(selected).toContainText('10'); checks++;
    await section.getByRole('link',{name:label(lang,'فتح طلب المتبرع'),exact:true}).click();await expect(ticket).toBeInViewport();checks++;
    await ticket.locator('textarea').first().fill('Reviewed and applied the donor request'); await ticket.getByRole('button', { name: label(lang, 'تأكيد إنجاز الطلب'), exact: true }).click();
    await expect(ticket).toContainText('Reviewed and applied the donor request');await open.click();await expect(page.locator(`#linked-request-${requestA}`)).toContainText(label(lang, 'منفّذ')); checks++;
    await section.getByRole('link', { name: label(lang, 'عرض جميع اشتراكات المتبرع'), exact: true }).click(); await expect(section.getByRole('row')).toHaveCount(3); await expect(section).toBeInViewport(); checks++;
    slowDonor = donorA;
    const pendingAlpha=page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/admin/subscriptions'&&url.searchParams.get('userId')===donorA&&url.searchParams.get('subscriptionId')===planA});
    await page.evaluate(href => window.fixtureNavigate(href), `/dashboard/monthly?userId=${donorA}&subscriptionId=${planA}&requestId=${requestA}#subscriptions`);await pendingAlpha;
    await page.evaluate(href => window.fixtureNavigate(href), `/dashboard/monthly?userId=${donorB}&subscriptionId=${planB}&requestId=${requestB}#subscriptions`);
    await expect(page.locator(`#subscription-${planB}`)).toBeInViewport(); await expect(page.locator(`#subscription-${planA}`)).toHaveCount(0); await page.waitForTimeout(750); await expect(page.locator(`#subscription-${planA}`)).toHaveCount(0); await expect(page.locator('#subscription-requests')).toHaveCount(0);await expect(page.locator(`#linked-request-${requestA}`)).toHaveCount(0); checks++;
    await page.evaluate(href => window.fixtureNavigate(href), `/dashboard/monthly?userId=${donorB}&subscriptionId=${planB}&requestId=${requestA}#subscriptions`);
    await expect(section.getByRole('alert')).toContainText(label(lang,'تعذّر تحميل طلبات إدارة التبرع.'));checks++;
    await page.locator(`#subscription-${planB}`).getByRole('button',{name:label(lang,'تخفيض مبلغ الاشتراك'),exact:true}).click();await expect(dialog.getByRole('spinbutton')).toHaveValue('');await expect(dialog).not.toContainText(label(lang,'طلب مباشر من حسابه الشخصي'));await page.keyboard.press('Escape');await expect(dialog).toBeHidden();checks++;
    await page.evaluate(href => window.fixtureNavigate(href), `/dashboard/monthly?userId=${donorA}&subscriptionId=${failedPlan}#subscriptions`);
    await expect(page.locator(`#subscription-${failedPlan}`)).toBeInViewport(); await expect(page.locator(`#subscription-${failedPlan}`).getByRole('button', { name: label(lang, 'تخفيض مبلغ الاشتراك'), exact: true })).toHaveCount(0); checks++;
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(output, `${lang}-${width}.png`), fullPage: true }); checks++;
    assert.equal(requests.slice(before).filter(row => row.method !== 'GET').length, 3); checks++;
    await context.close();
  }
  reset(); omitListRequest=true;
  const olderContext=await browser.newContext({viewport:{width:1440,height:1000}});const olderPage=await olderContext.newPage();
  await olderPage.goto(`${origin}/dashboard/monthly?userId=${donorA}&subscriptionId=${planA}&requestId=${requestA}#subscriptions`);
  await olderPage.locator('#subscriptions').getByRole('link',{name:'فتح طلب المتبرع',exact:true}).click();
  await expect(olderPage.locator(`#subscription-request-${requestA}`)).toHaveCount(1);await expect(olderPage.locator(`#subscription-request-${requestA}`).getByRole('button',{name:'تأكيد إنجاز الطلب',exact:true})).toBeVisible();checks++;
  await olderContext.close();
  assert.deepEqual(errors, []);
  const report = { checks, errors, scope: 'Real monthly page and separate request workspace with synthetic HTTP and framework routing adapters', productionRequests: 0, bankCalls: 0, recipientMessages: 0 };
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(await activePage.evaluate(() => ({lang:document.documentElement.lang,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollX,offenders:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return (r.left < -2 || r.right > innerWidth+2)&&!el.closest('.overflow-x-auto')}).map(el=>({tag:el.tagName,classes:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).slice(0,15)}))); 
    await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true});
  }
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
