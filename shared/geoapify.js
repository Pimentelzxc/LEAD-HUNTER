import { STATES, safeUrl, phoneHref, OSM_ATTRIBUTION, OSM_LICENSE_URL, uniqueLeads } from './domain.js';

export const GEOAPIFY_ATTRIBUTION = 'Powered by Geoapify';
export const GEOAPIFY_URL = 'https://www.geoapify.com/';
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const isGeoapifyId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{2,1024}$/.test(value);

const groups = [
  [['barbearia','barbearias','barber','salao de beleza','saloes de beleza','cabeleireiro','cabeleireiros'],'service.beauty.hairdresser','Cabeleireiro / barbearia'],
  [['restaurante','restaurantes'],'catering.restaurant','Restaurante'],
  [['lanchonete','lanchonetes','fast food'],'catering.fast_food','Lanchonete'],
  [['oficina','oficinas','oficina mecanica','oficinas mecanicas'],'service.vehicle.repair.car','Oficina mecânica'],
  [['academia','academias'],'sport.fitness','Academia'],
  [['clinica','clinicas'],'healthcare.clinic_or_praxis','Clínica / consultório'],
  [['pet shop','pet shops','petshop'],'pet.shop','Pet shop'],
  [['loja de roupa','lojas de roupas','roupas'],'commercial.clothing','Loja de roupas'],
  [['mercado','mercados','supermercado','supermercados'],'commercial.supermarket','Supermercado'],
  [['padaria','padarias'],'commercial.food_and_drink.bakery','Padaria'],
  [['farmacia','farmacias'],'healthcare.pharmacy','Farmácia'],
  [['dentista','dentistas','odontologia'],'healthcare.dentist','Dentista'],
  [['cafeteria','cafeterias','cafes'],'catering.cafe','Cafeteria'],
  [['hotel','hoteis'],'accommodation.hotel','Hotel'],
  [['pousada','pousadas'],'accommodation.guest_house','Pousada'],
  [['floricultura','floriculturas'],'commercial.florist','Floricultura'],
  [['veterinario','veterinarios','clinica veterinaria','clinicas veterinarias'],'pet.veterinary','Clínica veterinária'],
];

export function geoapifyCategory(segment) {
  const entry = groups.find(([names])=>names.includes(fold(segment)));
  return entry ? { categories:entry[1], mode:'category' } : { categories:'commercial,service,healthcare,catering,pet,sport,accommodation', name:segment, mode:'name' };
}

export function findGeoapifyCity(data, query) {
  return (Array.isArray(data?.results)?data.results:[]).find(city => {
    const code=String(city.state_code || '').replace(/^BR-/i,'').toUpperCase();
    const matchingState=code ? code===query.state : fold(city.state)===fold(STATES[query.state]);
    return String(city.country_code).toLowerCase()==='br' && matchingState && isGeoapifyId(city.place_id)
      && [city.city,city.name].some(name=>fold(name)===fold(query.city)) && city.result_type==='city';
  }) || null;
}

function profileUrl(value) {
  if(typeof value!=='string')return null;
  const url=/^@?[A-Za-z0-9_.]{1,30}$/.test(value.trim()) ? `https://www.instagram.com/${value.trim().replace(/^@/,'')}/` : safeUrl(value);
  if(!url)return null;
  const parsed=new URL(url);
  return /^(www\.)?instagram\.com$/.test(parsed.hostname) && /^\/[A-Za-z0-9_.]+\/?$/.test(parsed.pathname) ? url : null;
}

export function normalizeGeoapify(feature,{ details=false }={}) {
  const p=feature?.properties;
  if(!p || typeof p.name!=='string' || !p.name.trim() || !isGeoapifyId(p.place_id))return null;
  const raw=p.datasource?.raw || {};
  const osmType={n:'node',w:'way',r:'relation',node:'node',way:'way',relation:'relation'}[raw.osm_type];
  const osmId=String(raw.osm_id || '');
  const osmRef=osmType&&/^[1-9]\d{0,19}$/.test(osmId)?`${osmType}:${osmId}`:null;
  const websiteValue=p.website || raw['contact:website'] || raw.website;
  const registeredUrl=safeUrl(websiteValue);
  const social=registeredUrl && /(^|\.)(instagram\.com|facebook\.com|wa\.me|whatsapp\.com)$/.test(new URL(registeredUrl).hostname);
  const website=registeredUrl && !social ? registeredUrl : null;
  const instagram=profileUrl(p.contact?.instagram || raw['contact:instagram'] || raw.instagram);
  const phone=[p.contact?.phone,raw['contact:phone'],raw.phone].find(value=>typeof value==='string'&&phoneHref(value)) || null;
  const coordinates=feature.geometry?.type==='Point'?feature.geometry.coordinates:[];
  const lon=Number.isFinite(p.lon)?p.lon:coordinates?.[0],lat=Number.isFinite(p.lat)?p.lat:coordinates?.[1];
  const validPosition=Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=-180&&lon<=180&&lat>=-90&&lat<=90;
  const cats=Array.isArray(p.categories)?p.categories.filter(value=>typeof value==='string'):[];
  const known=[...groups].sort((a,b)=>b[1].length-a[1].length).find(([,key])=>cats.some(cat=>cat===key||cat.startsWith(key+'.')));
  const sourceId=p.place_id;
  const candidate=typeof raw['contact:whatsapp']==='string'?raw['contact:whatsapp'].replace(/\D/g,''):'';
  return {
    id:`geoapify:${sourceId}`,sourceId,osmRef,source:'geoapify',name:p.name.trim(),category:known?.[2]||'Categoria não informada',
    city:typeof p.city==='string'?p.city:'',state:String(p.state_code||'').replace(/^BR-/i,''),
    address:typeof p.formatted==='string'?p.formatted:null,phone,website,registeredUrl,
    websiteState:website?'identified':details?'not_identified':'unverified',
    instagram,instagramState:instagram?'identified':'unverified',
    whatsapp:null,whatsappState:'unverified',whatsappCandidate:/^\d{10,15}$/.test(candidate)?candidate:null,
    rating:null,reviewCount:null,longitude:validPosition?lon:null,latitude:validPosition?lat:null,
    mapsUrl:osmRef?`https://www.openstreetmap.org/${osmType}/${osmId}`:validPosition?`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`:null,
    dataProvider:'geoapify',detailsChecked:details,
    attributions:[{name:OSM_ATTRIBUTION,url:OSM_LICENSE_URL},{name:GEOAPIFY_ATTRIBUTION,url:GEOAPIFY_URL}],
    retrievedAt:new Date().toISOString(),
  };
}

export function normalizeGeoapifySearch(data,query,mode) {
  if(!Array.isArray(data?.features))throw new Error('INVALID_GEOAPIFY_RESPONSE');
  let features=data.features;
  if(query.neighborhood)features=features.filter(feature=>{
    const p=feature.properties||{};
    return [p.suburb,p.neighbourhood,p.quarter,p.district].some(value=>fold(value)===fold(query.neighborhood));
  });
  return {
    leads:uniqueLeads(features.map(feature=>normalizeGeoapify(feature))),source:'geoapify',nextPageToken:null,
    boundaryFound:true,limited:data.features.length>=100,segmentMode:mode,fetchedAt:new Date().toISOString(),
    notice:['barbearia','barbearias','barber'].includes(fold(query.segment))?'A categoria da fonte inclui cabeleireiros e barbearias. Confira o segmento de cada cadastro.':null,
  };
}
