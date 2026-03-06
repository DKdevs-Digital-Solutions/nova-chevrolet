
import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastType = "error" | "success" | "info" | "warn";
interface ToastItem { id: number; type: ToastType; title: string; message?: string; }
interface ToastCtx {
  show:    (type: ToastType, title: string, message?: string) => void;
  error:   (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  info:    (title: string, message?: string) => void;
  warn:    (title: string, message?: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be inside <ToastProvider>");
  return c;
}

const DURATION = 4500;

const ICONS: Record<ToastType, React.ReactNode> = {
  error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const [visible, setVisible]   = useState(false);
  const [progress, setProgress] = useState(100);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const start = Date.now();
    const tick = () => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / DURATION) * 100);
      setProgress(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
      else dismiss();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => onRemove(item.id), 340);
  }

  return (
    <div className={`toast toast-${item.type} ${visible ? "toast-in" : "toast-out"}`} role="alert">
      <span className="toast-icon">{ICONS[item.type]}</span>
      <div className="toast-body">
        <p className="toast-title">{item.title}</p>
        {item.message && <p className="toast-msg">{item.message}</p>}
      </div>
      <button className="toast-close" onClick={dismiss} aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="toast-progress">
        <div className="toast-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++counter.current;
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }]);
  }, []);

  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);

  const ctx: ToastCtx = {
    show,
    error:   (t, m) => show("error",   t, m),
    success: (t, m) => show("success", t, m),
    info:    (t, m) => show("info",    t, m),
    warn:    (t, m) => show("warn",    t, m),
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className="toast-viewport" aria-label="Notificações">
        {toasts.map(t => <ToastItem key={t.id} item={t} onRemove={remove} />)}
      </div>
    </Ctx.Provider>
  );
}
