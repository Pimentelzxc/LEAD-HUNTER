import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPlacesHandler } from '../backend/lib/handler.js';

const env={SUPABASE_URL:'https://project.example',SUPABASE_PUBLISHABLE_KEY:'public-test-key',ALLOWED_ORIGINS:'http://127.0.0.1:5173'};
const search={action:'search',state:'PR',city:'Fazenda Rio Grande',segment:'Barbearias',neighborhood:''};
const responseData={elements:[{type:'area',id:1,tags:{name:'Fazenda Rio Grande'}},{type:'node',id:123,tags:{name:'Test-only business',shop:'hairdresser',male:'yes'}}]};

function fixture(options={}) {
  const calls={auth:0,quota:0,upstream:0,requests:[]};
  const clientFactory=()=>({
    auth:{async getUser(token){calls.auth++;return {data:{user:options.invalidToken?null:{id:'user1',is_anonymous:false}},error:null};}},
    from(table){return {
      select(){return this;},eq(){return this;},limit(){return this;},
      async single(){return {data:options.noProfile?null:{id:'user1'},error:null};},
      async maybeSingle(){return {data:options.noRecord?null:{id:'lead1'},error:null};},
    };},
    async rpc(name){assert.equal(name,'consume_osm_quota');calls.quota++;return {error:options.quotaError?{message:options.quotaError}:null};},
  });
  const fetcher=async(url,request)=>{
    calls.upstream++;calls.requests.push({url,request});
    if(options.timeout || (options.timeoutOnce && calls.upstream === 1))throw new DOMException('Timeout','TimeoutError');
    if(options.networkError)throw new TypeError('fetch failed');
    if(options.bodyTimeout)return new Response(new ReadableStream({start(controller){controller.error(new DOMException('Timeout','TimeoutError'));}}));
    return new Response(JSON.stringify(options.data||responseData),{status:options.status||200,headers:{'Content-Type':'application/json',...(options.retryAfter?{'Retry-After':options.retryAfter}:{})}});
  };
  return {handler:createPlacesHandler({env,clientFactory,fetcher,...(options.now?{now:options.now}:{})}),calls};
}

async function invoke(handler,{body=search,method='POST',origin=env.ALLOWED_ORIGINS,token='valid-token',raw}={}) {
  const req=Readable.from(raw!==undefined?[raw]:[]);
  req.headers={...(origin?{origin}:{}),...(token?{authorization:`Bearer ${token}`}:{})};
  req.method=method;
  if(raw===undefined)req.body=body;
  const headers={};let payload='';
  const res={statusCode:200,setHeader(key,value){headers[key.toLowerCase()]=value;},end(value){payload=value||'';}};
  await handler(req,res);
  return {status:res.statusCode,headers,body:payload?JSON.parse(payload):null};
}

test('API requires authentication and permitted origin before any provider call',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await invoke(handler,{token:null})).status,401);
  assert.equal((await invoke(handler,{origin:'https://unapproved.example'})).status,403);
  assert.equal((await invoke(handler,{method:'OPTIONS',token:null})).status,204);
  assert.equal((await invoke(handler,{method:'GET',token:null})).status,405);
  assert.equal(calls.auth,0);assert.equal(calls.upstream,0);
});

test('API rejects invalid sessions and unprovisioned users',async()=>{
  for(const [options,status] of [[{invalidToken:true},401],[{noProfile:true},403]]){
    const {handler,calls}=fixture(options);assert.equal((await invoke(handler)).status,status);
    assert.equal(calls.upstream,0);assert.equal(calls.quota,0);
  }
});

test('API validates searches, JSON size and source references before consuming quota',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await invoke(handler,{body:{...search,state:'ZZ'}})).status,400);
  assert.equal((await invoke(handler,{body:{...search,pageToken:'not-supported'}})).status,400);
  assert.equal((await invoke(handler,{raw:'{invalid'})).status,400);
  assert.equal((await invoke(handler,{raw:'x'.repeat(12001)})).status,413);
  assert.equal((await invoke(handler,{body:{action:'details',sourceId:'node:1);out body;'}})).status,400);
  assert.equal(calls.upstream,0);assert.equal(calls.quota,0);
});

test('API surfaces missing migration and quota exhaustion without bypassing limits',async()=>{
  for(const [message,status] of [['function not found',503],['OSM_QUOTA_user:user1_minute',429]]){
    const {handler,calls}=fixture({quotaError:message});const result=await invoke(handler);
    assert.equal(result.status,status);assert.equal(calls.upstream,0);
  }
});

test('API searches only Overpass, preserves attribution, sets CORS and uses cache',async()=>{
  const {handler,calls}=fixture();
  const first=await invoke(handler),second=await invoke(handler);
  assert.equal(first.status,200);assert.equal(first.body.leads.length,1);
  assert.equal(first.body.source,'openstreetmap');
  assert.equal(first.body.leads[0].attributions[0].name,'© OpenStreetMap contributors');
  assert.equal(second.status,200);assert.equal(calls.upstream,1);assert.equal(calls.quota,2);
  assert.equal(first.headers['cache-control'],'no-store');
  assert.equal(first.headers['access-control-allow-origin'],env.ALLOWED_ORIGINS);
  assert.equal(calls.requests[0].url,'https://overpass.private.coffee/api/interpreter');
  assert.ok(!calls.requests[0].request.headers.Authorization);
  assert.ok(!String(calls.requests[0].request.body).includes('valid-token'));
  assert.ok(calls.requests[0].request.headers['User-Agent'].includes('https://github.com/Pimentelzxc/LEAD-HUNTER'));
});

test('simultaneous equivalent searches share one upstream request',async()=>{
  const {handler,calls}=fixture();
  const results=await Promise.all([invoke(handler),invoke(handler)]);
  assert.ok(results.every(result=>result.status===200));assert.equal(calls.upstream,1);
});

test('API distinguishes missing municipality from an empty category',async()=>{
  let f=fixture({data:{elements:[]}});
  assert.equal((await invoke(f.handler)).status,422);
  f=fixture({data:{elements:[responseData.elements[0]]}});
  const empty=await invoke(f.handler);assert.equal(empty.status,200);assert.equal(empty.body.leads.length,0);
});

test('API rejects partial provider results and normalizes timeout/availability errors',async()=>{
  for(const [options,status] of [[{data:{...responseData,remark:'runtime error'}},502],[{status:429},429],[{status:503},502],[{timeout:true},504]]){
    const {handler}=fixture(options);const result=await invoke(handler);
    assert.equal(result.status,status);assert.equal(result.body.leads,undefined);
  }
});

test('API only refreshes OSM references saved in the authenticated owner’s wallet',async()=>{
  let f=fixture({noRecord:true});
  assert.equal((await invoke(f.handler,{body:{action:'details',sourceId:'node:123'}})).status,404);
  assert.equal(f.calls.upstream,0);
  f=fixture();const result=await invoke(f.handler,{body:{action:'details',sourceId:'node:123'}});
  assert.equal(result.status,200);assert.equal(result.body.lead.sourceId,'node:123');
  assert.ok(String(f.calls.requests[0].request.body).includes('node%28123%29'));
});

test('timeout opens a cooldown without consuming another quota, and permits recovery',async()=>{
  let clock=1000;
  const {handler,calls}=fixture({timeoutOnce:true,now:()=>clock});
  const first=await invoke(handler);
  assert.equal(first.status,504);assert.equal(first.body.code,'PROVIDER_TIMEOUT');
  assert.equal(first.headers['retry-after'],'30');
  const retry=await invoke(handler);
  assert.equal(retry.status,503);assert.equal(retry.body.code,'PROVIDER_COOLDOWN');
  assert.equal(calls.upstream,1);assert.equal(calls.quota,1);
  clock+=31000;
  assert.equal((await invoke(handler)).status,200);
  assert.equal(calls.upstream,2);assert.equal(calls.quota,2);
});

test('rate limit cooldown respects Retry-After instead of rotating providers or retrying',async()=>{
  const {handler,calls}=fixture({status:429,retryAfter:'90'});
  const first=await invoke(handler);
  assert.equal(first.status,429);assert.equal(first.body.retryAfter,90);
  assert.equal(first.headers['retry-after'],'90');
  assert.equal((await invoke(handler)).body.code,'PROVIDER_COOLDOWN');
  assert.equal(calls.upstream,1);assert.equal(calls.quota,1);
});

test('network and response-body timeouts have provider-specific errors',async()=>{
  let f=fixture({networkError:true});
  let result=await invoke(f.handler);
  assert.equal(result.status,503);assert.equal(result.body.code,'PROVIDER_UNREACHABLE');
  f=fixture({bodyTimeout:true});result=await invoke(f.handler);
  assert.equal(result.status,504);assert.equal(result.body.code,'PROVIDER_TIMEOUT');
  assert.ok(result.body.message.includes('começou a responder'));
});
