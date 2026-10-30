import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase.js';
import { useAuth } from './AuthContext.jsx';
import { DEFAULT_WEIGHTS, toSavedReference, validateWeights } from '@vorka/shared';

async function unwrap(request) {
  const { data, error } = await request;
  if (error) {
    if (error.code === '23505') throw new Error('Esta oportunidade já está nos seus leads.');
    throw new Error(error.message || 'Não foi possível concluir a operação.');
  }
  return data;
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id], enabled: Boolean(user && supabase),
    queryFn: () => unwrap(supabase.from('profiles').select('*').eq('id', user.id).single()),
  });
}

export function useWeights() {
  const { data } = useProfile();
  return validateWeights(data?.score_weights) ? data.score_weights : DEFAULT_WEIGHTS;
}

export function useLeads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['leads', user?.id], enabled: Boolean(user && supabase),
    queryFn: () => unwrap(supabase.from('leads').select('*').order('created_at', { ascending: false })),
  });
}

export function useSaveLead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lead, favorite = false }) => {
      if (!user) throw new Error('Entre na sua conta para salvar oportunidades.');
      return unwrap(supabase.from('leads').insert(toSavedReference(lead, user.id, favorite)).select().single());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads', user?.id] }),
  });
}

export function useUpdateLead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => unwrap(supabase.from('leads').update(patch).eq('id', id).select().single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads', user?.id] }),
  });
}

export function useNotes(leadId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notes', user?.id, leadId], enabled: Boolean(user && leadId),
    queryFn: () => unwrap(supabase.from('lead_notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
  });
}

export { unwrap };
