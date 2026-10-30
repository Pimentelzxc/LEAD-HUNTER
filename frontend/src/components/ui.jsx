import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, CheckCircle2, LoaderCircle, Radar, X } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', loading = false, disabled, ...props }) {
  return <button className={`btn btn-${variant} ${className}`} disabled={disabled || loading} {...props}>
    {loading && <LoaderCircle size={16} className="spin" />}{children}
  </button>;
}

export function Field({ label, children, hint, className = '', id: explicitId, ...props }) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  return <div className={`field ${className}`} {...props}>
    <label htmlFor={id}>{label}</label>
    {typeof children === 'function' ? children(id) : children}
    {hint && <span className="field-hint">{hint}</span>}
  </div>;
}

export function Notice({ children, tone = 'info', className = '' }) {
  return <div className={`notice notice-${tone} ${className}`} role={tone === 'error' ? 'alert' : undefined}>
    <AlertCircle size={17} /><div>{children}</div>
  </div>;
}

export function EmptyState({ icon: Icon = Radar, title, children, action, compact = false }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>
    <div className="empty-symbol"><span /><Icon size={29} strokeWidth={1.5} /></div>
    <h3>{title}</h3><p>{children}</p>{action}
  </div>;
}

export function PageHeader({ eyebrow, title, description, children }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="header-actions">{children}</div>}</div>;
}

export function Metric({ icon: Icon, label, value, caption, accent = false }) {
  return <div className={`metric ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><Icon size={17} /></div><div className="metric-value">{value}</div><div className="metric-caption">{caption}</div></div>;
}

export function ScoreBadge({ analysis, small = false }) {
  return <span className={`score-badge score-${analysis.level} ${small ? 'small' : ''}`} title={analysis.label}>
    {analysis.score === null ? '—' : analysis.score}{!small && <span>/100</span>}
  </span>;
}

export function ChannelBadge({ state = 'unverified', channel = 'Site' }) {
  const text = state === 'identified' ? `${channel} identificado` : state === 'not_identified' ? `${channel} não identificado` : 'Não verificado';
  return <span className={`channel-badge channel-${state}`}>{state === 'identified' ? <Check size={12} /> : <span className="status-dot" />}{text}</span>;
}

export function ExternalLink({ href, children, className = '' }) {
  return <a className={`external-link ${className}`} href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14} /></a>;
}

export function Drawer({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className={`drawer ${wide ? 'drawer-wide' : ''}`} onCancel={onClose} aria-labelledby={headingId}
    onClick={event => { if (event.target === ref.current && event.clientX < ref.current.getBoundingClientRect().left) onClose(); }}>
    <div className="drawer-heading"><div><span className="eyebrow">{subtitle}</span><h2 id={headingId}>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Fechar painel"><X size={20} /></button></div>
    <div className="drawer-body">{children}</div>
  </dialog>;
}

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, type = 'success') => {
    clearTimeout(timer.current); setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={show}>{children}
    {toast && <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>{toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{toast.message}</span><button className="icon-btn" onClick={() => setToast(null)} aria-label="Fechar notificação"><X size={16} /></button></div>}
  </ToastContext.Provider>;
}
