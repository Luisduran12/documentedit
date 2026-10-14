"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";

export type MenuAction = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean; hidden?: boolean };

export function ActionMenu({ actions, label = "Más acciones" }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="btn btn-ghost btn-icon h-11 w-11">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 z-30 mt-1 w-56 rounded-2xl p-1.5 shadow-2xl">
          {actions
            .filter((a) => !a.hidden)
            .map((a) => (
              <button
                key={a.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-subtle ${a.danger ? "text-danger-fg" : "text-fg-2 hover:text-fg"}`}
              >
                <a.icon className="h-4 w-4" aria-hidden /> {a.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "info" | "neutral"; children: ReactNode }) {
  const cls = {
    ok: "bg-success/15 text-success-fg",
    warn: "bg-warning/15 text-warning-fg",
    danger: "bg-danger/15 text-danger-fg",
    info: "bg-primary/20 text-primary-fg",
    neutral: "bg-subtle text-fg-2",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-mono-timer font-semibold ${cls}`}>{children}</span>;
}
