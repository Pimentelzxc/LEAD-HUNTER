// Shared by the React front-end, Node back-end and tests. No credentials here.
export const STATES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export const STATUSES = ['Novo', 'Contatado', 'Em negociação', 'Venda concluída', 'Descartado'];
export const DEFAULT_WEIGHTS = { website: 20, instagram: 20, contact: 20, confirmed: 40 };
export const WEIGHT_LABELS = {
  website: 'Site cadastrado', instagram: 'Instagram cadastrado',
  contact: 'Telefone disponível', confirmed: 'Oportunidade confirmada',
};
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_LICENSE_URL = 'https://www.openstreetmap.org/copyright';

export function sourceKey(value) {
  const provider = value.source_provider || value.source;
  const osmRef = value.osmRef || value.source_snapshot?.osmRef;
  if (provider === 'geoapify' && /^(node|way|relation):[1-9]\d{0,19}$/.test(osmRef || '')) return `openstreetmap:${osmRef}`;
  if (['openstreetmap','geoapify'].includes(provider)) return `${provider}:${value.source_id || value.sourceId}`;
  return value.place_id || value.placeId ? `google_places:${value.place_id || value.placeId}` : `owned:${value.id}`;
}

export function validateWeights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(DEFAULT_WEIGHTS);
  return Object.keys(value).length === keys.length
    && keys.every(key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 100)
    && keys.reduce((sum, key) => sum + value[key], 0) === 100;
}

export function scoreLead(lead, suppliedWeights = DEFAULT_WEIGHTS) {
  const weights = validateWeights(suppliedWeights) ? suppliedWeights : DEFAULT_WEIGHTS;
  const hasWebsite = Boolean(safeUrl(lead.website));
  const hasInstagram = Boolean(safeUrl(lead.instagram));
  const hasContact = Boolean(typeof lead.phone === 'string' && phoneHref(lead.phone));
  const confirmed = lead.opportunityConfirmed === true && typeof lead.opportunityEvidence === 'string' && lead.opportunityEvidence.trim().length >= 5;
  const criteria = [
    { key: 'website', label: WEIGHT_LABELS.website, max: weights.website,
      points: hasWebsite ? weights.website : 0,
      evidence: hasWebsite ? 'Canal cadastrado para conhecer a empresa' : 'Sem site identificado; não comprova ausência', available: hasWebsite },
    { key: 'instagram', label: WEIGHT_LABELS.instagram, max: weights.instagram,
      points: hasInstagram ? weights.instagram : 0,
      evidence: hasInstagram ? 'Perfil informado pela fonte; verifique a titularidade' : 'Perfil não verificado', available: hasInstagram },
    { key: 'contact', label: WEIGHT_LABELS.contact, max: weights.contact,
      points: hasContact ? weights.contact : 0, evidence: hasContact ? 'Telefone comercial disponível' : 'Telefone não identificado', available: hasContact },
    { key: 'confirmed', label: WEIGHT_LABELS.confirmed, max: weights.confirmed,
      points: confirmed ? weights.confirmed : 0,
      evidence: confirmed ? lead.opportunityEvidence : 'Depende de verificação comercial', available: confirmed },
  ];
  const hasSignal = hasWebsite || hasInstagram || hasContact || confirmed;
  const score = hasSignal ? Math.min(100, Math.max(0, criteria.reduce((sum, item) => sum + item.points, 0))) : null;
  return {
    score, criteria, label: score === null ? 'Dados insuficientes' : score >= 80 ? 'Alta oportunidade' : score >= 50 ? 'Média oportunidade' : 'Baixa oportunidade',
    level: score === null ? 'unknown' : score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
  };
}

export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : null;
}

export function mapsUrl(placeId) {
  return `https://www.google.com/maps/search/?api=1&query=Estabelecimento&query_place_id=${encodeURIComponent(placeId)}`;
}

export function normalizePlace(place, context = {}) {
  if (!place || typeof place.id !== 'string' || !place.id || place.businessStatus === 'CLOSED_PERMANENTLY') return null;
  const registeredUrl = safeUrl(place.websiteUri);
  const socialHost = registeredUrl && /(^|\.)(instagram\.com|facebook\.com|wa\.me|whatsapp\.com)$/.test(new URL(registeredUrl).hostname);
  const website = registeredUrl && !socialHost ? registeredUrl : null;
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const cityComponent = components.find(item => item.types?.includes('administrative_area_level_2'))
    || components.find(item => item.types?.includes('locality'));
  const stateComponent = components.find(item => item.types?.includes('administrative_area_level_1'));
  return {
    id: place.id, placeId: place.id, source: 'google_places',
    name: place.displayName?.text || 'Nome não informado',
    address: place.formattedAddress || null,
    category: place.primaryTypeDisplayName?.text || context.segment || 'Categoria não informada',
    city: cityComponent?.longText || '', state: stateComponent?.shortText || '',
    searchContext: { city: context.city || '', state: context.state || '' },
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    rating: Number.isFinite(place.rating) ? place.rating : null,
    reviewCount: Number.isInteger(place.userRatingCount) ? place.userRatingCount : null,
    website, websiteState: website ? 'identified' : 'not_identified', registeredUrl,
    instagram: null, instagramState: 'unverified', whatsapp: null, whatsappState: 'unverified',
    mapsUrl: safeUrl(place.googleMapsUri) || mapsUrl(place.id),
    attributions: (Array.isArray(place.attributions) ? place.attributions : []).map(item => ({
      name: String(item.provider || ''), url: safeUrl(item.providerUri),
    })),
    businessStatus: place.businessStatus || 'UNKNOWN',
    retrievedAt: new Date().toISOString(),
  };
}

export function uniqueLeads(leads) {
  return [...new Map(leads.filter(Boolean).map(lead => [sourceKey(lead), lead])).values()];
}

export function matchesFilters(lead, filters, weights) {
  const scored = scoreLead(lead, weights);
  if (filters.website && filters.website !== 'all' && lead.websiteState !== filters.website) return false;
  if (filters.instagram && filters.instagram !== 'all' && lead.instagramState !== filters.instagram) return false;
  if (filters.phone && !lead.phone) return false;
  if (filters.whatsapp && lead.whatsappState !== 'identified') return false;
  if (filters.high && scored.level !== 'high') return false;
  if (filters.reviews === 'many' && !(lead.reviewCount >= 50)) return false;
  if (filters.reviews === 'few' && !(Number.isFinite(lead.reviewCount) && lead.reviewCount >= 0 && lead.reviewCount < 50)) return false;
  if (filters.minRating && !(Number.isFinite(lead.rating) && lead.rating >= Number(filters.minRating))) return false;
  const term = String(filters.term || '').toLocaleLowerCase('pt-BR').trim();
  return !term || `${lead.name} ${lead.category} ${lead.address || ''}`.toLocaleLowerCase('pt-BR').includes(term);
}

export function validateSearch(input) {
  const issues = [];
  const clean = (key, min, max) => {
    const value = typeof input?.[key] === 'string' ? input[key].trim().replace(/\s+/g, ' ') : '';
    if (value.length < min || value.length > max || /[\x00-\x1f\x7f]/.test(value)) issues.push(key);
    return value;
  };
  const state = clean('state', 2, 2).toUpperCase();
  const city = clean('city', 2, 100);
  const segment = clean('segment', 2, 100);
  const neighborhood = clean('neighborhood', 0, 100);
  if (!Object.hasOwn(STATES, state)) issues.push('state');
  const pageToken = typeof input?.pageToken === 'string' ? input.pageToken : '';
  if ((input?.pageToken != null && typeof input.pageToken !== 'string') || pageToken.length > 4096 || /[\x00-\x1f\x7f]/.test(pageToken)) issues.push('pageToken');
  return { valid: issues.length === 0, issues: [...new Set(issues)], value: { state, city, segment, neighborhood, ...(pageToken ? { pageToken } : {}) } };
}

// OSM data retains its license/source. Legacy Google content is never copied.
export function toSavedReference(lead, userId, favorite = false) {
  if (['openstreetmap','geoapify'].includes(lead.source)) {
    const keys = ['name','address','category','city','state','phone','website','websiteState','instagram','instagramState','whatsappCandidate','retrievedAt','registeredUrl','dataProvider','detailsChecked','latitude','longitude','osmRef'];
    return {
      source_provider: lead.source, source_id: lead.sourceId,
      source_snapshot: { source: lead.source, ...Object.fromEntries(keys.map(key => [key, lead[key] ?? null])) },
      created_by: userId, favorite, status: 'Novo',
    };
  }
  return { place_id: lead.placeId, created_by: userId, favorite, status: 'Novo' };
}

export function savedToLead(record) {
  const osm = record.source_provider === 'openstreetmap';
  const geo = record.source_provider === 'geoapify';
  const openData = osm || geo;
  const snapshot = openData ? record.source_snapshot || {} : {};
  const position = Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude)
    && Math.abs(snapshot.latitude)<=90 && Math.abs(snapshot.longitude)<=180;
  const attributedGeo = geo || snapshot.dataProvider === 'geoapify';
  const website = safeUrl(record.website || snapshot.website);
  const instagram = safeUrl(record.instagram || snapshot.instagram);
  const osmRef = /^(node|way|relation):([1-9]\d{0,19})$/.exec(osm ? record.source_id || '' : snapshot.osmRef || '');
  return {
    id: record.id, recordId: record.id, placeId: record.place_id, source: openData ? record.source_provider : 'owned', sourceId: record.source_id || null,
    name: record.company_name || snapshot.name || record.label || 'Oportunidade salva',
    address: snapshot.address || null,
    category: record.category || snapshot.category || 'Segmento não registrado', city: record.city || snapshot.city || '', state: record.state || snapshot.state || '',
    phone: record.contact_phone || snapshot.phone || null, website,
    websiteState: website ? 'identified' : snapshot.websiteState === 'not_identified' ? 'not_identified' : 'unverified',
    instagram, instagramState: instagram ? 'identified' : 'unverified',
    whatsappCandidate: snapshot.whatsappCandidate || null,
    registeredUrl: safeUrl(snapshot.registeredUrl),
    dataProvider: attributedGeo ? 'geoapify' : osm ? 'overpass' : null,
    osmRef: osmRef ? `${osmRef[1]}:${osmRef[2]}` : null,
    detailsChecked: snapshot.detailsChecked === true,
    latitude: position ? snapshot.latitude : null, longitude: position ? snapshot.longitude : null,
    attributions: openData ? [
      {name:OSM_ATTRIBUTION,url:OSM_LICENSE_URL},
      ...(attributedGeo ? [{name:'Powered by Geoapify',url:'https://www.geoapify.com/'}] : []),
    ] : [],
    whatsapp: record.whatsapp_confirmed ? record.whatsapp_phone : null,
    whatsappState: record.whatsapp_confirmed && record.whatsapp_phone ? 'identified' : 'unverified',
    mapsUrl: osmRef ? `https://www.openstreetmap.org/${osmRef[1]}/${osmRef[2]}` : geo && position
      ? `https://www.openstreetmap.org/?mlat=${snapshot.latitude}&mlon=${snapshot.longitude}#map=18/${snapshot.latitude}/${snapshot.longitude}`
      : record.place_id ? mapsUrl(record.place_id) : null,
    rating: null, reviewCount: null,
    opportunityConfirmed: record.opportunity_confirmed,
    opportunityEvidence: record.opportunity_evidence,
    record,
  };
}

export function csvCell(value) {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(records, weights = DEFAULT_WEIGHTS) {
  const headers = ['Empresa', 'Segmento', 'Cidade', 'Telefone', 'Instagram', 'Site', 'Pontuação VORKA', 'Status', 'Fonte', 'Licença / atribuição', 'Vendedor', 'Referência', 'Identificação interna'];
  const rows = records.map(record => {
    const owned = record.owned_data_source && record.owned_data_confirmed;
    const osm = ['openstreetmap','geoapify'].includes(record.source_provider);
    const lead = savedToLead(record);
    const geo = lead.dataProvider === 'geoapify';
    return [
      owned || osm ? lead.name : '', owned || osm ? lead.category : '',
      owned || osm ? lead.city : '', owned || osm ? lead.phone || '' : '',
      owned || osm ? lead.instagram || '' : '', owned || osm ? lead.website || '' : '',
      owned || osm ? scoreLead(lead, weights).score ?? '' : '', record.status,
      [osm ? geo ? 'OpenStreetMap via Geoapify' : 'OpenStreetMap' : '', owned ? record.owned_data_source : ''].filter(Boolean).join(' · '),
      osm ? `${OSM_ATTRIBUTION} · ODbL 1.0 · ${OSM_LICENSE_URL}${geo ? ' · Powered by Geoapify · https://www.geoapify.com/' : ''}` : '',
      record.created_by, record.source_id || record.place_id || '', record.label || '',
    ];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
}
