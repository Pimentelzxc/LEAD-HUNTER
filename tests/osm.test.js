import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery, buildDetailQuery, normalizeOsm, normalizeSearchResult, parseOsmId } from '@vorka/shared/osm';
import { toSavedReference, savedToLead, buildCsv, sourceKey } from '@vorka/shared';

const query = {state:'PR',city:'Fazenda Rio Grande',segment:'Barbearias',neighborhood:''};
const fixture = {type:'node',id:123,tags:{name:'Fixture only',shop:'hairdresser',male:'yes','contact:phone':'+55 41 99999-9999','contact:website':'https://example.org','contact:instagram':'fixture_profile','contact:whatsapp':'+5541999999999'}};

test('OSM queries are city-bounded, capped and use only predefined selectors', () => {
  const built = buildSearchQuery(query);
  assert.ok(built.text.includes('"ISO3166-2"="BR-PR"'));
  assert.ok(built.text.includes('rel(area.state)'));
  assert.ok(built.text.includes('nwr(area.city)'));
  assert.ok(built.text.includes('out tags center 101'));
  assert.equal(built.mode,'category');
  assert.equal(buildSearchQuery({...query,segment:'Padarias'}).mode,'category');
  assert.equal(buildSearchQuery({...query,segment:'Loja personalizada'}).mode,'name');
});

test('user text cannot inject QL or arbitrary regex patterns', () => {
  const built=buildSearchQuery({...query,city:'A.*";out body;(',segment:'["name"~".*"]',neighborhood:'Centro.*'});
  assert.ok(!built.text.includes('";out body;('));
  assert.ok(built.text.includes('\\\\.\\\\*'));
  assert.ok(built.text.includes('addr:suburb'));
  assert.ok(built.text.includes('addr:neighbourhood'));
  assert.ok(!built.text.includes('https://'));
});

test('OSM channels come from tags and never fabricate ratings or WhatsApp confirmation', () => {
  const lead=normalizeOsm(fixture,query);
  assert.equal(lead.sourceId,'node:123');
  assert.equal(lead.instagram,'https://www.instagram.com/fixture_profile/');
  assert.equal(lead.websiteState,'identified');
  assert.equal(lead.rating,null);
  assert.equal(lead.reviewCount,null);
  assert.equal(lead.whatsapp,null);
  assert.equal(lead.whatsappState,'unverified');
  assert.equal(lead.whatsappCandidate,'5541999999999');
  assert.equal(lead.address,null);
  const absent=normalizeOsm({type:'way',id:123,tags:{name:'Other fixture',shop:'bakery'}});
  assert.equal(absent.phone,null);
  assert.equal(absent.websiteState,'not_identified');
  assert.equal(absent.instagramState,'unverified');
  assert.notEqual(sourceKey(lead),sourceKey(absent));
});

test('detail references reject QL injection and preserve element type', () => {
  assert.equal(parseOsmId('node:0'),null);
  assert.equal(parseOsmId('way:123);out body;'),null);
  assert.ok(buildDetailQuery('relation:123').includes('relation(123)'));
  assert.throws(()=>buildDetailQuery('node:-1'));
});

test('malformed, abandoned and unnamed elements are ignored', () => {
  assert.equal(normalizeOsm({type:'area',id:123,tags:{name:'Area'}}),null);
  assert.equal(normalizeOsm({...fixture,tags:{...fixture.tags,disused:'yes'}}),null);
  assert.equal(normalizeOsm({...fixture,tags:{shop:'bakery'}}),null);
  const invalid=normalizeOsm({...fixture,tags:{...fixture.tags,website:'javascript:alert(1)','contact:website':'javascript:alert(1)','contact:instagram':'https://malicious.example/fixture'}});
  assert.equal(invalid.website,null);
  assert.equal(invalid.instagram,null);
});

test('partial provider JSON is rejected rather than presenting incomplete search as complete', () => {
  assert.throws(()=>normalizeSearchResult({elements:[],remark:'runtime error'},query,'category'),/PARTIAL/);
  assert.throws(()=>normalizeSearchResult({},query,'category'),/INVALID/);
  assert.equal(normalizeSearchResult({elements:[]},query,'category').boundaryFound,false);
  const result=normalizeSearchResult({elements:[{type:'area',id:1,tags:{name:'Municipality'}},fixture,fixture]},query,'category');
  assert.equal(result.boundaryFound,true);
  assert.equal(result.leads.length,1);
  assert.equal(result.leads[0].city,'Municipality');
});

test('OSM snapshots and CSV preserve source/license without marking community data as owned', () => {
  const lead=normalizeOsm(fixture,query);
  const saved=toSavedReference(lead,'user1');
  assert.equal(saved.source_provider,'openstreetmap');
  assert.equal(saved.source_snapshot.name,'Fixture only');
  assert.equal(saved.owned_data_confirmed,undefined);
  assert.equal(saved.source_snapshot.rating,undefined);
  assert.equal(savedToLead(saved).name,'Fixture only');
  assert.equal(savedToLead(saved).mapsUrl,'https://www.openstreetmap.org/node/123');
  const csv=buildCsv([saved]);
  assert.ok(csv.includes('Fixture only'));
  assert.ok(csv.includes('© OpenStreetMap contributors'));
  assert.ok(csv.includes('ODbL 1.0'));
});
