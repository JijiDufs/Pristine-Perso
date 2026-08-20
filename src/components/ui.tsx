"use client";
import { useEffect, useState, type ReactNode } from "react";
import { X, Check, AlertTriangle } from "lucide-react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

type Opt = string | readonly (string | number)[];
export function Chips({ options, value, onChange }: {
  options: readonly Opt[]; value: unknown; onChange: (v: string) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const val = Array.isArray(o) ? o[0] : o;
        const lbl = Array.isArray(o) ? o[1] : o;
        return (
          <button key={String(val)} className={"chip" + (value === val ? " on" : "")}
            onClick={() => onChange(val as string)}>{lbl}</button>
        );
      })}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 820 } : undefined}>
        <div className="modal-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <div className="tiny dim mono" style={{ marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: string; tone?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-lbl">{label}</div>
      <div className={"stat-val display " + (tone ?? "")}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    stock: ["tag-stock", "En stock"], listed: ["tag-listed", "En ligne"], sold: ["tag-sold", "Vendue"],
  };
  const [cls, lbl] = map[status] ?? map.stock;
  return <span className={"tag " + cls}>{lbl}</span>;
}

export type ToastMsg = { text: string; kind?: "ok" | "err" } | null;

export function useToast() {
  const [msg, setMsg] = useState<ToastMsg>(null);
  const toast = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 3000);
  };
  const node = msg ? (
    <div className={"toast " + (msg.kind ?? "")}>
      {msg.kind === "err" ? <AlertTriangle size={15} color="var(--coral)" /> : <Check size={15} color="var(--mint)" />}
      {msg.text}
    </div>
  ) : null;
  return { toast, node };
}
