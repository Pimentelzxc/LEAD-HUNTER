import test from 'node:test';
import assert from 'node:assert/strict';
import {overpassEndpoint,overpassHeaders} from '../backend/lib/provider-config.js';

test('provider identification includes the application and its full project URL',()=>{
  assert.ok(overpassHeaders({})['User-Agent'].includes('https://github.com/Pimentelzxc/LEAD-HUNTER'));
  const headers=overpassHeaders({APP_URL:'https://example.org/vorka?secret=do-not-forward#fragment'});
  assert.equal(headers['User-Agent'],'VORKA-Lead-Hunter/1.1 (+https://example.org/vorka)');
  assert.ok(!headers['User-Agent'].includes('secret'));
  assert.ok(!overpassHeaders({APP_URL:'https://user:password@example.org'})['User-Agent'].includes('password'));
});

test('invalid provider URLs are rejected and the default stays free Overpass',()=>{
  assert.equal(overpassEndpoint({}).hostname,'overpass.private.coffee');
  assert.throws(()=>overpassEndpoint({OVERPASS_API_URL:'http://example.org'}));
  assert.throws(()=>overpassEndpoint({OVERPASS_API_URL:'https://user:password@example.org'}));
});
