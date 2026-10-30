import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Cable, Check, Database, Globe2, LockKeyhole, Save, Settings2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { isConfigured, supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useProfile, unwrap } from '../lib/data.js';
import { DEFAULT_WEIGHTS, validateWeights, WEIGHT_LABELS } from '@vorka/shared';
import { Button, ExternalLink, Field, Notice, PageHeader, useToast } from '../components/ui.jsx';

export function SettingsPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const client = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState(isConfigured ? 'profile' : 'integrations');
  const [name, setName] = useState('');
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  useEffect(() => { if (profile.data) { setName(profile.data.name); setWeights(validateWeights(profile.data.score_weights) ? profile.data.score_weights : DEFAULT_WEIGHTS); } }, [profile.data]);
  const mutation = useMutation({
    mutationFn: patch => unwrap(supabase.from('profiles').update(patch).eq('id', user.id).select().single()),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['profile', user.id] }); toast('Preferências salvas.'); },
    onError: error => toast(error.message, 'error'),
  });
  const total = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  return <div className="page settings-page"><PageHeader eyebrow="SEU WORKSPACE" title={<>Tudo pronto para <span>prospectar.</span></>} description="Gerencie seu perfil, conecte as fontes e defina seus critérios de oportunidade." />
    <div className="settings-tabs" role="group" aria-label="Seções de configuração">{[{ id: 'profile', label: 'Meu perfil', icon: UserRound }, { id: 'integrations', label: 'Integrações', icon: Cable }, { id: 'score', label: 'Pontuação', icon: SlidersHorizontal }].map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><item.icon size={16} />{item.label}</button>)}</div>
    {profile.isError && <Notice tone="error">Não foi possível carregar seu perfil. Confirme se a migração foi aplicada. <button className="text-btn" onClick={() => profile.refetch()}>Tentar novamente</button></Notice>}
    {tab === 'profile' && <section className="panel settings-card"><div className="panel-heading"><div><h2>Seu perfil comercial</h2><p>Como você aparece no workspace.</p></div><UserRound size={20} className="muted" /></div><form className="settings-form stack-form" onSubmit={event => { event.preventDefault(); if (user) mutation.mutate({ name: name.trim() }); }}><div className="profile-preview"><span className="user-avatar large">{name ? name.slice(0, 2).toUpperCase() : 'VK'}</span><div><strong>{name || 'Seu nome'}</strong><span>{user?.email || 'Configure o Supabase para entrar'}</span></div></div><Field label="Nome">{id => <input id={id} value={name} onChange={event => setName(event.target.value)} maxLength={120} required disabled={!user} placeholder="Seu nome completo" />}</Field><Field label="E-mail">{id => <input id={id} type="email" value={user?.email || ''} disabled readOnly placeholder="Seu e-mail de acesso" />}</Field><Field label="Permissão">{id => <input id={id} value={profile.data?.role === 'admin' ? 'Administrador' : 'Vendedor'} disabled readOnly />}</Field><Button loading={mutation.isPending} disabled={!user || profile.isPending}><Save size={16} />Salvar perfil</Button></form></section>}
    {tab === 'integrations' && <><div className="integration-grid">
      <section className="panel integration-card"><div className="integration-icon supabase-icon"><Database size={23} /></div><span className="integration-state">Login e banco</span><h2>Supabase</h2><p>Autenticação e carteira comercial com permissões por vendedor.</p><div className="integration-meta"><ShieldCheck size={15} />{user ? 'Sessão autenticada' : 'Aguardando configuração e login'}</div></section>
      <section className="panel integration-card"><div className="integration-icon osm-icon"><Globe2 size={23} /></div><span className="integration-state">Plano Free disponível</span><h2>OpenStreetMap / Geoapify</h2><p>Dados abertos via Geoapify com chave gratuita no back-end. Sem chave, o modo auto utiliza o Overpass público.</p><div className="integration-meta"><ExternalLink href="https://www.geoapify.com/">Geoapify</ExternalLink> · © OpenStreetMap contributors</div></section>
      <section className="panel integration-card"><div className="integration-icon enrichment-icon"><Cable size={23} /></div><span className="integration-state">Projetos separados</span><h2>Back-end Node.js</h2><p>Validação de sessão, cache e consultas limitadas ao servidor público. Pronto para Vercel Functions.</p><div className="integration-meta">Nenhuma API Google ativa</div></section>
    </div><section className="panel setup-guide"><div className="panel-heading"><div><h2>Prepare seu workspace</h2><p>Front-end e back-end têm ambientes e deploys independentes.</p></div><BookOpen size={20} className="muted" /></div><ol className="setup-steps">
      <li><span>01</span><div><h3>Configure o Supabase</h3><p>Aplique em ordem as migrações de <code>backend/supabase/migrations</code>, incluindo a migração Geoapify. Desative o cadastro público e crie os usuários da equipe.</p><ExternalLink href="https://supabase.com/dashboard">Abrir Supabase</ExternalLink></div></li>
      <li><span>02</span><div><h3>Configure cada ambiente</h3><p>Use <code>frontend/.env.local</code> para as variáveis VITE. No <code>backend/.env.local</code>, adicione <code>GEOAPIFY_API_KEY</code> criada no plano Free. Reinicie o servidor após alterar o ambiente.</p><pre>npm install{'\n'}npm run dev</pre><ExternalLink href="https://myprojects.geoapify.com/">Criar chave Geoapify</ExternalLink></div></li>
      <li><span>03</span><div><h3>Publique o back-end</h3><p>Na Vercel, selecione a pasta <code>backend</code> com preset Other. Configure URL/chave publicável do Supabase e o domínio do front-end em <code>ALLOWED_ORIGINS</code>.</p></div></li>
      <li><span>04</span><div><h3>Publique o front-end</h3><p>Crie outro projeto com a pasta <code>frontend</code>, preset Vite e saída <code>dist</code>. Defina <code>VITE_API_URL</code> com o domínio do back-end. As instruções completas estão no README.</p><ExternalLink href="https://vercel.com/new">Abrir Vercel</ExternalLink></div></li>
    </ol><div className="setup-guide-footer"><Globe2 size={16} /><span>O serviço de mapas público é gratuito e compartilhado. As plataformas de hospedagem e banco têm seus próprios limites e condições de uso.</span></div></section></>}
    {tab === 'score' && <section className="panel settings-card"><div className="panel-heading"><div><h2>Critérios de oportunidade</h2><p>Distribua 100 pontos de acordo com sua estratégia comercial.</p></div><span className={`weight-total ${total === 100 ? 'valid' : ''}`}>{total}/100</span></div><form className="settings-form score-settings" onSubmit={event => { event.preventDefault(); if (!validateWeights(weights)) { toast('Os pesos devem ser inteiros de 0 a 100 e somar 100.', 'error'); return; } if (user) mutation.mutate({ score_weights: weights }); }}>
      {Object.entries(WEIGHT_LABELS).map(([key, label]) => <Field key={key} label={label} hint={{ website: 'Site informado pela fonte, sem auditoria de qualidade.', instagram: 'Perfil cadastrado na fonte; a titularidade ainda precisa ser conferida.', contact: 'A fonte retornou um telefone comercial.', confirmed: 'O vendedor registrou uma necessidade concreta e sua evidência.' }[key]}>{id => <div className="weight-control"><input aria-label={`${label} — controle deslizante`} type="range" min="0" max="100" step="1" value={weights[key]} onChange={event => setWeights(previous => ({ ...previous, [key]: Number(event.target.value) }))} /><input id={id} type="number" min="0" max="100" step="1" value={weights[key]} onChange={event => setWeights(previous => ({ ...previous, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} /><span>pontos</span></div>}</Field>)}
      <Notice>80–100: alta oportunidade · 50–79: média · 0–49: baixa. Sem sinais suficientes, a pontuação não é calculada. Um site não identificado não gera pontos automaticamente.</Notice><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Restaurar padrão</Button><Button type="submit" loading={mutation.isPending} disabled={!user || total !== 100 || !validateWeights(weights)}><Save size={16} />Salvar critérios</Button></div>{!user && <p className="field-hint">Entre com uma conta configurada para salvar suas preferências.</p>}
    </form></section>}
  </div>;
}
