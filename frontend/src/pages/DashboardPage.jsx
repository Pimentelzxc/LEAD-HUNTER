import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, ChartNoAxesCombined, CheckCircle2, MessageSquare, Target, TrendingUp, Users } from 'lucide-react';
import { useLeads } from '../lib/data.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { EmptyState, Metric, Notice, PageHeader } from '../components/ui.jsx';
import { STATUSES, savedToLead } from '@vorka/shared';

export function DashboardPage() {
  const { user } = useAuth();
  const query = useLeads();
  const leads = query.data || [];
  const counts = STATUSES.map(status => leads.filter(lead => lead.status === status).length);
  const confirmed = leads.filter(lead => lead.opportunity_confirmed).length;
  const max = Math.max(1, ...counts);
  const now = new Date();
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - (3 - i) * 7); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    return { start, end, count: leads.filter(lead => new Date(lead.created_at) >= start && new Date(lead.created_at) <= end).length };
  });
  const maxWeek = Math.max(1, ...weeks.map(week => week.count));
  const value = number => query.data ? number : '—';
  return <div className="page"><PageHeader eyebrow="VISÃO GERAL" title={<>Cada conversa, um <span>próximo passo.</span></>} description="Acompanhe sua carteira e concentre energia nas oportunidades certas."><Link to="/buscar" className="btn btn-primary">Buscar oportunidades<ArrowRight size={16} /></Link></PageHeader>
    {query.isError && <Notice tone="error">Não foi possível carregar os indicadores. <button className="text-btn" onClick={() => query.refetch()}>Tentar novamente</button></Notice>}
    {!user && <Notice>Os indicadores serão calculados a partir dos seus leads após a configuração do Supabase.</Notice>}
    <div className="metrics-grid dashboard-metrics"><Metric icon={Bookmark} label="Leads salvos" value={value(leads.length)} caption="Sua carteira atual" /><Metric icon={MessageSquare} label="Contatados" value={value(counts[1])} caption="Status atual de contato" /><Metric icon={TrendingUp} label="Em negociação" value={value(counts[2])} caption="Conversas em andamento" accent /><Metric icon={CheckCircle2} label="Vendas concluídas" value={value(counts[3])} caption="Oportunidades convertidas" /></div>
    <div className="dashboard-grid"><section className="panel dashboard-panel"><div className="panel-heading"><div><h2>Seu funil comercial</h2><p>Distribuição atual dos leads por status.</p></div><ChartNoAxesCombined size={19} className="muted" /></div><div className="pipeline-chart">{STATUSES.map((status, index) => <div className="pipeline-row" key={status}><div><span className={`pipeline-dot pipeline-dot-${index}`} />{status}</div><div className="pipeline-track"><span className={`pipeline-bar pipeline-bar-${index}`} style={{ width: `${counts[index] / max * 100}%` }} /></div><strong>{counts[index]}</strong></div>)}</div><div className="chart-caption">{leads.length ? `${Math.round(counts[3] / leads.length * 100)}% da carteira com venda concluída` : 'Os dados aparecem conforme você salva e acompanha oportunidades.'}</div></section>
      <section className="panel dashboard-panel"><div className="panel-heading"><div><h2>Construindo sua carteira</h2><p>Leads salvos nas últimas quatro semanas.</p></div><span className="subtle-pill">28 dias</span></div><div className="weekly-chart" role="img" aria-label={weeks.map(week => `${week.start.toLocaleDateString('pt-BR')}: ${week.count} leads`).join('; ')}>{weeks.map((week, index) => <div className="week-column" key={index}><strong>{week.count}</strong><div className="week-track"><span style={{ height: `${week.count / maxWeek * 100}%` }} /></div><span>{week.start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></div>)}</div><div className="chart-caption">Somente leads salvos. Pesquisas não geram histórico persistente.</div></section></div>
    <div className="dashboard-bottom"><section className="panel"><div className="panel-heading"><div><h2>Últimas oportunidades salvas</h2><p>Retome de onde parou.</p></div><Link className="text-btn" to="/leads">Ver carteira<ArrowRight size={15} /></Link></div>{leads.length ? <div className="recent-list">{leads.slice(0, 5).map(lead => <Link to="/leads" key={lead.id}><span className="company-avatar">{lead.company_name ? lead.company_name.slice(0, 2).toUpperCase() : <Bookmark size={17} />}</span><div><strong>{savedToLead(lead).name}</strong><span>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</span></div><span className={`crm-status crm-${STATUSES.indexOf(lead.status)}`}>{lead.status}</span><ArrowRight size={15} /></Link>)}</div> : <EmptyState compact icon={Users} title="Sua carteira começa aqui.">Busque e salve uma oportunidade para acompanhar seu progresso.</EmptyState>}</section><section className="panel priority-panel"><span className="insight-icon orange"><Target size={23} /></span><div className="eyebrow">OPORTUNIDADES CONFIRMADAS</div><strong className="priority-count">{value(confirmed)}</strong><h2>Potencial com evidência.</h2><p>Confirme a necessidade do cliente e registre o contexto para uma abordagem mais relevante.</p><Link to="/leads" className="text-btn">Revisar oportunidades<ArrowRight size={15} /></Link></section></div>
  </div>;
}
