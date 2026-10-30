import { STATES } from '@vorka/shared';
import { geoapifyCategory,findGeoapifyCity,normalizeGeoapify,normalizeGeoapifySearch,isGeoapifyId } from '@vorka/shared/geoapify';
import { parseOsmId } from '@vorka/shared/osm';

export class GeoapifyError extends Error {
  constructor(status,code,message,retryAfter=null){super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}
}

export function mapsProvider(env=process.env){
  const choice=String(env.MAPS_PROVIDER||'auto').trim().toLowerCase();
  if(!['auto','overpass','geoapify'].includes(choice))throw new GeoapifyError(503,'PROVIDER_CONFIGURATION','MAPS_PROVIDER deve ser auto, overpass ou geoapify.');
  return choice==='auto'?(env.GEOAPIFY_API_KEY?.trim()?'geoapify':'overpass'):choice;
}

export function createGeoapifyClient({env=process.env,fetcher=fetch,now=Date.now}={}){
  const cache=new Map(),pending=new Map();let retryAt=0;
  function assertAvailable(){
    if(!env.GEOAPIFY_API_KEY?.trim())throw new GeoapifyError(503,'GEOAPIFY_KEY_REQUIRED','Adicione GEOAPIFY_API_KEY no ambiente do back-end e reinicie o servidor. A chave é criada no plano Free da Geoapify.');
    if(retryAt>now()){
      const seconds=Math.max(1,Math.ceil((retryAt-now())/1000));
      throw new GeoapifyError(503,'PROVIDER_COOLDOWN',`O provedor de mapas está indisponível. Aguarde ${seconds} segundos antes de tentar novamente.`,seconds);
    }
  }
  async function request(path,params,ttl=15*60_000){
    const cacheKey=path+'?'+new URLSearchParams(params);
    const hit=cache.get(cacheKey);if(hit&&hit.expires>now())return hit.data;
    if(pending.has(cacheKey))return pending.get(cacheKey);
    assertAvailable();
    const operation=(async()=>{
      const url=new URL(path,'https://api.geoapify.com');
      for(const [key,value]of Object.entries(params))url.searchParams.set(key,String(value));
      url.searchParams.set('apiKey',env.GEOAPIFY_API_KEY.trim());
      let response;
      try{response=await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15_000)});}
      catch(error){
        retryAt=now()+30_000;
        throw new GeoapifyError(504,'GEOAPIFY_UNREACHABLE','A Geoapify não respondeu. Confira a conexão e tente novamente após 30 segundos.',30);
      }
      if(!response.ok){
        const status=response.status;
        const seconds=Number(response.headers.get('retry-after'));
        const wait=Number.isFinite(seconds)&&seconds>0?Math.min(3600,Math.max(30,Math.ceil(seconds))):30;
        await response.body?.cancel();
        if(status===401||status===403)throw new GeoapifyError(503,'GEOAPIFY_KEY_INVALID','A Geoapify recusou a chave. Confira GEOAPIFY_API_KEY e as restrições da chave no painel do provedor.');
        if(status===429){retryAt=now()+wait*1000;throw new GeoapifyError(429,'GEOAPIFY_LIMIT','O limite da conta Geoapify foi atingido. Aguarde a renovação da franquia ou revise o uso no painel; não é necessário contratar um plano pago.',wait);}
        if(status===400)throw new GeoapifyError(502,'GEOAPIFY_QUERY_ERROR','O provedor recusou os parâmetros de busca. Informe cidade e segmento ao administrador.');
        retryAt=now()+wait*1000;throw new GeoapifyError(502,'GEOAPIFY_ERROR','A Geoapify está indisponível no momento.',wait);
      }
      let data;
      try{
        const reader=response.body?.getReader();if(!reader)throw Error('EMPTY');
        const chunks=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('TOO_LARGE');}chunks.push(Buffer.from(value));}
        data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }catch{throw new GeoapifyError(502,'GEOAPIFY_RESPONSE_ERROR','A Geoapify não retornou uma resposta completa e válida.');}
      retryAt=0;
      if(cache.size>=50)cache.delete(cache.keys().next().value);
      cache.set(cacheKey,{data,expires:now()+ttl});return data;
    })();
    pending.set(cacheKey,operation);try{return await operation;}finally{pending.delete(cacheKey);}
  }
  async function city(query){
    const data=await request('/v1/geocode/search',{city:query.city,state:STATES[query.state],country:'Brazil',filter:'countrycode:br',type:'city',format:'json',lang:'pt',limit:5},60*60_000);
    const result=findGeoapifyCity(data,query);
    if(!result)throw new GeoapifyError(422,'CITY_NOT_FOUND','O município não foi localizado com a UF informada. Confira o nome da cidade e o estado.');
    return result;
  }
  async function search(query){
    const boundary=await city(query),spec=geoapifyCategory(query.segment);
    const data=await request('/v2/places',{categories:spec.categories,filter:`place:${boundary.place_id}`,limit:100,lang:'pt',...(spec.name?{name:spec.name}:{})});
    if(!Array.isArray(data?.features))throw new GeoapifyError(502,'GEOAPIFY_RESPONSE_ERROR','O provedor retornou um formato de resultados inesperado.');
    return normalizeGeoapifySearch(data,query,spec.mode);
  }
  async function details(sourceId,sourceProvider='geoapify',expectedOsmRef=null){
    const osm=sourceProvider==='openstreetmap'?parseOsmId(sourceId):null;
    if(!osm&&!isGeoapifyId(sourceId))throw new GeoapifyError(400,'INVALID_SOURCE_ID','Identificador de estabelecimento inválido.');
    const data=await request('/v2/place-details',{...(osm?{osm_id:osm.id,osm_type:osm.type[0]}:{id:sourceId}),features:'details',lang:'pt'});
    if(!Array.isArray(data?.features))throw new GeoapifyError(502,'GEOAPIFY_RESPONSE_ERROR','O provedor retornou um formato de detalhes inesperado.');
    // Match the requested ID instead of silently choosing a related feature.
    const primary=data.features.filter(item=>item.properties?.feature_type==='details');
    const feature=data.features.find(item=>item.properties?.place_id===sourceId)
      || (primary.length===1?primary[0]:null)
      || (osm&&data.features.length===1?data.features[0]:null);
    let lead=normalizeGeoapify(feature,{details:true});
    if(lead && expectedOsmRef && lead.osmRef!==expectedOsmRef)throw new GeoapifyError(502,'GEOAPIFY_ID_MISMATCH','A fonte retornou detalhes de um identificador diferente. Os dados não foram aplicados.');
    // Search and Details can encode different Geoapify IDs for the same OSM
    // element. Keep the caller's stable reference, using the primary details
    // feature and checking the OSM reference when the search supplied one.
    if(lead&&!osm)lead={...lead,id:`geoapify:${sourceId}`,sourceId};
    return osm&&lead?{...lead,id:`osm:${sourceId}`,source:'openstreetmap',sourceId,mapsUrl:`https://www.openstreetmap.org/${osm.type}/${osm.id}`}:lead;
  }
  return {assertAvailable,search,details,city};
}
