// Real read handler, synthetic database/auth. No live credentials or writes.
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

async function harness() {
  const queries=[], state={bookingError:null,booking:true};
  const rows={
    lead_purchases:[{id:id(1),lead_id:id(2),property_manager_id:id(3),mode:'exclusive',amount_cents:6500,status:'paid',unlocked_at:null,created_at:'2026-11-02T12:00:00Z'},
      {id:id(10),lead_id:id(2),property_manager_id:id(30),mode:'exclusive',amount_cents:99999,status:'paid',created_at:'2026-11-02T12:00:00Z'},
      {id:id(11),lead_id:id(2),property_manager_id:id(3),mode:'exclusive',amount_cents:6500,status:'refunded',created_at:'2026-11-02T12:00:00Z'}],
    leads:[{id:id(2),owner_request_id:id(4),property_id:id(5),title:'Appartamento a Milano'}],
    properties:[{id:id(5),city:'Milano',bedrooms:2,bathrooms:1,requested_services:['Gestione']}],
    owner_contacts:[{owner_request_id:id(4),first_name:'Owner',last_name:'Test',email:'owner@example.invalid',phone:'3330000000',precise_address:'Via Test'}],
    marketplace_booking_calls:[{id:id(6),lead_purchase_id:id(1),property_manager_id:id(3),status:'to_schedule',scheduled_at:null,lead_amount_cents:5000,booking_fee_cents:1500}],
  };
  const db={from(table){const query={table,filters:[]};queries.push(query);return {
    select(){return this;},eq(key,value){query.filters.push([key,value]);return this;},in(key,value){query.filters.push([key,value]);return this;},order(){return this;},
    then(ok,fail){const error=table==='marketplace_booking_calls'?state.bookingError:null;const data=(table==='marketplace_booking_calls'&&!state.booking?[]:rows[table]).filter(row=>query.filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));return Promise.resolve({data:error?null:data,error}).then(ok,fail);},
  };}};
  const context=createContext({});const modules=new Map();
  async function load(file){
    const path=resolve(root,file);if(modules.has(path))return modules.get(path);
    const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod=new SourceTextModule(code,{context,identifier:path});modules.set(path,mod);
    await mod.link(async name=>{
      const mock={'next/server':{NextResponse},zod:{z},'@/lib/api/property-manager-auth':{
        requirePropertyManager:async request=>{if(request.headers.get('authorization')!=='Bearer pm')throw {status:401};return {supabase:db,propertyManager:{id:id(3)}};},
        propertyManagerApiErrorResponse:error=>NextResponse.json({error:'Non disponibile'},{status:error.status??500}),
      }}[name];
      if(mock){const dep=new SyntheticModule(Object.keys(mock),function(){for(const [key,value]of Object.entries(mock))this.setExport(key,value);},{context});await dep.link(()=>{});return dep;}
      if(name.startsWith('@/'))return load(`src/${name.slice(2)}.ts`);
      if(name.startsWith('.'))return load(resolve(dirname(path),`${name}.ts`));
      throw Error(`Unexpected import ${name}`);
    });return mod;
  }
  const route=await load('src/app/api/purchases/my-leads/route.ts');await route.evaluate();
  return {queries,state,get:(query='',token='pm')=>route.namespace.GET(new NextRequest(`https://example.invalid/api/purchases/my-leads?${query}`,{headers:token?{authorization:`Bearer ${token}`}:{}}))};
}
test('PM receives only owned paid purchases and a minimal booking notice; contacts stay visible',async()=>{
  const h=await harness();const response=await h.get(`propertyManagerId=${id(30)}`);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const {purchases}=await response.json();assert.equal(purchases.length,1);assert.equal(purchases[0].purchaseId,id(1));assert.equal(purchases[0].ownerContact.phone,'3330000000');
  assert.equal(purchases[0].bookingCall.bookingFeeCents,1500);assert.equal('qualifyingMemberId'in purchases[0].bookingCall,false);
  const bookingQuery=h.queries.find(q=>q.table==='marketplace_booking_calls');assert.deepEqual(JSON.parse(JSON.stringify(bookingQuery.filters)),[['property_manager_id',id(3)],['lead_purchase_id',[id(1)]]]);
});
test('ordinary purchases and pre-foundation installations keep their old details',async()=>{
  const h=await harness();h.state.booking=false;const ordinary=await(await h.get()).json();assert.equal(ordinary.purchases[0].bookingCall,null);assert.equal(ordinary.purchases[0].ownerContact.email,'owner@example.invalid');
  h.state.bookingError={code:'42P01'};assert.equal((await h.get()).status,200);
});
test('booking outages fail visibly instead of telling the PM to directly call an owner awaiting booking',async()=>{
  const h=await harness();h.state.bookingError={code:'57014'};assert.equal((await h.get()).status,500);
});
test('invalid lead ID and missing login perform no database reads',async()=>{
  const h=await harness();assert.equal((await h.get('',null)).status,401);assert.equal((await h.get('leadId=invalid')).status,200);assert.equal(h.queries.length,0);
});
