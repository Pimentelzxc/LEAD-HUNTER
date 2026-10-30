import { safeUrl, phoneHref, OSM_ATTRIBUTION, OSM_LICENSE_URL, uniqueLeads } from './domain.js';

export const DEFAULT_OVERPASS_URL = 'https://overpass.private.coffee/api/interpreter';
export const MAX_RESULTS = 100;
export const PAGE_SIZE = 20;
const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const segments = [
  { names: ['barbearia','barbearias','barber'], selectors: ['["shop"="hairdresser"]["male"="yes"]','["shop"="hairdresser"]["hairdresser"="barber"]','["shop"="hairdresser"]["name"~"barbear|barber",i]'] },
  { names: ['salao de beleza','saloes de beleza','cabeleireiro','cabeleireiros'], selectors: ['["shop"="hairdresser"]','["shop"="beauty"]'] },
  { names: ['restaurante','restaurantes'], selectors: ['["amenity"="restaurant"]'] },
  { names: ['lanchonete','lanchonetes','fast food'], selectors: ['["amenity"="fast_food"]'] },
  { names: ['oficina','oficinas','oficina mecanica','oficinas mecanicas'], selectors: ['["shop"="car_repair"]'] },
  { names: ['academia','academias'], selectors: ['["leisure"="fitness_centre"]'] },
  { names: ['clinica','clinicas'], selectors: ['["healthcare"="clinic"]','["amenity"="clinic"]','["amenity"="doctors"]'] },
  { names: ['pet shop','pet shops','petshop'], selectors: ['["shop"="pet"]'] },
  { names: ['loja de roupa','lojas de roupas','roupas'], selectors: ['["shop"="clothes"]'] },
  { names: ['mercado','mercados','supermercado','supermercados'], selectors: ['["shop"="supermarket"]','["shop"="convenience"]'] },
  { names: ['padaria','padarias'], selectors: ['["shop"="bakery"]'] },
  { names: ['farmacia','farmacias'], selectors: ['["amenity"="pharmacy"]'] },
  { names: ['dentista','dentistas','odontologia'], selectors: ['["amenity"="dentist"]','["healthcare"="dentist"]'] },
  { names: ['cafeteria','cafeterias','cafes'], selectors: ['["amenity"="cafe"]'] },
  { names: ['hotel','hoteis','pousada','pousadas'], selectors: ['["tourism"="hotel"]','["tourism"="guest_house"]'] },
  { names: ['floricultura','floriculturas'], selectors: ['["shop"="florist"]'] },
  { names: ['veterinario','veterinarios','clinica veterinaria','clinicas veterinarias'], selectors: ['["amenity"="veterinary"]'] },
];

export function literalRegex(value) {
  const accents = { a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]' };
  return [...fold(value)].map(char => accents[char] || char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
}

export function buildSearchQuery(query) {
  const cityPattern = JSON.stringify(`^${literalRegex(query.city)}$`);
  const segment = segments.find(item => item.names.includes(fold(query.segment)));
  const selectors = segment?.selectors || [`[~"^(shop|amenity|craft|healthcare|office|leisure|tourism)$"~"."]["name"~${JSON.stringify(literalRegex(query.segment))},i]`];
  const neighborhoods = query.neighborhood
    ? ['addr:suburb','addr:neighbourhood'].map(key => `[${JSON.stringify(key)}~${JSON.stringify(`^${literalRegex(query.neighborhood)}$`)},i]`)
    : [''];
  const selection = selectors.flatMap(selector => neighborhoods.map(neighborhood => `nwr(area.city)${selector}["name"]${neighborhood};`)).join('\n');
  const capital = query.state === 'DF' && fold(query.city) === 'brasilia';
  return {
    mode: segment ? 'category' : 'name',
    text: `[out:json][timeout:25][maxsize:33554432];
area["ISO3166-2"="BR-${query.state}"]["admin_level"="4"]->.state;
${capital ? '.state->.city;' : `rel(area.state)["boundary"="administrative"]["admin_level"="8"]["name"~${cityPattern},i];map_to_area->.city;`}
.city out tags;
(${selection});
out tags center ${MAX_RESULTS + 1};`,
  };
}

export function parseOsmId(id) {
  const match = /^(node|way|relation):([1-9]\d{0,19})$/.exec(String(id));
  return match ? { type: match[1], id: match[2] } : null;
}

export function buildDetailQuery(sourceId) {
  const ref = parseOsmId(sourceId);
  if (!ref) throw new Error('Identificador OpenStreetMap inválido.');
  return `[out:json][timeout:15][maxsize:1048576];${ref.type}(${ref.id});out tags center 1;`;
}

function normalizeInstagram(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const url = /^@?[A-Za-z0-9_.]{1,30}$/.test(text) ? `https://www.instagram.com/${text.replace(/^@/, '')}/` : safeUrl(text);
  if (!url) return null;
  try { return /^(www\.)?instagram\.com$/.test(new URL(url).hostname) && /^\/[A-Za-z0-9_.]+\/?$/.test(new URL(url).pathname) ? url : null; } catch { return null; }
}

function category(tags) {
  if (tags.shop === 'hairdresser') return tags.male === 'yes' || tags.hairdresser === 'barber' ? 'Barbearia' : 'Cabeleireiro / barbearia';
  const labels = { beauty: 'Salão de beleza', restaurant: 'Restaurante', fast_food: 'Lanchonete', car_repair: 'Oficina mecânica', fitness_centre: 'Academia', clinic: 'Clínica', doctors: 'Consultório', pet: 'Pet shop', clothes: 'Loja de roupas', supermarket: 'Supermercado', convenience: 'Mercado', bakery: 'Padaria', pharmacy: 'Farmácia', dentist: 'Dentista', cafe: 'Cafeteria', hotel: 'Hotel', guest_house: 'Pousada', florist: 'Floricultura', veterinary: 'Clínica veterinária' };
  const kind = tags.shop || tags.amenity || tags.healthcare || tags.leisure || tags.tourism || tags.craft || tags.office;
  return labels[kind] || kind || 'Categoria não informada';
}

export function normalizeOsm(element, context = {}) {
  const tags = element?.tags;
  if (!tags || !['node','way','relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || typeof tags.name !== 'string' || !tags.name.trim()) return null;
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags.shop === 'vacant' || tags['disused:shop']) return null;
  const registeredUrl = safeUrl(tags['contact:website'] || tags.website);
  const social = registeredUrl && /(^|\.)(instagram\.com|facebook\.com|wa\.me|whatsapp\.com)$/.test(new URL(registeredUrl).hostname);
  const website = registeredUrl && !social ? registeredUrl : null;
  const phone = [tags['contact:phone'],tags.phone,tags['contact:mobile']].find(value => typeof value === 'string' && phoneHref(value)) || null;
  const instagram = normalizeInstagram(tags['contact:instagram'] || tags.instagram);
  const whatsappRaw = typeof tags['contact:whatsapp'] === 'string' ? tags['contact:whatsapp'].replace(/\D/g, '') : '';
  const sourceId = `${element.type}:${element.id}`;
  const city = tags['addr:city'] || context.city || '';
  const state = tags['addr:state'] || context.state || '';
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  const address = street ? [street, tags['addr:suburb'] || tags['addr:neighbourhood'],city,state].filter(Boolean).join(' · ') : null;
  return {
    id: `osm:${sourceId}`, sourceId, source: 'openstreetmap', name: tags.name.trim(), category: category(tags), city, state, address,
    phone, website, websiteState: website ? 'identified' : 'not_identified', registeredUrl,
    instagram, instagramState: instagram ? 'identified' : 'unverified',
    whatsapp: null, whatsappState: 'unverified', whatsappCandidate: /^\d{10,15}$/.test(whatsappRaw) ? whatsappRaw : null,
    rating: null, reviewCount: null, mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    attributions: [{ name: OSM_ATTRIBUTION, url: OSM_LICENSE_URL }], retrievedAt: new Date().toISOString(),
  };
}

export function normalizeSearchResult(data, query, mode) {
  if (!Array.isArray(data?.elements)) throw new Error('INVALID_PROVIDER_RESPONSE');
  // A timeout may return a partial JSON response: never silently treat it as complete.
  if (data.remark) throw new Error('PARTIAL_PROVIDER_RESPONSE');
  const area = data.elements.find(element => element.type === 'area');
  const context = { city: area?.tags?.name || query.city, state: query.state };
  const leads = uniqueLeads(data.elements.map(element => normalizeOsm(element, context)));
  return {
    leads: leads.slice(0, MAX_RESULTS), source: 'openstreetmap', nextPageToken: null,
    boundaryFound: Boolean(area), limited: data.elements.filter(element => ['node','way','relation'].includes(element.type)).length > MAX_RESULTS, segmentMode: mode,
    fetchedAt: new Date().toISOString(),
  };
}
