import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowDownUp, ArrowRight, Bookmark, Check, ChevronDown, Crosshair, Download, Globe2, MapPin, Phone, Radar, Search, Settings2, SlidersHorizontal, Sparkles, Star, Target, Users, X } from 'lucide-react';
import { callPlaces, isConfigured } from '../lib/supabase.js';
import { useLeads, useSaveLead, useUpdateLead, useWeights } from '../lib/data.js';
import { useSearchSession } from '../components/Layout.jsx';
import { Button, ChannelBadge, EmptyState, Field, Metric, Notice, PageHeader, ScoreBadge, useToast } from '../components/ui.jsx';
import { LeadDetail } from '../components/LeadDetail.jsx';
import { matchesFilters, scoreLead, sourceKey, STATES, validateSearch, OSM_ATTRIBUTION, OSM_LICENSE_URL } from '@vorka/shared';
import { PAGE_SIZE } from '@vorka/shared/osm';

const initialFilters = { website: 'all', instagram: 'all', phone: false, whatsapp: false, high: false, term: '' };
const segments = ['Barbearias', 'Salões de beleza', 'Restaurantes', 'Lanchonetes', 'Oficinas mecânicas', 'Academias', 'Clínicas', 'Pet shops', 'Lojas de roupas', 'Mercados'];
const number = value => new Intl.NumberFormat('pt-BR').format(value);

export function SearchPage() {
  const { searchSession, setSearchSession } = useSearchSession();
  const [form, setForm] = useState(searchSession.query || { state: 'PR', city: 'Fazenda Rio Grande', segment: 'Barbearias', neighborhood: '' });
  const [filters, setFilters] = useState(initialFilters);
  const [advanced, setAdvanced] = useState(false);
  const [sort, setSort] = useState('score');
  const [selected, setSelected] = useState(null);
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const weights = useWeights();
  const savedQuery = useLeads();
  const saved = savedQuery.data || [];
  const save = useSaveLead();
  const update = useUpdateLead();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ query }) => callPlaces({ action: 'search', ...query }), retry: false,
    onSuccess: (data, variables) => {
      setSearchSession({
        leads: data.leads || [], query: variables.query, nextPageToken: null,
        searched: true, fetchedAt: data.fetchedAt, limited: data.limited, segmentMode: data.segmentMode, notice: data.notice, source: data.source,
      });
      setDisplayLimit(PAGE_SIZE);
    },
  });
  const scored = useMemo(() => searchSession.leads.map(lead => {
    const record = saved.find(item => sourceKey(item) === sourceKey(lead));
    const enriched = { ...lead, opportunityConfirmed: record?.opportunity_confirmed, opportunityEvidence: record?.opportunity_evidence };
    return { ...enriched, analysis: scoreLead(enriched, weights) };
  }), [searchSession.leads, weights, saved]);
  const visible = useMemo(() => {
    const leads = scored.filter(lead => matchesFilters(lead, filters, weights));
    if (sort === 'score') leads.sort((a, b) => (b.analysis.score ?? -1) - (a.analysis.score ?? -1));
    if (sort === 'name') leads.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return leads;
  }, [scored, filters, sort, weights]);
  const highCount = scored.filter(lead => lead.analysis.level === 'high').length;
  const noSiteCount = scored.filter(lead => lead.websiteState === 'not_identified').length;
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'term' && value && value !== 'all').length;
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const filter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  const submit = event => {
    event.preventDefault();
    const validation = validateSearch(form);
    if (!validation.valid) { toast('Preencha estado, cidade e segmento para começar.', 'error'); return; }
    mutation.mutate({ query: validation.value, append: false });
  };
  const saveLead = async (lead, favorite = false) => {
    try {
      const existing = saved.find(record => sourceKey(record) === sourceKey(lead));
      if (existing) {
        if (favorite) { await update.mutateAsync({ id: existing.id, patch: { favorite: !existing.favorite } }); toast(existing.favorite ? 'Removido dos favoritos.' : 'Adicionado aos favoritos.'); }
        else toast('Esta oportunidade já está nos seus leads.');
      } else { await save.mutateAsync({ lead, favorite }); toast(favorite ? 'Oportunidade salva nos favoritos.' : 'Lead salvo com atribuição ao OpenStreetMap.'); }
    } catch (error) { toast(error.message, 'error'); }
  };
  return <div className="page search-page">
    <PageHeader eyebrow="PROSPECÇÃO INTELIGENTE" title={<>Encontre seu próximo <span>cliente.</span></>} description="Descubra empresas, identifique oportunidades e comece boas conversas.">
      <Link to="/leads" className="btn btn-secondary"><FolderIcon />Meus leads<ArrowUpRightIcon /></Link>
    </PageHeader>
    {!isConfigured && <div className="setup-banner"><span className="setup-banner-icon"><Settings2 size={18} /></span><div><strong>Seu radar está quase pronto.</strong><span>Conecte o Supabase e o back-end para buscar no OpenStreetMap sem chave paga.</span></div><Link to="/configuracoes">Configurar integrações<ArrowRight size={16} /></Link></div>}
    <section className="metrics-grid" aria-label="Resumo de prospecção">
      <Metric icon={Users} label="Empresas encontradas" value={searchSession.searched ? number(scored.length) : '—'} caption="Na pesquisa atual" />
      <Metric icon={Target} label="Alta oportunidade" value={searchSession.searched ? number(highCount) : '—'} caption="Pontuação a partir de 80" accent />
      <Metric icon={Globe2} label="Site não identificado" value={searchSession.searched ? number(noSiteCount) : '—'} caption="Oportunidades para investigar" />
      <Metric icon={Bookmark} label="Leads salvos" value={savedQuery.data ? number(saved.length) : '—'} caption="Na sua carteira comercial" />
    </section>
    <section className="panel search-panel" aria-labelledby="search-heading">
      <div className="panel-heading"><div className="section-title"><span className="section-icon"><SlidersHorizontal size={17} /></span><div><h2 id="search-heading">Direcione sua busca</h2><p>Escolha onde e quem você quer encontrar.</p></div></div><span className="manual-tag"><span />Busca manual</span></div>
      <form onSubmit={submit}>
        <div className="search-fields">
          <Field label="Estado">{id => <div className="input-wrap"><MapPin size={16} /><select id={id} value={form.state} onChange={event => change('state', event.target.value)} required>{Object.entries(STATES).map(([uf, name]) => <option key={uf} value={uf}>{name}</option>)}</select><ChevronDown size={14} className="select-arrow" /></div>}</Field>
          <Field label="Cidade">{id => <div className="input-wrap"><MapPin size={16} /><input id={id} value={form.city} onChange={event => change('city', event.target.value)} placeholder="Digite a cidade" minLength={2} maxLength={100} required /></div>}</Field>
          <Field id="segment-search" label="Segmento comercial" className="segment-field">{id => <div className="input-wrap"><Search size={16} /><input id={id} list="segments" value={form.segment} onChange={event => change('segment', event.target.value)} placeholder="Ex.: barbearias, restaurantes…" minLength={2} maxLength={100} required /><datalist id="segments">{segments.map(segment => <option key={segment} value={segment} />)}</datalist></div>}</Field>
          <Button type="submit" className="search-submit" loading={mutation.isPending} disabled={!isConfigured} title={!isConfigured ? 'Configure as integrações para buscar dados reais' : undefined}><Search size={17} />{mutation.isPending ? 'Buscando…' : 'Buscar leads'}{!mutation.isPending && <ArrowRight size={16} />}</Button>
        </div>
        <div className="search-options-row"><button type="button" className={`text-btn advanced-toggle ${advanced ? 'selected' : ''}`} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}><SlidersHorizontal size={14} />Filtros avançados{activeFilterCount > 0 && <span className="count-badge">{activeFilterCount}</span>}<ChevronDown size={13} className={advanced ? 'rotate' : ''} /></button><span className="search-source"><ShieldIcon />Dados abertos · OpenStreetMap</span></div>
        {advanced && <div className="advanced-filters">
          <Field label="Bairro (opcional)">{id => <input id={id} value={form.neighborhood} onChange={event => change('neighborhood', event.target.value)} maxLength={100} placeholder="Toda a cidade" />}</Field>
          <Field label="Site">{id => <select id={id} value={filters.website} onChange={event => filter('website', event.target.value)}><option value="all">Qualquer estado</option><option value="not_identified">Não identificado</option><option value="identified">Identificado</option><option value="unverified">Não verificado</option></select>}</Field>
          <Field label="Instagram">{id => <select id={id} value={filters.instagram} onChange={event => filter('instagram', event.target.value)}><option value="all">Qualquer estado</option><option value="not_identified">Não identificado</option><option value="identified">Identificado</option><option value="unverified">Não verificado</option></select>}</Field>
          <div className="check-filters"><label><input type="checkbox" checked={filters.phone} onChange={event => filter('phone', event.target.checked)} />Telefone disponível</label><label><input type="checkbox" checked={filters.whatsapp} onChange={event => filter('whatsapp', event.target.checked)} />WhatsApp identificado</label><label><input type="checkbox" checked={filters.high} onChange={event => filter('high', event.target.checked)} />Alta oportunidade</label></div>
          <p className="filter-footnote">Filtros se combinam nos resultados recebidos. Perfis cadastrados no OSM são colaborativos; confirme a titularidade. WhatsApp exige confirmação do vendedor.</p>
        </div>}
      </form>
    </section>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
    {searchSession.notice && <Notice>{searchSession.notice}</Notice>}
    {searchSession.source === 'geoapify' && <p className="page-footnote" style={{ marginBottom: 16 }}>Dados do OpenStreetMap via <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>. Abra os detalhes e clique em “Consultar contatos e canais” para verificar site e telefone quando disponíveis.</p>}
    {searchSession.limited && <Notice>A consulta alcançou o limite de 100 empresas. Refine o segmento ou o bairro para investigar uma seleção menor.</Notice>}
    {searchSession.segmentMode === 'name' && <Notice>Segmento personalizado: a consulta procura esse texto no nome dos estabelecimentos. Use uma categoria sugerida para pesquisar por classificação.</Notice>}
    {searchSession.searched && <p className="page-footnote" style={{ marginBottom: 16 }}>A cobertura depende do cadastro colaborativo do OpenStreetMap. Bairro filtra somente endereços com essa informação; não há notas ou avaliações Google nesta fonte.</p>}
    {savedQuery.isError && <Notice tone="error">Não foi possível carregar seus leads salvos. <button className="text-btn" onClick={() => savedQuery.refetch()}>Tentar novamente</button></Notice>}
    <section className="panel results-panel" aria-labelledby="results-heading" aria-busy={mutation.isPending}>
      <div className="results-heading"><div><div className="inline-heading"><h2 id="results-heading">Oportunidades encontradas</h2><span className="count-badge">{searchSession.searched ? visible.length : '0'}</span></div><p>{searchSession.query ? <>{searchSession.query.segment} em {searchSession.query.city}, {searchSession.query.state}<span className="bullet">·</span>Resultados temporários</> : 'Seu próximo negócio começa com uma boa busca.'}</p></div><Link to="/leads" className="text-btn export-link"><Download size={15} />Exportar leads salvos</Link></div>
      <div className="results-toolbar"><div className="result-tabs" role="group" aria-label="Filtros rápidos">
        <button className={!filters.high && filters.website === 'all' ? 'active' : ''} onClick={() => setFilters(previous => ({ ...previous, high: false, website: 'all' }))}>Todos<span>{scored.length}</span></button>
        <button className={filters.high ? 'active' : ''} onClick={() => setFilters(previous => ({ ...previous, high: !previous.high }))}><Sparkles size={13} />Alta oportunidade{highCount > 0 && <span>{highCount}</span>}</button>
        <button className={filters.website === 'not_identified' ? 'active' : ''} onClick={() => filter('website', filters.website === 'not_identified' ? 'all' : 'not_identified')}>Site não identificado</button>
      </div><div className="result-controls"><div className="result-search"><Search size={14} /><input aria-label="Filtrar resultados por nome" placeholder="Filtrar resultados…" value={filters.term} onChange={event => filter('term', event.target.value)} /></div><label className="sort-control"><ArrowDownUp size={14} /><select aria-label="Ordenar resultados" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Prioridade VORKA</option><option value="name">Nome A–Z</option><option value="original">Ordem da fonte</option></select></label></div></div>
      {mutation.isPending && scored.length === 0 ? <div className="table-skeleton" role="status"><span>Consultando estabelecimentos reais…</span>{[0, 1, 2, 3].map(i => <div key={i} />)}</div>
        : visible.length > 0 ? <div className="table-scroll"><table className="lead-table"><thead><tr><th>Empresa</th><th>Contato disponível</th><th>Presença digital</th><th>Oportunidade</th><th className="actions-cell">Ações</th></tr></thead><tbody>{visible.slice(0, displayLimit).map(lead => {
          const record = saved.find(item => sourceKey(item) === sourceKey(lead));
          return <tr key={lead.id}><td><button className="company-cell" onClick={() => setSelected(lead)}><span className="company-avatar">{lead.name.slice(0, 2).toUpperCase()}</span><span><strong>{lead.name}</strong><span>{lead.category}</span><small>{lead.address || 'Endereço não informado'}</small></span></button></td><td><span>{lead.phone || "Não identificado"}</span><br /><span className="table-subtext">Informação colaborativa</span></td><td><div className="channel-stack"><ChannelBadge state={lead.websiteState} /><span className="table-subtext">{lead.instagram ? "Instagram cadastrado no OSM" : "Instagram não verificado"}</span></div></td><td><div className="score-cell"><ScoreBadge analysis={lead.analysis} small /><span className={`score-label text-${lead.analysis.level}`}>{lead.analysis.label.replace(' oportunidade', '')}<small>Potencial comercial</small></span></div></td><td><div className="row-actions"><button className={`icon-btn ${record?.favorite ? 'is-favorite' : ''}`} aria-label={`${record?.favorite ? 'Desfavoritar' : 'Favoritar'} ${lead.name}`} onClick={() => saveLead(lead, true)} disabled={save.isPending || update.isPending}><Star size={16} fill={record?.favorite ? 'currentColor' : 'none'} /></button><button className={`icon-btn ${record ? 'is-saved' : ''}`} aria-label={`Salvar ${lead.name}`} onClick={() => saveLead(lead)} disabled={Boolean(record) || save.isPending} title={record ? 'Já salvo' : 'Salvar lead'}>{record ? <Check size={16} /> : <Bookmark size={16} />}</button><button className="icon-btn" aria-label={`Ver detalhes de ${lead.name}`} onClick={() => setSelected(lead)}><ArrowRight size={17} /></button></div></td></tr>;
        })}</tbody></table></div>
          : searchSession.searched ? <EmptyState icon={Search} title={scored.length ? 'Nenhuma empresa com estes filtros' : 'Nenhum resultado nesta página'} action={activeFilterCount > 0 || filters.term ? <Button variant="secondary" onClick={() => setFilters(initialFilters)}>Limpar filtros</Button> : null}>{scored.length ? 'Experimente combinar menos filtros. Você também pode iniciar outra consulta com um segmento ou bairro diferente.' : 'Tente outro segmento, cidade ou bairro. A busca mostra somente estabelecimentos retornados pela fonte.'}</EmptyState>
            : <div className="search-empty"><div className="radar-art" aria-hidden="true"><div className="radar-grid" /><div className="radar-circle radar-circle-1" /><div className="radar-circle radar-circle-2" /><div className="radar-circle radar-circle-3" /><span className="radar-point point-one" /><span className="radar-point point-two" /><span className="radar-point point-three" /><div className="radar-center"><Crosshair size={30} strokeWidth={1.5} /></div></div><h3>Boas oportunidades estão no seu radar.</h3><p>Selecione uma localização e um segmento acima.<br />Nós ajudamos você a encontrar por onde começar.</p><div className="empty-steps"><span><i>1</i>Defina sua região</span><ChevronDown size={12} /><span><i>2</i>Escolha um segmento</span><ChevronDown size={12} /><span><i>3</i>Encontre oportunidades</span></div></div>}
      <div className="results-footer"><div className="attribution"><a className="source-attribution" href={OSM_LICENSE_URL} target="_blank" rel="noopener noreferrer">{OSM_ATTRIBUTION} · ODbL</a><span>{searchSession.searched ? Math.min(displayLimit, visible.length) + ' de ' + visible.length + ' empresas filtradas' : 'Dados reais. Nenhuma informação inventada.'}</span></div>{visible.length > displayLimit ? <Button variant="secondary" onClick={() => setDisplayLimit(value => value + PAGE_SIZE)}>Mostrar mais {PAGE_SIZE}<ArrowRight size={14} /></Button> : <span className="results-footer-note">{searchSession.searched ? 'Todos os resultados recebidos foram exibidos' : 'Sem cobrança por consulta'}</span>}</div>
    </section>
    <div className="insight-grid"><div><span className="insight-icon orange"><Target size={19} /></span><div><h3>Foco no que tem potencial</h3><p>Priorize com critérios claros, de 0 a 100.</p></div><Link to="/configuracoes" aria-label="Configurar pontuação"><ArrowRight size={16} /></Link></div><div><span className="insight-icon blue"><Globe2 size={19} /></span><div><h3>Informação com contexto</h3><p>Um canal não identificado merece investigação.</p></div></div><div><span className="insight-icon green"><Bookmark size={19} /></span><div><h3>Da busca à conversa</h3><p>Salve leads e acompanhe cada contato.</p></div></div></div>
    {selected && <LeadDetail lead={selected} record={saved.find(record => sourceKey(record) === sourceKey(selected))} onClose={() => setSelected(null)} onRefresh={fresh => setSearchSession(previous => ({ ...previous, leads: previous.leads.map(lead => sourceKey(lead) === sourceKey(fresh) ? fresh : lead) }))} />}
  </div>;
}

function FolderIcon() { return <Bookmark size={15} />; }
function ArrowUpRightIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>; }
function ShieldIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m12 3 8 4v6c0 5-8 8-8 8s-8-3-8-8V7Z" /><path d="m8 12 3 3 5-6" /></svg>; }
