import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, ChartNoAxesCombined, ChevronRight, CircleHelp, Crosshair, FolderOpen, LogOut, Menu, Search, Settings2, ShieldCheck, Star, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useProfile } from '../lib/data.js';
import { isConfigured } from '../lib/supabase.js';
import { useToast } from './ui.jsx';
import { OSM_ATTRIBUTION, OSM_LICENSE_URL } from '@vorka/shared';

const SearchSessionContext = createContext(null);
export const useSearchSession = () => useContext(SearchSessionContext);
const navigation = [
  { to: '/buscar', icon: Crosshair, label: 'Buscar leads', section: 'Prospecção' },
  { to: '/dashboard', icon: ChartNoAxesCombined, label: 'Dashboard', section: 'Prospecção' },
  { to: '/leads', icon: FolderOpen, label: 'Meus leads', section: 'Organização' },
  { to: '/favoritos', icon: Star, label: 'Favoritos', section: 'Organização' },
  { to: '/configuracoes', icon: Settings2, label: 'Configurações', section: 'Workspace' },
];

export function Brand({ compact = false }) {
  return <Link to="/buscar" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="VORKA Lead Hunter — início">
    <span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m4 7 12 20L28 7h-8l-4 8-4-8Z" fill="currentColor" /></svg></span>
    <span><strong>VORKA<span className="brand-period">.</span></strong><small>LEAD HUNTER</small></span>
  </Link>;
}

export function Layout() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const toast = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchSession, setSearchSession] = useState({ leads: [], query: null, nextPageToken: null, searched: false, fetchedAt: null });
  const active = navigation.find(item => item.to === location.pathname);
  const displayName = profile?.name || user?.email?.split('@')[0] || 'Seu workspace';
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const input = document.getElementById('segment-search');
        if (input) { event.preventDefault(); input.focus(); }
      }
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <SearchSessionContext.Provider value={{ searchSession, setSearchSession }}>
    <div className="app-shell">
      {menuOpen && <button className="sidebar-scrim" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand"><Brand /><button className="icon-btn mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fechar navegação"><X size={20} /></button></div>
        <div className="workspace-picker"><span className="workspace-avatar">V</span><div><strong>VORKA Brasil</strong><span>Workspace comercial</span></div><ShieldCheck size={15} /></div>
        <nav aria-label="Navegação principal">{navigation.map((item, index) => <div key={item.to}>
          {(index === 0 || item.section !== navigation[index - 1].section) && <div className="nav-section">{item.section}</div>}
          <NavLink to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><item.icon size={18} /><span>{item.label}</span>{item.to === '/buscar' && <span className="nav-shortcut">⌘ K</span>}</NavLink>
        </div>)}</nav>
        <div className="sidebar-bottom"><Link to="/configuracoes" className="sidebar-tip"><span className="tip-icon"><Crosshair size={19} /></span><strong>O próximo cliente está aí.</strong><p>Transforme informação em boas conversas.</p><span>Prepare seu workspace <ArrowUpRight size={13} /></span></Link>
          <Link className="help-link" to="/ajuda"><CircleHelp size={16} />Central de ajuda<ArrowUpRight size={14} /></Link>
          <div className="user-block"><div className="user-avatar">{user ? displayName.slice(0, 2).toUpperCase() : 'VK'}</div><div className="user-info"><strong>{displayName}</strong><span>{user ? 'Equipe comercial' : 'Configuração inicial'}</span></div>{user && <button className="icon-btn" aria-label="Sair da conta" title="Sair" onClick={async () => { try { await signOut(); } catch { toast('Não foi possível sair. Tente novamente.', 'error'); } }}><LogOut size={16} /></button>}</div>
        </div>
      </aside>
      <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir navegação" aria-expanded={menuOpen}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{active?.label || 'Central de ajuda'}</strong></div><div className="topbar-right"><span className={`connection-pill ${user ? 'connected' : ''}`}><i />{user ? 'Sessão segura' : 'Aguardando configuração'}</span><span className="topbar-divider" /><span className="internal-label">USO INTERNO</span><span className="topbar-avatar">V</span></div></header>
        <main><Outlet /></main>
        <footer className="app-footer"><span>© {new Date().getFullYear()} VORKA Brasil<span className="footer-dot">·</span>Feito para encontrar oportunidades.</span><div><a href={OSM_LICENSE_URL} target="_blank" rel="noopener noreferrer">{OSM_ATTRIBUTION} · ODbL</a><a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a><Link to="/termos">Termos de uso</Link><Link to="/privacidade">Privacidade</Link><span className="version">v1.2</span></div></footer>
      </div>
    </div>
  </SearchSessionContext.Provider>;
}
