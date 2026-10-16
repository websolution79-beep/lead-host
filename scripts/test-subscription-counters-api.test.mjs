// Actual reporting handlers with isolated in-memory data, never live credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
import {z} from 'zod';
const root=resolve(import.meta.dirname,'..');
const future='2099-11-16T12:00:00Z';
const base={profile_id:'p',addon_product_id:'market',status:'active',source:'stripe',stripe_subscription_id:'sub',cancel_at_period_end:true,trial_ends_at:null,current_period_ends_at:future,access_expires_at:null,updated_at:'2026-10-16T12:00:00Z',created_at:'2026-09-01T00:00:00Z',metadata:{monthly_price_cents:2900}};
async function harness(count=0) {
 const products=[{id:'market',slug:'marketplace',name:'Marketplace'},{id:'prime',slug:'lead-host-prime',name:'PRIME'}];
 const subs=count?Array.from({length:count},(_,i)=>({...base,id:`s${i}`,profile_id:`p${i}`})):[
  {...base,id:'paid',profile_id:'paid'},
  {...base,id:'trial',profile_id:'trial',status:'trialing',trial_ends_at:future},
  {...base,id:'ended',profile_id:'ended',status:'canceled'},
  {...base,id:'prime-live',profile_id:'prime',addon_product_id:'prime'},
  {...base,id:'prime-technical',profile_id:'prime',addon_product_id:'prime',updated_at:future},
  {...base,id:'market-technical',profile_id:'paid',stripe_subscription_id:null,status:'expired',updated_at:future},
 ];
 const profiles=[...new Set(subs.map(s=>s.profile_id))].map(id=>({id,email:`${id}@example.test`,first_name:id,status:'active'}));
 const accounts=count?[]:[{profile_id:'prime',addon_subscription_id:'prime-live',access_source:'stripe',prime_started_at:'2026-09-01',account_manager_member_id:null}];
 const tables={addon_products:products,addon_subscriptions:subs,profiles,prime_accounts:accounts,property_manager_profiles:[],team_members:[],prime_billing_periods:[],owner_requests:[],addon_payments:[]};
 let fail=false;
 const client={from(table){
  assert.ok(table in tables,table);let filters=[],sort=[],range=null;
  return {select(){return this;},in(k,vs){if(table==='profiles')assert.ok(vs.length<=100);filters.push(r=>vs.includes(r[k]));return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},gte(){return this;},lt(){return this;},order(k,o={}){sort.push([k,o.ascending!==false]);return this;},range(a,b){range=[a,b];return this;},then(ok,bad){
   if(fail&&table==='addon_subscriptions')return Promise.resolve({data:null,error:new Error('read failed')}).then(ok,bad);
   let data=tables[table].filter(r=>filters.every(f=>f(r)));
   data.sort((a,b)=>{for(const[k,asc]of sort){let d=String(a[k]).localeCompare(String(b[k]));if(d)return asc?d:-d;}return 0;});
   if(range)data=data.slice(range[0],range[1]+1);else data=data.slice(0,1000);
   return Promise.resolve({data,error:null,count:data.length}).then(ok,bad);
  }};
 },rpc:async()=>({data:{snapshot:{}},error:null})};
 const context=createContext({});const modules=new Map();
 async function load(relative){
  const path=resolve(root,relative);if(modules.has(path))return modules.get(path);
  const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod=new SourceTextModule(code,{context,identifier:path});modules.set(path,mod);
  await mod.link(async name=>{
   if(['@/lib/admin/subscription-reporting','@/lib/marketplace-membership/reporting','@/lib/supabase/batched-query'].includes(name))return load(`src/${name.slice(2)}.ts`);
   const exports={
    'next/server':{NextResponse},zod:{z},
    '@/lib/admin/auth':{requireSuperAdmin:async request=>{if(!request.headers.has('authorization'))throw {status:401};return {supabase:client};},adminApiErrorResponse:e=>NextResponse.json({error:'error'},{status:e.status??500})},
    '@/lib/admin/business-analytics':{resolveAnalyticsRange:()=>({key:'today',fromDate:'2026-10-16',toDateExclusive:'2026-10-17',previousFromDate:'2026-10-15',previousToDate:'2026-10-16'})},
   }[name];assert.ok(exports,name);
   const dep=new SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});await dep.link(()=>{throw new Error('nested mock');});return dep;
  });return mod;
 }
 const listing=await load('src/app/api/admin/subscriptions/route.ts');await listing.evaluate();
 const analytics=await load('src/app/api/admin/analytics/route.ts');await analytics.evaluate();
 const get=(mod,path,auth=true)=>mod.namespace.GET(new NextRequest(`https://example.test${path}`,{headers:auth?{authorization:'Bearer test'}:{}}));
 return {list:(query='',auth=true)=>get(listing,`/api/admin/subscriptions?${query}`,auth),dashboard:(auth=true)=>get(analytics,'/api/admin/analytics',auth),fail:()=>{fail=true;}};
}
test('Dashboard and subscription summaries agree, including renewals-off actives and trials',async()=>{
 const h=await harness();const a=await h.list(),b=await h.dashboard();assert.equal(a.status,200);assert.equal(b.status,200);
 const list=await a.json(),dash=await b.json();
 assert.deepEqual(list.stats.prime,dash.prime.snapshot);assert.deepEqual(list.stats.marketplace,dash.marketplace.snapshot);
 assert.equal(list.stats.prime.active,1);assert.equal(list.stats.marketplace.active,1);assert.equal(list.stats.marketplace.trialing,1);assert.equal(list.stats.marketplace.cancelAtPeriodEnd,2);assert.equal(list.pagination.total,4);
 assert.equal(a.headers.get('cache-control'),'private, no-store');assert.equal(b.headers.get('cache-control'),'private, no-store');
});
test('active/trial filters include scheduled cancellations while renewal-off filter remains available',async()=>{
 const h=await harness();for(const[status,total]of [['active',1],['trialing',1],['cancel_at_period_end',2],['canceled',1]]){
  const r=await h.list(`product=marketplace&status=${status}`);assert.equal(r.status,200);const p=await r.json();assert.equal(p.pagination.total,total,status);
 }
});
test('both reporting APIs read beyond 1000 rows and listing keeps 25-row pagination',async()=>{
 const h=await harness(1203);const a=await(await h.list()).json(),b=await(await h.dashboard()).json();assert.equal(a.stats.marketplace.total,1203);assert.equal(b.marketplace.snapshot.total,1203);assert.equal(a.rows.length,25);assert.equal(a.pagination.total,1203);
});
test('unauthenticated and failed reads cannot return misleading counters',async()=>{
 const h=await harness();assert.equal((await h.list('',false)).status,401);assert.equal((await h.dashboard(false)).status,401);h.fail();assert.equal((await h.list()).status,500);assert.equal((await h.dashboard()).status,500);
});
