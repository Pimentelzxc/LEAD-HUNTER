import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, Download, FolderOpen, Plus, Search, Star } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLeads, useUpdateLead, useWeights } from '../lib/data.js';
import { buildCsv, savedToLead, scoreLead, STATUSES } from '@vorka/shared';
import { Button, EmptyState, Notice, PageHeader, ScoreBadge, useToast } from '../components/ui.jsx';
import { LeadDetail } from '../components/LeadDetail.jsx';
import { LeadEditor } from '../components/LeadEditor.jsx';

export function LeadsPage({ favoritesOnly = false }) {
  const { user } = useAuth();
  const query = useLeads();
  const update = useUpdateLead();
  const weights = useWeights();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const records = useMemo(() => (query.data || []).filter(record => (!favoritesOnly || record.favorite)
    && (status === 'all' || status === record.status)
    && `${record.company_name || ''} ${record.label || ''} ${record.category || ''} ${record.city || ''} ${record.source_snapshot?.name || ''} ${record.source_snapshot?.city || ''} ${record.source_id || record.place_id || ''}`.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))), [query.data, favoritesOnly, status, term]);
  const selected = query.data?.find(record => record.id === selectedId);
  const exportCsv = () => {
    const blob = new Blob([buildCsv(records, weights)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `vorka-leads-${new Date().toLocaleDateString('sv-SE')}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${records.length} registros exportados. Dados OSM incluem a atribuição da licença.`);
  };
  return <div className="page"><PageHeader eyebrow="SUA CARTEIRA COMERCIAL" title={favoritesOnly ? <>As suas <span>prioridades.</span></> : <>De oportunidade a <span>conversa.</span></>} description={favoritesOnly ? 'Mantenha por perto as oportunidades que merecem sua atenção.' : 'Organize seus contatos e acompanhe o próximo passo de cada negociação.'}>
    <Button variant="secondary" onClick={exportCsv} disabled={!records.length}><Download size={16} />Exportar CSV</Button><Button disabled={!user} onClick={() => setAdding(true)}><Plus size={16} />Cadastrar lead</Button>
  </PageHeader>
    {!user && <Notice>Conecte o Supabase nas <Link to="/configuracoes">configurações</Link> para salvar e gerenciar seus leads.</Notice>}
    {query.isError && <Notice tone="error">Não foi possível carregar seus leads. Verifique a migração e as permissões. <button className="text-btn" onClick={() => query.refetch()}>Tentar novamente</button></Notice>}
    <section className="panel"><div className="results-heading"><div><div className="inline-heading"><h2>{favoritesOnly ? 'Leads favoritos' : 'Meus leads'}</h2><span className="count-badge">{records.length}</span></div><p>Dados próprios e referências salvas por você.</p></div><div className="result-controls"><div className="result-search"><Search size={15} /><input aria-label="Filtrar leads salvos" placeholder="Buscar na carteira…" value={term} onChange={event => setTerm(event.target.value)} /></div><select aria-label="Filtrar por status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos os status</option>{STATUSES.map(value => <option key={value}>{value}</option>)}</select></div></div>
      {query.isLoading ? <div className="table-skeleton" role="status"><span>Carregando sua carteira…</span>{[0, 1, 2].map(i => <div key={i} />)}</div> : records.length ? <div className="table-scroll"><table className="lead-table saved-table"><thead><tr><th>Oportunidade</th><th>Localização</th><th>Status</th><th>Pontuação VORKA</th><th>Salvo em</th><th>Ações</th></tr></thead><tbody>{records.map(record => {
        const lead = savedToLead(record);
        return <tr key={record.id}><td><button className="company-cell" onClick={() => setSelectedId(record.id)}><span className="company-avatar">{record.company_name ? record.company_name.slice(0, 2).toUpperCase() : <Bookmark size={17} />}</span><span><strong>{lead.name}</strong><span>{lead.category}</span>{record.company_name && record.label && <small>{record.label}</small>}</span></button></td><td><span>{[lead.city, lead.state].filter(Boolean).join(', ') || 'Não registrada'}</span></td><td><span className={`crm-status crm-${STATUSES.indexOf(record.status)}`}><i />{record.status}</span></td><td><ScoreBadge analysis={scoreLead(lead, weights)} small /></td><td className="muted">{new Date(record.created_at).toLocaleDateString('pt-BR')}</td><td><div className="row-actions"><button className={`icon-btn ${record.favorite ? 'is-favorite' : ''}`} disabled={update.isPending} aria-label={`${record.favorite ? 'Desfavoritar' : 'Favoritar'} ${lead.name}`} onClick={async () => { try { await update.mutateAsync({ id: record.id, patch: { favorite: !record.favorite } }); } catch (error) { toast(error.message, 'error'); } }}><Star size={16} fill={record.favorite ? 'currentColor' : 'none'} /></button><button className="icon-btn" onClick={() => setSelectedId(record.id)} aria-label={`Abrir ${lead.name}`}><ArrowRight size={17} /></button></div></td></tr>;
      })}</tbody></table></div> : <EmptyState icon={favoritesOnly ? Star : FolderOpen} title={term || status !== 'all' ? 'Nenhum lead com estes filtros' : favoritesOnly ? 'Suas prioridades vão aparecer aqui.' : 'Uma boa carteira começa com o primeiro lead.'} action={<Link className="btn btn-primary" to="/buscar"><Search size={16} />Buscar oportunidades</Link>}>{favoritesOnly ? 'Clique na estrela de uma oportunidade para encontrá-la aqui.' : 'Encontre uma empresa na busca ou cadastre um contato obtido pela sua equipe.'}</EmptyState>}
      <div className="results-footer"><span>{records.length} {records.length === 1 ? 'oportunidade' : 'oportunidades'}</span><span className="results-footer-note">CSV de dados próprios e OSM com atribuição</span></div>
    </section>
    <p className="page-footnote">O cadastro OSM é salvo somente quando você escolhe uma oportunidade. A fonte e sua licença acompanham a exibição e a exportação. Atualizações exigem uma consulta manual.</p>
    {selected && <LeadDetail key={selected.id} lead={savedToLead(selected)} record={selected} onClose={() => setSelectedId(null)} />}
    {adding && <LeadEditor onClose={() => setAdding(false)} />}
  </div>;
}
