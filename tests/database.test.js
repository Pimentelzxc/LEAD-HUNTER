import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine in WASM, isolated from all user/service databases.
test('migration, ownership, constraints and request quotas', async t => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  const asAdmin = () => db.exec('reset role;');
  const asUser = async id => {
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec('set role authenticated;');
  };
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../backend/supabase/migrations/202610290001_initial.sql', import.meta.url), 'utf8'));
    // Include a pre-existing account/reference to verify upgrades preserve data.
    const existing = '00000000-0000-4000-8000-000000000003';
    await db.query('insert into auth.users(id,email) values($1,$2)', [existing, 'existing@example.test']);
    await db.query("insert into public.leads(place_id,created_by) values('legacy_google_id',$1)", [existing]);
    await db.exec(await readFile(new URL('../backend/supabase/migrations/202610290002_openstreetmap.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../backend/supabase/migrations/202610300001_geoapify.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [alice, 'alice@example.test', bob, 'bob@example.test']);

    await t.test('profiles are provisioned by the Auth trigger', async () => {
      const result = await db.query('select count(*)::int as count from public.profiles');
      assert.equal(result.rows[0].count, 3);
      const legacy = (await db.query("select source_provider from public.leads where place_id='legacy_google_id'")).rows[0];
      assert.equal(legacy.source_provider, 'google_places');
      const weights = (await db.query('select score_weights from public.profiles where id=$1',[existing])).rows[0].score_weights;
      assert.deepEqual(weights,{website:20,instagram:20,contact:20,confirmed:40});
    });

    let leadId;
    await t.test('a seller can save a reference and cannot duplicate it', async () => {
      await asUser(alice);
      const result = await db.query("insert into public.leads(place_id) values('test_place_alpha') returning id");
      leadId = result.rows[0].id;
      await assert.rejects(db.query("insert into public.leads(place_id) values('test_place_alpha')"), /unique constraint/);
    });

    await t.test('another seller cannot read, edit, delete or claim the lead', async () => {
      await asUser(bob);
      assert.equal((await db.query('select * from public.leads')).rows.length, 0);
      assert.equal((await db.query("update public.leads set status='Contatado' where id=$1 returning id", [leadId])).rows.length, 0);
      assert.equal((await db.query('delete from public.leads where id=$1 returning id', [leadId])).rows.length, 0);
      await assert.rejects(db.query("insert into public.leads(place_id,created_by) values('forged_place',$1)", [alice]), /row-level security/);
      await assert.rejects(db.query('select * from private.places_buckets'), /permission denied/);
    });

    await t.test('a seller cannot elevate their role or edit another profile', async () => {
      await asUser(alice);
      await assert.rejects(db.query("update public.profiles set role='admin' where id=$1", [alice]), /permission denied/);
      assert.equal((await db.query("update public.profiles set name='Forged' where id=$1 returning id", [bob])).rows.length, 0);
    });

    await t.test('score configuration enforces shape, types and a total of 100', async () => {
      const valid = { website: 25, instagram: 25, contact: 25, confirmed: 25 };
      await db.query('update public.profiles set score_weights=$1 where id=$2', [JSON.stringify(valid), alice]);
      for (const invalid of [{ ...valid, contact: 26 }, { ...valid, extra: 0 }, { ...valid, contact: '25' }, [], { ...valid, contact: -1, confirmed: 51 }]) {
        await assert.rejects(db.query('update public.profiles set score_weights=$1 where id=$2', [JSON.stringify(invalid), alice]), /check constraint/);
      }
    });

    await t.test('independent business fields require a source, including against NULL bypasses', async () => {
      await assert.rejects(db.query('insert into public.leads default values'), /check constraint/);
      await assert.rejects(db.query("update public.leads set company_name='Copied' where id=$1", [leadId]), /check constraint/);
      await assert.rejects(db.query("update public.leads set company_name='Copied',owned_data_confirmed=true where id=$1", [leadId]), /check constraint/);
      await assert.rejects(db.query("update public.leads set opportunity_confirmed=true,owned_data_confirmed=true,owned_data_source='Direct' where id=$1", [leadId]), /check constraint/);
      await assert.rejects(db.query('update public.leads set whatsapp_confirmed=true where id=$1', [leadId]), /check constraint/);
      await db.query("update public.leads set company_name='Confirmed by customer',owned_data_confirmed=true,owned_data_source='Direct conversation' where id=$1", [leadId]);
      assert.equal((await db.query('select company_name from public.leads where id=$1', [leadId])).rows[0].company_name, 'Confirmed by customer');
    });

    await t.test('notes inherit ownership and cannot be injected into another seller’s lead', async () => {
      await asUser(bob);
      await assert.rejects(db.query("insert into public.lead_notes(lead_id,note) values($1,'Forbidden')", [leadId]), /row-level security/);
      await asUser(alice);
      await db.query("insert into public.lead_notes(lead_id,note) values($1,'Customer requested a call')", [leadId]);
      assert.equal((await db.query('select * from public.lead_notes')).rows.length, 1);
      await asUser(bob);
      assert.equal((await db.query('select * from public.lead_notes')).rows.length, 0);
    });

    await t.test('legacy paid-provider quota RPC is disabled for authenticated sellers', async () => {
      await asUser(alice);
      await assert.rejects(db.query('select public.consume_places_quota()'), /permission denied/);
    });

    await t.test('anonymous callers cannot access data or consume the quota RPC', async () => {
      await asAdmin(); await db.exec('set role anon;');
      await assert.rejects(db.query('select * from public.leads'), /permission denied/);
      await assert.rejects(db.query('select public.consume_places_quota()'), /permission denied/);
      await assert.rejects(db.query('select public.consume_osm_quota()'), /permission denied/);
    });

    await t.test('OSM snapshots are explicit, source-labelled, unique per owner and isolated', async () => {
      await asUser(alice);
      const snapshot = JSON.stringify({source:'openstreetmap',name:'Test fixture',phone:'+5541999999999'});
      await db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('openstreetmap','node:123',$1)",[snapshot]);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('openstreetmap','node:123',$1)",[snapshot]),/unique constraint/);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id) values('openstreetmap','node:456')"),/check constraint/);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('openstreetmap','node:0',$1)",[snapshot]),/check constraint/);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('openstreetmap','node:789',$1)",[JSON.stringify({source:'google_places',name:'Forbidden fixture'})]),/check constraint/);
      await asUser(bob);
      assert.equal((await db.query("select * from public.leads where source_provider='openstreetmap'")).rows.length,0);
      await db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('openstreetmap','node:123',$1)",[snapshot]);
    });

    await t.test('OSM per-user and workspace quotas roll back rejected calls', async () => {
      await asUser(alice);
      for(let i=0;i<3;i++)await db.query('select public.consume_osm_quota()');
      await assert.rejects(db.query('select public.consume_osm_quota()'),/OSM_QUOTA_user/);
      await asUser(bob);
      for(let i=0;i<3;i++)await db.query('select public.consume_osm_quota()');
      await asUser(existing);
      await assert.rejects(db.query('select public.consume_osm_quota()'),/OSM_QUOTA_app_minute/);
      await asAdmin();
      assert.equal((await db.query("select requests from private.osm_buckets where principal='app' and period='day'")).rows[0].requests,6);
      await db.exec("update private.osm_buckets set requests=100 where principal='app' and period='day';");
      await asUser(existing);
      await assert.rejects(db.query('select public.consume_osm_quota()'),/OSM_QUOTA_app_day/);
    });

    await t.test('Geoapify snapshots preserve attribution fields, uniqueness and ownership', async()=>{
      await asUser(alice);
      const snapshot=JSON.stringify({source:'geoapify',name:'Geo test fixture',dataProvider:'geoapify',latitude:-25.6,longitude:-49.3});
      await db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('geoapify','fixture_geo_id',$1)",[snapshot]);
      await db.query("update public.leads set source_snapshot=$1 where source_provider='geoapify' and source_id='fixture_geo_id'",[JSON.stringify({source:'geoapify',name:'Updated fixture',dataProvider:'geoapify'})]);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('geoapify','fixture_geo_id',$1)",[snapshot]),/unique constraint/);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('geoapify','bad_snapshot_id',$1)",[JSON.stringify({source:'openstreetmap',name:'Wrong provider'})]),/check constraint/);
      await assert.rejects(db.query("insert into public.leads(source_provider,source_id,source_snapshot) values('geoapify','invalid_name_id',$1)",[JSON.stringify({source:'geoapify',name:{invalid:'name'}})]),/check constraint/);
      await asUser(bob);
      assert.equal((await db.query("select * from public.leads where source_provider='geoapify'")).rows.length,0);
      assert.equal((await db.query("update public.leads set source_snapshot=$1 where source_provider='geoapify' returning id",[snapshot])).rows.length,0);
    });
  } finally { await db.close(); }
});
