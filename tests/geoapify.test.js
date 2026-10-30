import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createGeoapifyClient,mapsProvider} from '../backend/lib/geoapify.js';
import {createPlacesHandler} from '../backend/lib/handler.js';
import {normalizeGeoapify,findGeoapifyCity} from '@vorka/shared/geoapify';
import {toSavedReference,savedToLead,buildCsv,sourceKey} from '@vorka/shared';

const query={state:'PR',city:'Fazenda Rio Grande',segment:'Barbearias',neighborhood:''};
const municipality={place_id:'fixture_city_123',city:query.city,state_code:'PR',country_code:'br',result_type:'city'};
const place={type:'Feature',geometry:{type:'Point',coordinates:[-49.3,-25.6]},properties:{place_id:'fixture_place_123',name:'Test-only company',city:query.city,state_code:'PR',formatted:'Test-only address',categories:['service.beauty.hairdresser']}};
const env={SUPABASE_URL:'https://project.example',SUPABASE_PUBLISHABLE_KEY:'public-test-key',GEOAPIFY_API_KEY:'TEST_KEY_NEVER_REAL',ALLOWED_ORIGINS:'http://localhost:5173'};

function setup(options={}){
  const requests=[];let quota=0;
  const fetcher=async(url,request)=>{
    const parsed=new URL(url);requests.push({url:parsed,request});
    if(options.error)return new Response(JSON.stringify({message:'Do not expose raw errors or keys'}),{status:options.error});
    if(parsed.pathname==='/v1/geocode/search')return Response.json({results:options.wrongCity?[]:[municipality]});
    if(parsed.pathname==='/v2/places')return Response.json({features:[place]});
    if(parsed.pathname==='/v2/place-details')return Response.json({features:[{...place,properties:{...place.properties,place_id:options.differentDetailId?'fixture_details_variant':place.properties.place_id,website:'https://example.org',contact:{phone:'+5541999999999'},feature_type:options.relatedFeature?'building':'details',datasource:{raw:{osm_type:'w',osm_id:123}}}}]});
    throw Error('Unexpected provider URL');
  };
  const clientFactory=()=>({
    auth:{async getUser(){return {data:{user:{id:'seller1'}},error:null};}},
    from(){return{select(){return this;},eq(){return this;},limit(){return this;},async single(){return {data:{id:'seller1'},error:null};},async maybeSingle(){return{data:{id:'owned-lead'},error:null};}};},
    async rpc(name){assert.equal(name,'consume_osm_quota');quota++;return {error:null};},
  });
  const config={...env,...options.env};
  return {
    requests,fetcher,client:createGeoapifyClient({env:config,fetcher}),
    handler:createPlacesHandler({env:config,fetcher,clientFactory}),quota:()=>quota,
  };
}
async function invoke(handler,body={action:'search',...query}){
  const req=Readable.from([]);req.method='POST';req.body=body;req.headers={authorization:'Bearer USER_TOKEN_NOT_FOR_PROVIDER',origin:env.ALLOWED_ORIGINS};
  let text='';const headers={};const res={statusCode:200,setHeader(key,value){headers[key]=value;},end(value){text=value;}};
  await handler(req,res);return {status:res.statusCode,body:JSON.parse(text),headers};
}

test('auto selects Geoapify only when its server key is configured',()=>{
  assert.equal(mapsProvider({}),'overpass');assert.equal(mapsProvider(env),'geoapify');
  assert.equal(mapsProvider({...env,MAPS_PROVIDER:'overpass'}),'overpass');
  assert.throws(()=>mapsProvider({MAPS_PROVIDER:'untrusted'}));
});

test('Geoapify municipality selection verifies country, state, type and exact city',()=>{
  assert.equal(findGeoapifyCity({results:[municipality]},query),municipality);
  for(const wrong of [{...municipality,state_code:'SP'},{...municipality,country_code:'pt'},{...municipality,city:'Curitiba'},{...municipality,result_type:'street'}])assert.equal(findGeoapifyCity({results:[wrong]},query),null);
});

test('search results do not claim absent site or contacts were checked',()=>{
  const lead=normalizeGeoapify(place);
  assert.equal(lead.websiteState,'unverified');assert.equal(lead.phone,null);
  assert.equal(lead.rating,null);assert.equal(lead.whatsappState,'unverified');
  assert.ok(lead.mapsUrl.startsWith('https://www.openstreetmap.org/'));
  assert.equal(normalizeGeoapify(place,{details:true}).websiteState,'not_identified');
  assert.equal(normalizeGeoapify({...place,properties:{...place.properties,place_id:'https://example.org/inject'}}),null);
});

test('search makes at most geocoding and one bounded Places request, with no detail fanout',async()=>{
  const f=setup();const result=await f.client.search(query);
  assert.equal(result.source,'geoapify');assert.equal(result.leads.length,1);
  assert.equal(f.requests.length,2);
  assert.equal(f.requests[1].url.searchParams.get('filter'),'place:fixture_city_123');
  assert.equal(f.requests[1].url.searchParams.get('limit'),'100');
  assert.ok(f.requests.every(item=>item.url.hostname==='api.geoapify.com'));
  await f.client.search(query);assert.equal(f.requests.length,2);
});

test('wrong municipality stops before Places, without widening the geographic scope',async()=>{
  const f=setup({wrongCity:true});await assert.rejects(f.client.search(query),error=>error.code==='CITY_NOT_FOUND');assert.equal(f.requests.length,1);
});

test('API serves Geoapify results without exposing the key or user token',async()=>{
  const f=setup();const result=await invoke(f.handler);
  assert.equal(result.status,200);assert.equal(result.body.source,'geoapify');
  assert.equal(f.quota(),1);assert.ok(!JSON.stringify(result.body).includes(env.GEOAPIFY_API_KEY));
  assert.ok(f.requests.every(item=>!JSON.stringify(item.request).includes('USER_TOKEN_NOT_FOR_PROVIDER')));
});

test('explicit Geoapify without a key fails before quota and network calls',async()=>{
  const f=setup({env:{GEOAPIFY_API_KEY:'',MAPS_PROVIDER:'geoapify'}});const result=await invoke(f.handler);
  assert.equal(result.body.code,'GEOAPIFY_KEY_REQUIRED');assert.equal(f.quota(),0);assert.equal(f.requests.length,0);
});

test('invalid key and provider quota are reported without raw upstream bodies or fallback',async()=>{
  for(const [status,code]of [[401,'GEOAPIFY_KEY_INVALID'],[403,'GEOAPIFY_KEY_INVALID'],[429,'GEOAPIFY_LIMIT'],[503,'GEOAPIFY_ERROR']]){
    const f=setup({error:status});const result=await invoke(f.handler);assert.equal(result.body.code,code);
    assert.ok(!JSON.stringify(result.body).includes('raw errors'));assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].url.hostname,'api.geoapify.com');
  }
});

test('details are requested only explicitly, validate references and can refresh old OSM records',async()=>{
  const f=setup();let result=await invoke(f.handler,{action:'details',sourceProvider:'geoapify',sourceId:'fixture_place_123'});
  assert.equal(result.status,200);assert.equal(result.body.lead.phone,'+5541999999999');assert.equal(result.body.lead.websiteState,'identified');
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].url.pathname,'/v2/place-details');
  result=await invoke(f.handler,{action:'details',sourceProvider:'geoapify',sourceId:'https://evil.example'});assert.equal(result.status,400);assert.equal(f.requests.length,1);
  result=await invoke(f.handler,{action:'details',sourceId:'node:123'});
  assert.equal(result.status,200);assert.equal(result.body.lead.source,'openstreetmap');assert.equal(result.body.lead.sourceId,'node:123');
  assert.equal(f.requests[1].url.searchParams.get('osm_id'),'123');assert.equal(f.requests[1].url.searchParams.get('osm_type'),'n');
});

test('Geoapify snapshots, identity and CSV retain both provider and OSM attribution',()=>{
  const lead=normalizeGeoapify(place);const saved=toSavedReference(lead,'seller1');
  assert.equal(saved.source_provider,'geoapify');assert.equal(sourceKey(saved),sourceKey(lead));
  const loaded=savedToLead(saved);assert.equal(loaded.name,lead.name);assert.equal(loaded.mapsUrl,lead.mapsUrl);
  assert.ok(loaded.attributions.some(item=>item.name==='Powered by Geoapify'));
  const csv=buildCsv([saved]);assert.ok(csv.includes('Powered by Geoapify'));assert.ok(csv.includes('© OpenStreetMap contributors'));
  assert.ok(!JSON.stringify(saved).includes(env.GEOAPIFY_API_KEY));
});

test('a primary details feature can use another encoded ID while retaining the search reference',async()=>{
  const f=setup({differentDetailId:true});
  const lead=await f.client.details('fixture_place_123','geoapify','way:123');
  assert.equal(lead.sourceId,'fixture_place_123');assert.equal(lead.phone,'+5541999999999');assert.equal(lead.osmRef,'way:123');
  assert.equal(sourceKey(lead),'openstreetmap:way:123');
  assert.equal(sourceKey(toSavedReference(lead,'seller1')),sourceKey(lead));
  await assert.rejects(f.client.details('fixture_place_123','geoapify','way:999'),error=>error.code==='GEOAPIFY_ID_MISMATCH');
});

test('an unrelated feature with a different ID is not substituted for the requested place',async()=>{
  const f=setup({differentDetailId:true,relatedFeature:true});
  assert.equal(await f.client.details('fixture_place_123'),null);
});
