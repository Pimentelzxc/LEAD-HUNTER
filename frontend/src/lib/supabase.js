import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(url && key && !url.includes('seu-projeto') && !key.includes('sua-chave'));
export const supabase = isConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export async function callPlaces(body) {
  if (!supabase) throw new Error('Configure o Supabase para realizar buscas reais.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Entre na sua conta para buscar oportunidades.');
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/api/places`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(50_000),
    });
  } catch { throw new Error('Não foi possível acessar o back-end. Confira se ele está ativo e se VITE_API_URL e ALLOWED_ORIGINS estão corretos.'); }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('O back-end não retornou JSON. Confira a URL da API e o deploy.'); }
  if (!response.ok) throw new Error(payload.message || 'Não foi possível consultar o OpenStreetMap.');
  return payload;
}
