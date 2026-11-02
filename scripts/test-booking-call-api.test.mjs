// Actual handlers in an isolated VM. No network, credentials, purchases or emails.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';

const root=resolve(import.meta.dirname,'..');
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const command={leadId:id(1),requestId:id(2),expectedLeadAmountCents:5000,expectedBookingFeeCents:1500,termsAccepted:true,termsVersion:'current-test'};
const task={id:id(2),leadId:id(1),ownerRequestId:id(3),purchaseId:id(4),propertyManagerId:id(5),qualifyingMemberId:id(6),assignedMemberId:id(6),status:'to_schedule',scheduledAt:null,createdAt:'2026-11-02T10:00:00Z',leadAmountCents:5000,bookingFeeCents:1500,totalAmountCents:6500,compensationCents:300,needsAttribution:false,leadTitle:'Test lead',city:'Milano',owner:{firstName:'Owner',lastName:null,email:'owner@example.invalid',phone:'3330000000',address:null},buyer:{profileId:id(7),firstName:'Buyer',lastName:null,email:'buyer@example.invalid',phone:null,companyName:null},coordinatorName:'Qualifier'};

async function harness() {
  const calls=[],after=[],workers=[],queries=[];
  const state={rpcError:null,workflowReady:true,task,cacheFails:false,retry:true,eventType:'marketplace_booking_call',eventBookingId:id(2),matchingEvent:true,cronSecret:'configured'};
  const supabase={
    from(table){const query={table,filters:[]};queries.push(query);return {
      select(){return this;},eq(key,value){query.filters.push([key,value]);return this;},
      async maybeSingle(){return {error:null,data:table==='team_compensation_events'?{event_type:state.eventType,source_event_key:'marketplace_booking_call_refund:test',metadata:{booking_call_id:state.eventBookingId}}:{compensation_event_id:state.matchingEvent?id(10):id(99),reversal_event_id:id(11)}};},
    };},
    async rpc(name,args){
      calls.push({name,args});
      if(name==='get_marketplace_booking_call_readiness_v3')return {data:{schemaVersion:3,engineReady:true,workflowReady:state.workflowReady,enabled:false,feeCents:1500,compensationCents:300,currency:'EUR'},error:null};
      if(state.rpcError)return {data:null,error:state.rpcError};
      if(name==='purchase_exclusive_lead_with_booking_call')return {data:{bookingCallId:args.p_request_id,purchaseId:id(4),leadId:args.p_lead_id,leadAmountCents:args.p_expected_lead_amount_cents,bookingFeeCents:args.p_expected_booking_fee_cents,amountCents:6500,balanceCents:3500,compensationCents:300,qualifyingMemberId:id(6),replayed:false},error:null};
      if(name==='get_booking_call_task'||name==='update_booking_call_task')return {data:state.task,error:null};
      if(name==='retry_booking_call_email')return {data:state.retry,error:null};
      if(name==='attribute_booking_call_compensation'||name==='assign_pending_team_compensation_event')return {data:{ok:true},error:null};
      throw Error(`Unexpected RPC ${name}`);
    },
  };
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  async function authenticate(request,kind,access){
    const token=request.headers.get('authorization');
    if(!token)throw new ApiError(401,'Login necessario');
    if((kind==='pm'&&token!=='Bearer pm')||(kind==='admin'&&token!=='Bearer admin')||(kind==='team'&&(token==='Bearer pm'||(access==='write'&&token==='Bearer read'))))throw new ApiError(403,'Non autorizzato');
    return {supabase,profile:{id:id(7)},propertyManager:{id:id(5)}};
  }
  const context=createContext({console}); const modules=new Map();
  const errorResponse=error=>NextResponse.json({error:error.message},{status:error.status??500});
  async function load(path){
    path=resolve(root,path);if(modules.has(path))return modules.get(path);
    const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod=new SourceTextModule(code,{context,identifier:path});modules.set(path,mod);
    await mod.link(async name=>{
      const mock={
        'next/server':{NextResponse,after:callback=>after.push(callback)},zod:{z},
        'next/cache':{revalidateTag:()=>{if(state.cacheFails)throw Error('cache offline');}},
        '@/lib/api/property-manager-auth':{requirePropertyManager:request=>authenticate(request,'pm'),propertyManagerApiErrorResponse:errorResponse},
        '@/lib/admin/auth':{AdminApiError:ApiError,adminApiErrorResponse:errorResponse,requireSuperAdmin:request=>authenticate(request,'admin'),requireAdminPermission:(request,permission,access)=>{assert.equal(permission,'leads');return authenticate(request,'team',access);}},
        '@/lib/booking-call/email-worker':{runBookingCallEmailWorkerSafely:async(...args)=>workers.push(args)},
        '@/lib/team-compensation/marketplace-promotion-worker':{runMarketplacePromotionWorkerSafely:async()=>{}},
        '@/lib/brevo/worker':{runBrevoWorkerSafely:async()=>{}},
        '@/lib/env':{getEnv:()=>state.cronSecret},
        '@/lib/email/service-campaigns':{processServiceEmailQueue:async()=>({processed:0})},
        '@/lib/team-compensation/worker':{runTeamCompensationWorkerSafely:async()=>({processed:0}),reconcileTeamRefundCompensationsSafely:async()=>({processed:0})},
        '@/lib/cache/tags':{MARKETPLACE_LEADS_CACHE_TAG:'test-leads'},
        '@/lib/legal/terms':{CURRENT_TERMS_VERSION:'current-test'},
      }[name];
      if(mock){const dependency=new SyntheticModule(Object.keys(mock),function(){for(const [key,value]of Object.entries(mock))this.setExport(key,value);},{context});await dependency.link(()=>{throw Error('nested mock import');});return dependency;}
      if(name.startsWith('@/'))return load(`src/${name.slice(2)}.ts`);
      if(name.startsWith('.'))return load(resolve(dirname(path),`${name}.ts`));
      throw Error(`Unexpected import ${name}`);
    });return mod;
  }
  const purchase=await load('src/app/api/purchases/booking-call/route.ts');await purchase.evaluate();
  const booking=await load('src/app/api/admin/booking-calls/route.ts');await booking.evaluate();
  const compensation=await load('src/app/api/admin/team/compensations/route.ts');await compensation.evaluate();
  const cron=await load('src/app/api/cron/service-emails/route.ts');await cron.evaluate();
  const request=(path,token,method='GET',body)=>new NextRequest(`https://example.invalid${path}`,{method,headers:token?{authorization:`Bearer ${token}`,'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  return {state,calls,workers,after,queries,purchase:(body=command,token='pm')=>purchase.namespace.POST(request('/api/purchases/booking-call',token,'POST',body)),
    get:(token='member',query=`id=${id(2)}`)=>booking.namespace.GET(request(`/api/admin/booking-calls?${query}`,token)),
    update:(body,token='member')=>booking.namespace.PATCH(request('/api/admin/booking-calls',token,'PATCH',body)),
    retry:(token='member')=>booking.namespace.POST(request('/api/admin/booking-calls',token,'POST',{id:id(2)})),
    attribute:(token='admin')=>compensation.namespace.PATCH(request('/api/admin/team/compensations',token,'PATCH',{eventId:id(10),memberId:id(6)})),
    cron:(token='configured')=>cron.namespace.GET(request('/api/cron/service-emails',token))};
}

test('buyer identity comes from server session; strict request rejects spoofed buyer and invalid total',async()=>{
  const h=await harness();
  assert.equal((await h.purchase({...command,propertyManagerId:id(99)})).status,422);
  assert.equal((await h.purchase({...command,expectedLeadAmountCents:2147483647})).status,422);
  assert.equal((await h.purchase({...command,termsVersion:'old'})).status,409);assert.equal(h.calls.length,0);
  const response=await h.purchase();assert.equal(response.status,200);
  const commandCall=h.calls.find(call=>call.name==='purchase_exclusive_lead_with_booking_call');
  assert.equal(commandCall.args.p_profile_id,id(7));assert.equal(commandCall.args.p_property_manager_id,id(5));assert.equal(commandCall.args.p_request_id,id(2));
  assert.equal(h.after.length,1);assert.equal(h.workers.length,0);await h.after[0]();assert.deepEqual(h.workers,[[1,id(2)]]);
});
test('missing workflow cannot initiate payment; enabling flag is not necessary for a valid replay',async()=>{
  const h=await harness();h.state.workflowReady=false;assert.equal((await h.purchase()).status,409);
  assert.equal(h.calls.some(call=>call.name==='purchase_exclusive_lead_with_booking_call'),false);
});
test('auth is enforced before booking task or purchase data access',async()=>{
  const h=await harness();assert.equal((await h.purchase(command,null)).status,401);assert.equal((await h.purchase(command,'member')).status,403);
  assert.equal((await h.get('pm')).status,403);assert.equal((await h.get(null)).status,401);
  assert.equal((await h.update({id:id(2),status:'in_progress'},'read')).status,403);assert.equal(h.calls.length,0);
});
test('business errors map safely and malformed provider details never crash classification',async()=>{
  for(const [message,detail,status]of [['price_changed','null',409],['insufficient_credit','{"missing_amount_cents":1500}',402],['already_purchased','bad',409],['booking_call_disabled','{}',409]]){
    const h=await harness();h.state.rpcError={code:'P0001',message,details:detail};const response=await h.purchase();assert.equal(response.status,status);assert.equal(h.after.length,0);
  }
  const h=await harness();h.state.rpcError={code:'PGRST000',message:'timeout'};const response=await h.purchase();assert.equal(response.status,503);assert.equal((await response.json()).code,'BOOKING_PURCHASE_UNCONFIRMED');
});
test('successful wallet purchase is not turned into a failure by cache invalidation',async()=>{
  const h=await harness();h.state.cacheFails=true;assert.equal((await h.purchase()).status,200);assert.equal(h.after.length,1);
});
test('task routes bind actor and delegate record authorization to guarded RPC; missing migrations stay dormant',async()=>{
  const h=await harness();const response=await h.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.calls[0].args.p_actor_profile_id,id(7));
  assert.equal((await h.get('member',`id=${id(2)}&leadId=${id(1)}`)).status,400);
  assert.equal((await h.update({id:id(2),status:'scheduled'})).status,422);
  assert.equal((await h.update({id:id(2),status:'in_progress',actorProfileId:id(99)})).status,200);
  assert.equal(h.calls.at(-1).args.p_actor_profile_id,id(7));
  h.state.rpcError={code:'42501',message:'not authorized'};assert.equal((await h.update({id:id(2),status:'in_progress'})).status,403);
  h.state.rpcError={code:'PGRST202'};const missing=await h.get();assert.equal((await missing.json()).storageReady,false);
});
test('manual retry starts a worker only when the lease is available',async()=>{
  const h=await harness();h.state.retry=false;assert.equal((await h.retry()).status,200);assert.equal(h.after.length,0);
  h.state.retry=true;assert.equal((await h.retry()).status,200);await h.after[0]();assert.deepEqual(h.workers,[[1,id(2)]]);
});
test('booking attribution uses paired booking command and validates actual event membership',async()=>{
  const h=await harness();assert.equal((await h.attribute('member')).status,403);assert.equal(h.queries.length,0);
  assert.equal((await h.attribute()).status,200);assert.equal(h.calls.at(-1).name,'attribute_booking_call_compensation');assert.equal(h.calls.at(-1).args.p_actor_profile_id,id(7));
  h.state.matchingEvent=false;assert.equal((await h.attribute()).status,409);assert.equal(h.calls.length,1);
  h.state.eventType='lead_verification';assert.equal((await h.attribute()).status,200);assert.equal(h.calls.at(-1).name,'assign_pending_team_compensation_event');
});
test('daily cron requires configured authentication for new booking recovery',async()=>{
  const h=await harness();assert.equal((await h.cron(null)).status,401);assert.equal(h.workers.length,0);
  assert.equal((await h.cron()).status,200);assert.deepEqual(h.workers,[[1]]);
  h.state.cronSecret=undefined;assert.equal((await h.cron(null)).status,200);assert.equal(h.workers.length,1);
});
