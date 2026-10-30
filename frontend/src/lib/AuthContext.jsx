import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session); setLoading(false);
      if (sessionError) setError('Sua sessão não pôde ser recuperada. Entre novamente.');
    }).catch(() => { if (active) { setLoading(false); setError('Não foi possível carregar sua sessão.'); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next); setLoading(false);
      if (!next) queryClient.clear();
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    queryClient.clear();
  };
  return <AuthContext.Provider value={{ session, user: session?.user || null, loading, error, signOut }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
