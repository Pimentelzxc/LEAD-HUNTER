import { mapsProvider } from '../lib/geoapify.js';
export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  try {
    const provider = mapsProvider();
    res.end(JSON.stringify({ ok: true, provider, configured: provider !== 'geoapify' || Boolean(process.env.GEOAPIFY_API_KEY?.trim()), version: '1.2.0' }));
  } catch { res.statusCode = 503; res.end(JSON.stringify({ok:false,message:'Configuração do provedor inválida.'})); }
}
