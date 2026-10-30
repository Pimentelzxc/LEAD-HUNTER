import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsv, DEFAULT_WEIGHTS, matchesFilters, normalizePlace, phoneHref, safeUrl,
  savedToLead, scoreLead, toSavedReference, uniqueLeads, validateSearch, validateWeights,
} from '@vorka/shared';

test('missing channels are not treated as a deficiency or awarded points', () => {
  const missing = normalizePlace({ id: 'test_place_1', displayName: { text: 'Test fixture' } });
  assert.equal(missing.websiteState, 'not_identified');
  assert.equal(missing.instagramState, 'unverified');
  assert.equal(missing.whatsappState, 'unverified');
  assert.equal(scoreLead(missing).score, null);
  assert.equal(scoreLead({ websiteState: 'not_identified', instagramState: 'not_identified' }).score, null);
});

test('score thresholds and evidence are explicit and bounded', () => {
  const lead = { website: 'https://example.org',instagram:'https://www.instagram.com/testfixture/',phone:'+5541999999999' };
  assert.equal(scoreLead(lead).score, 60);
  assert.equal(scoreLead(lead).level, 'medium');
  assert.equal(scoreLead({ ...lead, opportunityConfirmed: true }).score, 60);
  const confirmed = scoreLead({ ...lead, opportunityConfirmed: true, opportunityEvidence: 'Customer requested a website.' });
  assert.equal(confirmed.score, 100);
  assert.equal(confirmed.criteria.length, 4);
  assert.equal(scoreLead({ rating: 4.7, reviewCount: 60 }).score, null);
  assert.equal(scoreLead({ phone: '+5541999999999' }).level, 'low');
  assert.equal(scoreLead({ rating: 5, reviewCount: 0 }).score, null);
});

test('weights must have exactly four integer keys totaling 100', () => {
  assert.ok(validateWeights(DEFAULT_WEIGHTS));
  assert.equal(validateWeights({ ...DEFAULT_WEIGHTS, contact: 16 }), false);
  assert.equal(validateWeights({ ...DEFAULT_WEIGHTS, contact: '15' }), false);
  assert.equal(validateWeights({ ...DEFAULT_WEIGHTS, extra: 0 }), false);
  assert.equal(validateWeights({ website: -1, instagram: 31, contact: 50, confirmed: 20 }), false);
  assert.equal(scoreLead({ phone: '12345678' }, { invalid: 100 }).score, 20);
  assert.equal(scoreLead({ phone: '12345678' }, { website: 0, instagram: 0, contact: 100, confirmed: 0 }).score, 100);
});

test('normalization does not invent website, Instagram, WhatsApp, rating or phone', () => {
  const lead = normalizePlace({ id: 'test_place_2', websiteUri: 'https://www.instagram.com/test_fixture/', userRatingCount: 0 });
  assert.equal(lead.website, null);
  assert.equal(lead.instagram, null);
  assert.equal(lead.whatsapp, null);
  assert.equal(lead.phone, null);
  assert.equal(lead.rating, null);
  assert.equal(lead.reviewCount, 0);
  assert.ok(lead.registeredUrl.includes('instagram.com'));
  assert.equal(normalizePlace({ id: 'test_closed', businessStatus: 'CLOSED_PERMANENTLY' }), null);
  assert.equal(normalizePlace({}), null);
});

test('website is identified only from a safe, non-social URL', () => {
  assert.equal(normalizePlace({ id: 'test', websiteUri: 'https://example.org' }).websiteState, 'identified');
  assert.equal(normalizePlace({ id: 'test', websiteUri: 'javascript:alert(1)' }).website, null);
  assert.equal(normalizePlace({ id: 'test', websiteUri: 'https://wa.me/5541999999999' }).websiteState, 'not_identified');
  assert.equal(safeUrl('https://user:password@example.org'), null);
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(phoneHref('+55 (41) 99999-9999'), 'tel:+5541999999999');
  assert.equal(phoneHref('bad'), null);
});

test('filters combine and do not confuse unverified with not identified', () => {
  const lead = normalizePlace({ id: 'test', rating: 4.9, userRatingCount: 230, nationalPhoneNumber: '41999999999' });
  assert.ok(matchesFilters(lead, { website: 'not_identified', phone: true, reviews: 'many' }));
  assert.equal(matchesFilters(lead, { high:true }),false);
  assert.equal(matchesFilters(lead, { instagram: 'not_identified' }), false);
  assert.ok(matchesFilters(lead, { instagram: 'unverified' }));
  assert.equal(matchesFilters(lead, { whatsapp: true }), false);
  assert.equal(matchesFilters(lead, { reviews: 'few' }), false);
  assert.equal(matchesFilters({ ...lead, rating: null }, { minRating: 4 }), false);
  assert.equal(matchesFilters({ ...lead, reviewCount: null }, { reviews: 'few' }), false);
});

test('search validation accepts all states and custom segments but rejects malformed input', () => {
  const valid = { state: 'pr', city: ' Fazenda  Rio Grande ', segment: 'Artesãos locais', neighborhood: '' };
  const result = validateSearch(valid);
  assert.ok(result.valid);
  assert.equal(result.value.city, 'Fazenda Rio Grande');
  assert.equal(result.value.state, 'PR');
  assert.equal(validateSearch({ ...valid, state: 'ZZ' }).valid, false);
  assert.equal(validateSearch({ ...valid, segment: 'a'.repeat(101) }).valid, false);
  assert.equal(validateSearch({ ...valid, pageToken: 123 }).valid, false);
  assert.equal(validateSearch(null).valid, false);
});

test('deduplication operates on the stable place identifier across pages', () => {
  const first = { placeId: 'one', name: 'First' };
  const refreshed = { placeId: 'one', name: 'Latest' };
  assert.deepEqual(uniqueLeads([first, null, { placeId: 'two' }, refreshed]), [refreshed, { placeId: 'two' }]);
});

test('saving a Places result persists only its reference and user-authored metadata', () => {
  const google = { placeId: 'test_place', name: 'DO NOT STORE', rating: 5, reviewCount: 300, phone: 'DO NOT STORE', website: 'https://example.org' };
  assert.deepEqual(toSavedReference(google, 'user-1', true), { place_id: 'test_place', created_by: 'user-1', favorite: true, status: 'Novo' });
  const saved = savedToLead({ id: 'row-1', place_id: 'test_place', company_name: 'Own data', contact_phone: '41999999999' });
  assert.equal(saved.rating, null);
  assert.equal(saved.reviewCount, null);
  assert.equal(saved.websiteState, 'unverified');
});

test('CSV excludes all unconfirmed source fields and protects spreadsheet formulas', () => {
  const csv = buildCsv([
    { company_name: 'FORBIDDEN', contact_phone: 'FORBIDDEN', status: 'Novo', created_by: 'user1' },
    { company_name: '=HYPERLINK("https://example.org")', contact_phone: '+5541999999999', category: 'Own;category',
      status: 'Contatado', created_by: 'user1', owned_data_source: 'Direct conversation', owned_data_confirmed: true },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(!csv.includes('FORBIDDEN'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+5541999999999"));
  assert.ok(csv.includes('"Own;category"'));
  assert.ok(csv.includes('""https://example.org""'));
});
