import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Crosshair, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { isConfigured, supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Brand } from '../components/Layout.jsx';
import { Button, Field, Notice } from '../components/ui.jsx';

export function LoginPage() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (!isConfigured || (!loading && user)) return <Navigate to="/buscar" replace />;
  const submit = async event => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.code === 'invalid_credentials' ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique os dados e tente novamente.');
    } catch { setError('Não foi possível conectar. Verifique sua conexão.'); }
    finally { setSubmitting(false); }
  };
  return <div className="login-page"><section className="login-story"><Brand /><div className="login-story-content"><span className="eyebrow">VORKA LEAD HUNTER</span><h1>O próximo<br />grande negócio<br /><span>começa aqui.</span></h1><p>Informação para prospectar melhor.<br />Clareza para começar a conversa certa.</p><div className="login-radar"><Crosshair size={100} strokeWidth={0.7} /></div></div><span className="login-story-footer">Uma ferramenta da VORKA Brasil.</span></section><section className="login-form-area"><form onSubmit={submit}><div className="login-form-icon"><LockKeyhole size={24} /></div><h2>Bom ter você por aqui.</h2><p>Entre no seu workspace comercial.</p><Field label="E-mail">{id => <div className="input-wrap"><Mail size={17} /><input id={id} type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required placeholder="voce@vorka.com.br" maxLength={254} /></div>}</Field><Field label="Senha">{id => <div className="input-wrap"><LockKeyhole size={17} /><input id={id} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={200} placeholder="Sua senha" /><button type="button" className="icon-btn" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>}</Field>{error && <Notice tone="error">{error}</Notice>}<Button type="submit" className="full-width" loading={submitting} disabled={loading}>Acessar workspace<ArrowRight size={16} /></Button><span className="login-access-note">Acesso exclusivo para a equipe VORKA.<br />Para obter ou recuperar seu acesso, fale com o administrador.</span><div className="login-security"><ShieldCheck size={14} />Sessão protegida pelo Supabase Auth</div></form><div className="login-legal"><Link to="/termos">Termos de uso</Link><Link to="/privacidade">Privacidade</Link></div></section></div>;
}
