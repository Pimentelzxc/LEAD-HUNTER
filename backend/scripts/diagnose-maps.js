import { performance } from 'node:perf_hooks';
import { overpassEndpoint, overpassHeaders } from '../lib/provider-config.js';
import { createGeoapifyClient, mapsProvider, GeoapifyError } from '../lib/geoapify.js';

// Explicit local diagnostic: one tiny query, no Supabase token or user data.
const start = performance.now();
try {
  if (mapsProvider() === 'geoapify') {
    console.log('Servidor: api.geoapify.com');
    console.log('Validando a chave com uma consulta de municipio (usa ate 1 credito)...');
    const client = createGeoapifyClient();
    await client.city({state:'PR',city:'Fazenda Rio Grande'});
    console.log(`Geoapify respondeu em ${((performance.now()-start)/1000).toFixed(1)}s. Chave e consulta de municipio validadas.`);
  } else {
  const endpoint = overpassEndpoint();
  console.log(`Servidor: ${endpoint.hostname}`);
  console.log('Testando uma consulta minima, sem busca de empresas...');
  const response = await fetch(endpoint, {
    method: 'POST', headers: overpassHeaders(),
    body: new URLSearchParams({ data: '[out:json][timeout:3][maxsize:1048576];out count;' }),
    signal: AbortSignal.timeout(10_000),
  });
  const elapsed = (performance.now() - start) / 1000;
  console.log(`HTTP ${response.status} em ${elapsed.toFixed(1)}s`);
  if (!response.ok) {
    await response.body?.cancel();
    console.log(response.status === 429 ? 'O provedor esta limitando consultas. Respeite a pausa antes de testar novamente.' : 'A API do provedor esta indisponivel ou rejeitou a consulta.');
    process.exitCode = 1;
  } else {
    const data = await response.json();
    if (!Array.isArray(data.elements) || data.remark) { console.log('A resposta do provedor foi incompleta ou invalida.'); process.exitCode = 1; }
    else console.log('Conexao com a API confirmada. O teste nao altera o banco.');
  }
  }
} catch (error) {
  if (error instanceof GeoapifyError) console.log(`${error.code}: ${error.message}`);
  else if (['TimeoutError','AbortError'].includes(error?.name)) console.log('SEM RESPOSTA em 10s. Ate a consulta minima falhou; nao e necessario alterar o SQL ou a chave do Supabase.');
  else if (error.message === 'INVALID_OVERPASS_URL' || error.code === 'ERR_INVALID_URL') console.log('OVERPASS_API_URL invalida. Use uma URL HTTPS sem usuario/senha.');
  else console.log(`Falha de rede: ${error.cause?.code || error.code || 'conexao indisponivel'}. Verifique DNS, conectividade e o provedor.`);
  process.exitCode = 1;
}
