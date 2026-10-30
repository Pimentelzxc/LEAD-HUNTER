import { createClient } from '@supabase/supabase-js';
import { validateSearch } from '@vorka/shared';
import { buildSearchQuery, buildDetailQuery, parseOsmId, normalizeOsm, normalizeSearchResult } from '@vorka/shared/osm';
import { overpassEndpoint, overpassHeaders } from './provider-config.js';
import { createGeoapifyClient, GeoapifyError, mapsProvider } from './geoapify.js';
import { isGeoapifyId } from '@vorka/shared/geoapify';

class PublicError extends Error {
  constructor(status, code, message, retryAfter = null) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

async function readJson(req) {
  const limit = 12_000;
  if (Number(req.headers['content-length'] || 0) > limit) throw new PublicError(413, 'BODY_TOO_LARGE', 'Solicitação muito grande.');
  if (req.body !== undefined) {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(text) > limit) throw new PublicError(413, 'BODY_TOO_LARGE', 'Solicitação muito grande.');
    try { return JSON.parse(text); } catch { throw new PublicError(400, 'INVALID_BODY', 'JSON inválido.'); }
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > limit) throw new PublicError(413, 'BODY_TOO_LARGE', 'Solicitação muito grande.');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PublicError(400, 'INVALID_BODY', 'Envie um corpo JSON válido.'); }
}

async function readProviderJson(response) {
  // A broken upstream must not allocate an unbounded response in a serverless worker.
  const reader = response.body?.getReader();
  if (!reader) throw new PublicError(502, 'INVALID_PROVIDER_RESPONSE', 'O servidor de mapas retornou uma resposta vazia.');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new PublicError(502, 'PROVIDER_RESPONSE_LIMIT', 'Esta consulta retornou dados demais. Restrinja a região ou o segmento.'); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PublicError(502, 'INVALID_PROVIDER_RESPONSE', 'O servidor de mapas retornou uma resposta inválida.'); }
}

// Dependencies are injectable only in tests. No paid-provider fallback exists.
export function createPlacesHandler({ env = process.env, fetcher = fetch, clientFactory = createClient, now = Date.now } = {}) {
  const cache = new Map();
  const inflight = new Map();
  const geoapify = createGeoapifyClient({ env, fetcher, now });
  let providerRetryAt = 0;
  function assertAvailable(query) {
    if (cache.get(query)?.expires > now()) return;
    if (providerRetryAt > now()) {
      const seconds = Math.max(1, Math.ceil((providerRetryAt - now()) / 1000));
      throw new PublicError(503, 'PROVIDER_COOLDOWN', `O servidor de mapas está temporariamente indisponível. Aguarde ${seconds} segundos antes de tentar novamente.`, seconds);
    }
  }
  async function overpass(query) {
    const cached = cache.get(query);
    if (cached && cached.expires > now()) return cached.data;
    if (inflight.has(query)) return inflight.get(query);
    assertAvailable(query);
    const pending = (async () => {
      let endpoint;
      try { endpoint = overpassEndpoint(env); }
      catch { throw new PublicError(503, 'PROVIDER_CONFIGURATION', 'Configure uma URL HTTPS válida para o Overpass no back-end.'); }
      let response;
      try {
        response = await fetcher(endpoint.href, {
          method: 'POST', headers: overpassHeaders(env),
          body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(32_000),
        });
      } catch (error) {
        providerRetryAt = now() + 30_000;
        if (['TimeoutError','AbortError'].includes(error?.name)) throw new PublicError(504, 'PROVIDER_TIMEOUT', 'O servidor de mapas não respondeu dentro de 32 segundos. A busca não foi concluída. Aguarde 30 segundos antes de tentar novamente.', 30);
        throw new PublicError(503, 'PROVIDER_UNREACHABLE', 'O servidor de mapas está inacessível no momento. Aguarde 30 segundos; se persistir, informe o administrador.', 30);
      }
      if (!response.ok) {
        const retrySeconds = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(3600, Math.max(30, Math.ceil(retrySeconds))) : 30;
        if (response.status === 429 || response.status >= 500) providerRetryAt = now() + wait * 1000;
        await response.body?.cancel();
        if (response.status === 429) throw new PublicError(429, 'PROVIDER_LIMIT', `O servidor de mapas limitou as consultas. Aguarde ${wait} segundos antes de tentar novamente.`, wait);
        if (response.status === 504) throw new PublicError(504, 'PROVIDER_TIMEOUT', 'O servidor público informou que a consulta excedeu o tempo disponível. Aguarde antes de tentar novamente.', wait);
        if (response.status === 400) throw new PublicError(502, 'PROVIDER_QUERY_ERROR', 'O servidor de mapas rejeitou a consulta. Informe o segmento e a cidade ao administrador para revisão.');
        throw new PublicError(502, 'PROVIDER_ERROR', 'O servidor de mapas está indisponível no momento. Nenhum resultado foi carregado.', response.status >= 500 ? wait : null);
      }
      let data;
      try { data = await readProviderJson(response); }
      catch (error) {
        if (['TimeoutError','AbortError'].includes(error?.name)) {
          providerRetryAt = now() + 30_000;
          throw new PublicError(504, 'PROVIDER_TIMEOUT', 'O servidor de mapas começou a responder, mas não terminou o envio dos dados. Aguarde antes de tentar novamente.', 30);
        }
        throw error;
      }
      if (!Array.isArray(data?.elements)) throw new PublicError(502, 'INVALID_PROVIDER_RESPONSE', 'O servidor público retornou um formato inesperado.');
      if (data.remark) throw new PublicError(502, 'PARTIAL_PROVIDER_RESPONSE', 'O servidor público não concluiu a consulta. Nenhum resultado parcial foi apresentado; tente novamente mais tarde.');
      providerRetryAt = 0;
      cache.delete(query);
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(query, { data, expires: now() + 15 * 60_000 });
      return data;
    })();
    inflight.set(query, pending);
    try { return await pending; } finally { inflight.delete(query); }
  }

  return async function handler(req, res) {
    const allowed = (env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean);
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    const respond = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (origin && !allowed.includes(origin)) throw new PublicError(403, 'ORIGIN_DENIED', 'Origem não autorizada. Cadastre o domínio do front-end em ALLOWED_ORIGINS no back-end.');
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); throw new PublicError(405, 'METHOD_NOT_ALLOWED', 'Utilize POST.'); }
      const match = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
      if (!match) throw new PublicError(401, 'UNAUTHORIZED', 'Entre na sua conta para continuar.');
      const url = env.SUPABASE_URL;
      const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
      if (!url || !key || url.includes('seu-projeto') || key.includes('sua-chave')) throw new PublicError(503, 'NOT_CONFIGURED', 'Configure a URL e a chave publicável do Supabase no back-end.');
      const client = clientFactory(url, key, {
        global: { headers: { Authorization: `Bearer ${match[1]}` } }, auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: authError } = await client.auth.getUser(match[1]);
      if (authError || !user || user.is_anonymous) throw new PublicError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.');
      const { data: profile, error: profileError } = await client.from('profiles').select('id').eq('id', user.id).single();
      if (profileError || !profile) throw new PublicError(403, 'PROFILE_REQUIRED', 'Seu acesso precisa ser provisionado no Supabase.');
      const input = await readJson(req);
      const provider = mapsProvider(env);
      const useGeoapify = provider === 'geoapify' || input?.sourceProvider === 'geoapify';
      let query; let context; let mode;
      if (input?.action === 'search') {
        const validation = validateSearch(input);
        if (!validation.valid || input.pageToken) throw new PublicError(400, 'INVALID_SEARCH', 'Informe estado, cidade e segmento válidos. A paginação desta fonte acontece no navegador.');
        context = validation.value;
        const built = buildSearchQuery(context); query = built.text; mode = built.mode;
      } else if (input?.action === 'details') {
        if (input.sourceProvider === 'geoapify') {
          // These are public business details, never another seller's CRM data.
          // Auth, ID validation and the same global quota protect this lookup.
          if (!isGeoapifyId(input.sourceId)) throw new PublicError(400, 'INVALID_SOURCE_ID', 'Identificador Geoapify inválido.');
          if (input.osmRef != null && !parseOsmId(input.osmRef)) throw new PublicError(400, 'INVALID_SOURCE_ID', 'Referência OSM inválida.');
        } else {
        if (!parseOsmId(input.sourceId)) throw new PublicError(400, 'INVALID_SOURCE_ID', 'Identificador OpenStreetMap inválido.');
        const { data: record, error } = await client.from('leads').select('id, source_snapshot')
          .eq('source_provider', 'openstreetmap').eq('source_id', input.sourceId).limit(1).maybeSingle();
        if (error || !record) throw new PublicError(404, 'NOT_FOUND', 'Oportunidade não encontrada na sua carteira.');
        query = buildDetailQuery(input.sourceId);
        }
        // A fresh element without address tags remains without a confirmed address.
      } else throw new PublicError(400, 'INVALID_ACTION', 'Ação inválida.');

      // Do not spend another application quota just to repeat a known outage.
      if (useGeoapify) geoapify.assertAvailable(); else assertAvailable(query);
      const { error: quotaError } = await client.rpc('consume_osm_quota');
      if (quotaError) {
        if (quotaError.message.includes('OSM_QUOTA')) throw new PublicError(429, 'RATE_LIMITED', 'Limite de consultas atingido. Aguarde antes de tentar novamente (3/min e 30/dia por vendedor; 6/min e 100/dia no workspace).');
        throw new PublicError(503, 'QUOTA_UNAVAILABLE', 'Aplique a migração 202610290002_openstreetmap.sql no Supabase para habilitar a busca gratuita.');
      }
      if (useGeoapify) {
        if (input.action === 'search') return respond(await geoapify.search(context));
        return respond({ lead: await geoapify.details(input.sourceId,input.sourceProvider || 'openstreetmap',input.osmRef || null), source: 'geoapify' });
      }
      const data = await overpass(query);
      if (input.action === 'search') {
        const result = normalizeSearchResult(data, context, mode);
        if (!result.boundaryFound) throw new PublicError(422, 'CITY_NOT_FOUND', 'O município não foi localizado na base OpenStreetMap. Confira a cidade e o estado.');
        respond(result);
      } else {
        const ref = parseOsmId(input.sourceId);
        const element = data.elements.find(item => item.type === ref.type && String(item.id) === ref.id);
        respond({ lead: normalizeOsm(element), source: 'openstreetmap' });
      }
    } catch (error) {
      if (error instanceof PublicError || error instanceof GeoapifyError) {
        if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
        return respond({ code: error.code, message: error.message, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, error.status);
      }
      if (['TimeoutError','AbortError'].includes(error?.name)) return respond({ code: 'TIMEOUT', message: 'O serviço gratuito demorou para responder. Tente novamente mais tarde.' }, 504);
      return respond({ code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a consulta. Verifique a conexão e a configuração do back-end.' }, 500);
    }
  };
}
