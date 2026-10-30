import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Check, ExternalLink as ExternalIcon, Globe2, Instagram, MapPin, MessageCircle, Pencil, Phone, RefreshCw, Send, Star } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { callPlaces, supabase } from '../lib/supabase.js';
import { useNotes, useSaveLead, useUpdateLead, useWeights, unwrap } from '../lib/data.js';
import { scoreLead, savedToLead, phoneHref, STATUSES, OSM_ATTRIBUTION, OSM_LICENSE_URL, toSavedReference } from '@vorka/shared';
import { Button, ChannelBadge, Drawer, ExternalLink, Field, Notice, ScoreBadge, useToast } from './ui.jsx';
import { LeadEditor } from './LeadEditor.jsx';

export function LeadDetail({ lead: original, record, onClose, onRefresh }) {
  const [fresh, setFresh] = useState(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sourceSaved, setSourceSaved] = useState(false);
  const toast = useToast();
  const client = useQueryClient();
  const { user } = useAuth();
  const weights = useWeights();
  const save = useSaveLead();
  const update = useUpdateLead();
  const notes = useNotes(record?.id);
  const lead = ['openstreetmap','geoapify'].includes(record?.source_provider)
    ? savedToLead({ ...record, source_snapshot: fresh || (original.recordId ? record.source_snapshot : original) })
    : fresh || (original.recordId && record ? savedToLead(record) : original);
  const analysis = scoreLead({ ...lead, opportunityConfirmed: record?.opportunity_confirmed, opportunityEvidence: record?.opportunity_evidence }, weights);
  const refresh = useMutation({
    mutationFn: () => callPlaces({ action: 'details', sourceId: record?.source_id || lead.sourceId, sourceProvider: record?.source_provider || lead.source, osmRef: lead.osmRef || undefined }), retry: false,
    onSuccess: data => { if (data.lead) { setFeedback(''); setSourceSaved(false); setFresh(data.lead); onRefresh?.(data.lead); } else setFeedback('Estabelecimento indisponível nesta fonte.'); },
    onError: error => setFeedback(error.message),
  });
  const addNote = useMutation({
    mutationFn: () => unwrap(supabase.from('lead_notes').insert({ lead_id: record.id, user_id: user.id, note: note.trim() })),
    onSuccess: () => { setNote(''); client.invalidateQueries({ queryKey: ['notes', user.id, record.id] }); toast('Observação adicionada.'); },
    onError: error => setFeedback(error.message),
  });
  const change = async patch => {
    try { await update.mutateAsync({ id: record.id, patch }); }
    catch (error) { setFeedback(error.message); }
  };
  const telephone = phoneHref(lead.phone);
  return <>
    <Drawer title={lead.name} subtitle="DETALHES DA OPORTUNIDADE" onClose={onClose}>
      {feedback && <Notice tone="error">{feedback}</Notice>}
      <div className="detail-summary"><span className="company-avatar large">{lead.name.slice(0, 2).toUpperCase()}</span><div><strong>{lead.category}</strong><p>{lead.address || [lead.city, lead.state].filter(Boolean).join(' · ') || 'Localização não consultada'}</p></div>{record && <button className={`icon-btn ${record.favorite ? 'is-favorite' : ''}`} onClick={() => change({ favorite: !record.favorite })} disabled={update.isPending} aria-label={record.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}><Star size={20} fill={record.favorite ? 'currentColor' : 'none'} /></button>}</div>
      <div className="detail-score"><div><div className="eyebrow">POTENCIAL COMERCIAL</div><h3 className={`text-${analysis.level}`}>{analysis.label}</h3><p>Critérios VORKA · não é uma nota da empresa.</p></div><ScoreBadge analysis={analysis} /></div>
      <div className="score-breakdown">{analysis.criteria.map(criterion => <div key={criterion.key}><div><span>{criterion.label}</span><strong>+{criterion.points}<small>/{criterion.max}</small></strong></div><div className="progress-track"><span style={{ width: `${criterion.max ? criterion.points / criterion.max * 100 : 0}%` }} /></div><p>{criterion.evidence}</p></div>)}</div>
      <p className="detail-disclaimer">A pontuação prioriza canais disponíveis para contato e uma necessidade comercial confirmada. Informação ausente não comprova deficiência e não adiciona pontos. Não são usadas notas ou avaliações Google.</p>
      <div className="detail-section"><h3>Presença digital e contato</h3><div className="detail-channel"><Globe2 size={18} /><div><strong>Site</strong><ChannelBadge state={lead.websiteState} /></div>{lead.website && <ExternalLink href={lead.website}>Abrir site</ExternalLink>}</div>
        {lead.registeredUrl && lead.registeredUrl !== lead.website && <p className="detail-disclaimer">A fonte retornou um link de rede social no campo de site. <ExternalLink href={lead.registeredUrl}>Ver link cadastrado</ExternalLink></p>}
        <div className="detail-channel"><Instagram size={18} /><div><strong>Instagram</strong><ChannelBadge state={lead.instagramState} channel="Instagram" /></div>{lead.instagram && <ExternalLink href={lead.instagram}>Abrir perfil</ExternalLink>}</div>
        <div className="detail-channel"><Phone size={18} /><div><strong>Telefone comercial</strong><span>{lead.phone || 'Não identificado'}</span></div>{telephone && <a href={telephone} className="text-btn">Ligar<Phone size={13} /></a>}</div>
        <div className="detail-channel"><MessageCircle size={18} /><div><strong>WhatsApp</strong><span>{lead.whatsappState === 'identified' ? 'Confirmado em fonte própria' : 'Não verificado'}</span></div>{lead.whatsappState === 'identified' && /^\d{10,15}$/.test(lead.whatsapp) && <ExternalLink href={`https://wa.me/${lead.whatsapp}`}>Conversar</ExternalLink>}</div>
        {['openstreetmap','geoapify'].includes(lead.source) && <p className="detail-disclaimer">Dados abertos do OpenStreetMap{lead.dataProvider === 'geoapify' ? ' via Geoapify' : ''}. Confira a titularidade dos perfis antes de usar. {lead.whatsappCandidate ? 'A base informa o número ' + lead.whatsappCandidate + ' para WhatsApp, mas ele ainda não foi confirmado.' : 'Um telefone não implica WhatsApp.'}</p>}
      </div>
      {['openstreetmap','geoapify'].includes(lead.source) && <div className="source-info-block"><span>Dados colaborativos · sem avaliações Google</span><a className="source-attribution" href={OSM_LICENSE_URL} target="_blank" rel="noopener noreferrer">{OSM_ATTRIBUTION} · ODbL</a></div>}
      {lead.mapsUrl && <a className="btn btn-secondary full-width" href={lead.mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={16} />{['openstreetmap','geoapify'].includes(lead.source) ? 'Ver no OpenStreetMap' : 'Ver no Google Maps'}<ExternalIcon size={14} /></a>}
      {(lead.source === 'geoapify' || record?.source_provider === 'openstreetmap') && <Button variant="secondary" className="full-width refresh-button" loading={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw size={15} />Consultar contatos e canais<span className="button-meta">Consulta manual</span></Button>}
      {fresh && record && !sourceSaved && <Button variant="secondary" className="full-width refresh-button" loading={update.isPending} onClick={async()=>{
        try { await update.mutateAsync({id:record.id,patch:{source_snapshot:toSavedReference(fresh,user.id).source_snapshot}}); setSourceSaved(true); setFeedback(''); }
        catch(error){setFeedback(error.message);}
      }}><Bookmark size={15} />Salvar atualização da fonte</Button>}
      {sourceSaved && <Notice>Cadastro da fonte atualizado na carteira. Suas informações comerciais próprias foram preservadas.</Notice>}
      {lead.attributions?.map((item, index) => <p className="detail-disclaimer" key={index}>{item.url ? <ExternalLink href={item.url}>{item.name}</ExternalLink> : item.name}</p>)}
      {record ? <div className="detail-section crm-section"><div className="section-row"><h3>Acompanhamento comercial</h3><button className="text-btn" onClick={() => setEditing(true)}><Pencil size={14} />Editar dados</button></div>
        <Field label="Status da oportunidade">{id => <select id={id} value={record.status} disabled={update.isPending} onChange={event => change({ status: event.target.value })}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select>}</Field>
        <p className="detail-disclaimer">Salvo por {user?.email} em {new Date(record.created_at).toLocaleDateString('pt-BR')}.<br />{record.owned_data_source ? `Fonte própria: ${record.owned_data_source}` : record.source_provider === 'openstreetmap' ? 'Cadastro salvo do OpenStreetMap, sob ODbL. Informações próprias permanecem separadas.' : 'Referência e acompanhamento comercial.'}</p>
        <form className="note-form" onSubmit={event => { event.preventDefault(); if (note.trim()) addNote.mutate(); }}><Field label="Nova observação comercial">{id => <textarea id={id} value={note} maxLength={3000} onChange={event => setNote(event.target.value)} placeholder="Registre o contato, interesse e próximo passo…" required />}</Field><Button variant="secondary" type="submit" loading={addNote.isPending} disabled={!note.trim()}><Send size={14} />Adicionar observação</Button></form>
        {notes.isError && <Notice tone="error">Não foi possível carregar as observações. <button className="text-btn" onClick={() => notes.refetch()}>Tentar novamente</button></Notice>}
        <div className="notes-list">{notes.isPending && <p className="muted">Carregando observações…</p>}{notes.data?.map(item => <article key={item.id}><div><span className="note-dot" /><strong>Equipe comercial</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time></div><p>{item.note}</p></article>)}</div>
      </div> : <div className="detail-section"><Button className="full-width" loading={save.isPending} onClick={async () => { try { await save.mutateAsync({ lead }); toast('Lead salvo. Você já pode acompanhar esta oportunidade.'); } catch (error) { setFeedback(error.message); } }}><Bookmark size={16} />Salvar oportunidade</Button><p className="detail-disclaimer">Os campos recebidos do OpenStreetMap são salvos com fonte e atribuição da licença.</p></div>}
    </Drawer>
    {editing && <LeadEditor record={record} onClose={() => setEditing(false)} />}
  </>;
}
