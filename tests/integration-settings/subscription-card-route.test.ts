/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures deliberately supply partial Prisma clients and VM module exports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as bank from '../../lib/albaraka';
import { convertAmountInCurrencyToTry, convertAmountInCurrencyToUsd } from '../../lib/exchange/convert';
type Data=Record<string,any>;
const donor='d'.repeat(24),id='a'.repeat(24),cardId='c'.repeat(24),verificationId='b'.repeat(24);
function fixture() {
 const state:Data={session:{user:{id:donor}},plan:{id,donorId:donor,provider:'ALBARAKA',status:'ACTIVE',amount:10,currency:'EUR',teamSupport:0,coverFees:false,frequency:'MONTHLY',paymentCardId:'e'.repeat(24),nextBillingDate:new Date('2030-12-01')},paid:1,card:{id:cardId,userId:donor,cardNumber:'encrypted-fixture',expiryDate:'12/35',cardholderName:'Fixture Donor'},limited:false,broken:false,stored:[],reads:0};
 const cfg={merchantNo:'merchant',terminalNo:'terminal',posnetId:'posnet',encKey:'fixture',tdsUrl:'https://bank.invalid/3d',serviceUrl:'https://bank.invalid/api',useOOS:false,useJokerVadaa:false};
 const modules:Data={
  'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>new Response(JSON.stringify(body),init)}},'next-auth':{getServerSession:async()=>state.session},'@/app/api/auth/[...nextauth]/options':{authOptions:{}},
  '@/lib/prisma':{prisma:{subscription:{findFirst:async({where}:Data)=>{state.reads++;return state.plan?.id===where.id&&state.plan?.donorId===where.donorId?state.plan:null;}},donation:{count:async()=>state.paid},creditCard:{findFirst:async({where}:Data)=>state.card?.id===where.id&&state.card?.userId===where.userId?state.card:null},subscriptionCardVerification:{create:async({data}:Data)=>{state.stored.push(data);return{id:verificationId};},findFirst:async({where}:Data)=>{if(state.broken)throw Error('db down');return where.donorId===donor&&where.id===verificationId&&where.subscriptionId===id?{status:state.completed?'COMPLETED':'PENDING'}:null;}}}},
  '@/lib/albaraka':{...bank,albarakaConfig:()=>cfg,albarakaRecurringConfig:()=>cfg,isAlbarakaConfigured:()=>true,isAlbarakaRecurringEnabled:()=>true,albarakaChargeCurrency:()=> 'TRY'},
  '@/lib/card-crypto':{decryptCard:()=> '4242424242424242'},'@/lib/payment-public-origin':{paymentPublicOrigin:()=> 'https://minber.test'},'@/lib/locales':{isValidLocale:(value:string)=>['ar','en','tr'].includes(value)},
  '@/lib/exchange/rates-service':{getUsdBaseRatesForServer:async()=>({USD:1,EUR:0.8,TRY:40}),convertAmountInCurrencyToTry,convertAmountInCurrencyToUsd},
  '@/lib/donations/subscription-card-verification':{cardVerificationHash:()=> 'hash-only',cardVerificationToken:()=> 'nonce-only',storedCardDigest:()=> 'digest-only'},'@/lib/ai/concierge/rate-limit':{clientKey:()=> 'fixture',hit:()=>({ok:!state.limited,retryAfterSeconds:60})},
 };
 const mod={exports:{} as Data};runInNewContext(ts.transpileModule(readFileSync('app/api/users/me/subscriptions/[id]/card/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date,URL,Number,console,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 const post=(patch:Data={},origin='https://minber.test')=>mod.exports.POST(new Request('https://minber.test/api/users/me/subscriptions/'+id+'/card',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({cardId,cvc:'123',consent:true,locale:'tr',...patch})}),{params:Promise.resolve({id})});
 const get=()=>mod.exports.GET({nextUrl:new URL('https://minber.test/api?verificationId='+verificationId)},{params:Promise.resolve({id})});
 return{state,cfg,post,get};
}
test('card authorization requires the owner, explicit future-payment authorization and an existing settled plan',async()=>{
 const f=fixture();f.state.session=null;assert.equal((await f.post()).status,401);assert.equal(f.state.reads,0);
 const foreign=fixture();foreign.state.session.user.id='f'.repeat(24);assert.equal((await foreign.post()).status,404);
 for(const patch of [{consent:false},{cvc:'12'},{cardId:'invalid'}]){const x=fixture();assert.equal((await x.post(patch)).status,400);assert.equal(x.state.reads,0);}
 for(const patch of [{provider:'PAYPAL'},{status:'CANCELLED'},{billingLeaseUntil:new Date(Date.now()+60000)},{amountChangeLock:'locked'}]){const x=fixture();Object.assign(x.state.plan,patch);assert.equal((await x.post()).status,409);assert.equal(x.state.stored.length,0);}
 const unpaid=fixture();unpaid.state.paid=0;assert.equal((await unpaid.post()).status,409);
});
test('foreign cards, cross-origin requests, unsafe bank URLs and rate limits cannot create authentication forms',async()=>{
 const foreign=fixture();foreign.state.card.userId='f'.repeat(24);assert.equal((await foreign.post()).status,400);
 const cross=fixture();assert.equal((await cross.post({},'https://other.invalid')).status,403);assert.equal(cross.state.reads,0);
 const url=fixture();url.cfg.tdsUrl='http://bank.invalid/3d';assert.equal((await url.post()).status,503);
 const limited=fixture();limited.state.limited=true;assert.equal((await limited.post()).status,429);assert.equal(limited.state.reads,0);
});
test('initialization returns a signed bank authentication form without charging or retaining CVC/PAN',async()=>{
 const f=fixture(),response=await f.post(),body=await response.json();assert.equal(response.status,200);assert.equal(body.verificationOnly,true);assert.equal(body.paymentCaptures,0);assert.equal(body.fields.MacNew,bank.albarakaFormMac(body.fields,f.cfg.encKey));assert.match(body.fields.MerchantReturnURL,/cardVerificationId=/);assert.match(response.headers.get('cache-control')||'',/no-store/);
 assert.equal(f.state.stored.length,1);assert.equal(f.state.stored[0].amount,10);assert.equal(f.state.stored[0].currency,'EUR');assert.equal(f.state.stored[0].currencyCode,'TL');assert.doesNotMatch(JSON.stringify(f.state.stored),/4242424242424242|"cvc"|"CVC"|"CAVV"/);assert.equal(f.state.stored[0].consentSnapshot.noImmediateCharge,true);
});
test('the result is owner-scoped, uncached and fails visibly on a database outage',async()=>{
 const f=fixture();assert.equal((await(await f.get()).json()).verified,false);f.state.completed=true;assert.equal((await(await f.get()).json()).verified,true);
 f.state.session.user.id='f'.repeat(24);assert.equal((await f.get()).status,404);f.state.session.user.id=donor;f.state.broken=true;const failed=await f.get();assert.equal(failed.status,503);assert.equal((await failed.json()).error,'CARD_VERIFICATION_UNAVAILABLE');
});
