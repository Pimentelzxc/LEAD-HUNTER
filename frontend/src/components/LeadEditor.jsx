import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { unwrap } from '../lib/data.js';
import { Button, Drawer, Field, Notice, useToast } from './ui.jsx';
import { safeUrl, STATES } from '@vorka/shared';

export function LeadEditor({ record, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState({
    label: record?.label || '', company_name: record?.company_name || '', category: record?.category || '',
    city: record?.city || '', state: record?.state || '', contact_phone: record?.contact_phone || '',
    website: record?.website || '', instagram: record?.instagram || '', whatsapp_phone: record?.whatsapp_phone || '',
    whatsapp_confirmed: record?.whatsapp_confirmed || false,
    opportunity_confirmed: record?.opportunity_confirmed || false, opportunity_evidence: record?.opportunity_evidence || '',
    owned_data_source: record?.owned_data_source || '', owned_data_confirmed: record?.owned_data_confirmed || false,
  });
  const [error, setError] = useState('');
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const mutation = useMutation({
    mutationFn: patch => record
      ? unwrap(supabase.from('leads').update(patch).eq('id', record.id).select().single())
      : unwrap(supabase.from('leads').insert({ ...patch, created_by: user.id }).select().single()),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['leads', user.id] }); toast(record ? 'Informações atualizadas.' : 'Lead cadastrado.'); onClose(); },
    onError: error => setError(error.message),
  });
  const submit = event => {
    event.preventDefault(); setError('');
    if (!user) { setError('Configure o Supabase e entre na sua conta para salvar.'); return; }
    const patch = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]));
    if (!patch.company_name && !record?.place_id) { setError('Informe o nome da empresa.'); return; }
    if (patch.website && !safeUrl(patch.website)) { setError('Informe um site válido começando com https:// ou http://.'); return; }
    if (patch.instagram && !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(patch.instagram)) { setError('Use o endereço completo do perfil, como https://www.instagram.com/perfil/.'); return; }
    if (patch.whatsapp_phone) patch.whatsapp_phone = patch.whatsapp_phone.replace(/\D/g, '');
    if (patch.whatsapp_phone && !/^\d{10,15}$/.test(patch.whatsapp_phone)) { setError('Informe o WhatsApp com código do país e DDD (10 a 15 dígitos).'); return; }
    if (patch.whatsapp_confirmed && !patch.whatsapp_phone) { setError('Informe o número de WhatsApp que foi confirmado.'); return; }
    if (patch.opportunity_confirmed && (!patch.opportunity_evidence || patch.opportunity_evidence.length < 5)) { setError('Descreva a evidência da oportunidade confirmada.'); return; }
    const hasOwnData = ['company_name', 'category', 'city', 'state', 'contact_phone', 'website', 'instagram', 'whatsapp_phone'].some(key => patch[key]) || patch.opportunity_confirmed;
    if (hasOwnData && (!patch.owned_data_confirmed || !patch.owned_data_source || patch.owned_data_source.length < 3)) { setError('Informe a fonte dos dados e confirme que você pode armazená-los.'); return; }
    mutation.mutate(patch);
  };
  return <Drawer title={record ? 'Editar oportunidade' : 'Cadastrar lead'} subtitle="SUA CARTEIRA COMERCIAL" onClose={onClose}>
    <p className="section-description">Registre informações confirmadas diretamente com a empresa. Elas complementam o cadastro da fonte, preservado separadamente.</p>
    <form className="stack-form" onSubmit={submit}>
      <Field label="Identificação interna (opcional)">{id => <input id={id} value={form.label} onChange={event => change('label', event.target.value)} maxLength={150} placeholder="Ex.: Retornar na sexta-feira" />}</Field>
      <Field label="Nome da empresa">{id => <input id={id} value={form.company_name} onChange={event => change('company_name', event.target.value)} maxLength={180} required={!record?.place_id} placeholder="Nome confirmado pela empresa" />}</Field>
      <Field label="Segmento">{id => <input id={id} value={form.category} onChange={event => change('category', event.target.value)} maxLength={100} placeholder="Ex.: Barbearia" />}</Field>
      <div className="form-two-col"><Field label="Cidade">{id => <input id={id} value={form.city} onChange={event => change('city', event.target.value)} maxLength={100} />}</Field><Field label="Estado">{id => <select id={id} value={form.state} onChange={event => change('state', event.target.value)}><option value="">Selecione</option>{Object.entries(STATES).map(([uf, name]) => <option key={uf} value={uf}>{name}</option>)}</select>}</Field></div>
      <Field label="Telefone comercial">{id => <input id={id} type="tel" value={form.contact_phone} onChange={event => change('contact_phone', event.target.value)} maxLength={40} placeholder="+55 41 0000-0000" />}</Field>
      <Field label="Site">{id => <input id={id} type="url" value={form.website} onChange={event => change('website', event.target.value)} maxLength={2048} placeholder="https://" />}</Field>
      <Field label="Instagram confirmado">{id => <input id={id} type="url" value={form.instagram} onChange={event => change('instagram', event.target.value)} maxLength={2048} placeholder="https://www.instagram.com/perfil/" />}</Field>
      <Field label="Número de WhatsApp (opcional)">{id => <input id={id} type="tel" value={form.whatsapp_phone} onChange={event => change('whatsapp_phone', event.target.value)} maxLength={25} placeholder="5541999999999" />}</Field>
      <label className="checkbox-label"><input type="checkbox" checked={form.whatsapp_confirmed} onChange={event => change('whatsapp_confirmed', event.target.checked)} />Confirmei que este número tem WhatsApp.</label>
      <div className="form-divider" />
      <label className="checkbox-label"><input type="checkbox" checked={form.opportunity_confirmed} onChange={event => change('opportunity_confirmed', event.target.checked)} />Identifiquei uma oportunidade comercial concreta.</label>
      {form.opportunity_confirmed && <Field label="Evidência da oportunidade">{id => <textarea id={id} value={form.opportunity_evidence} onChange={event => change('opportunity_evidence', event.target.value)} minLength={5} maxLength={1000} required placeholder="Ex.: O proprietário informou que precisa de um sistema de agendamento." />}</Field>}
      <Field label="Fonte dos dados" hint="Ex.: Contato direto com o proprietário em 29/10/2026. Informe a origem da confirmação independente.">{id => <textarea id={id} value={form.owned_data_source} onChange={event => change('owned_data_source', event.target.value)} maxLength={500} placeholder="Como você obteve e confirmou essas informações?" />}</Field>
      <label className="checkbox-label"><input type="checkbox" checked={form.owned_data_confirmed} onChange={event => change('owned_data_confirmed', event.target.checked)} />Os dados foram obtidos de forma independente e tenho autorização para armazená-los e exportá-los.</label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!user} loading={mutation.isPending}><Save size={16} />Salvar informações</Button></div>
    </form>
  </Drawer>;
}
