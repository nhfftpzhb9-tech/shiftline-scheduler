"use client";

import { useEffect } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

export interface ToastMessage { message: string; type: "success" | "error" }

export function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 4200);
    return () => clearTimeout(id);
  }, [onClose, toast.message]);
  return <div className={`toast ${toast.type}`} role="status"><span className="toast-symbol">{toast.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}</span><span>{toast.message}</span><button className="icon-button" aria-label="Dismiss message" onClick={onClose}><X size={15} /></button></div>;
}

export function Dialog({ title, subtitle, children, footer, onClose, size = "medium" }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: "medium" | "large";
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", handleKey); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`dialog-panel ${size === "large" ? "dialog-large" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-head"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </section>
  </div>;
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", busy, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Dialog title={title} onClose={onCancel} footer={<><button className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? <span className="spinner" /> : confirmLabel}</button></>}>
    <p className="confirm-message">{message}</p>
  </Dialog>;
}
