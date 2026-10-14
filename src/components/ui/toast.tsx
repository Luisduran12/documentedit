"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

type Toast = { id: number; kind: "ok" | "error"; text: string };
const Ctx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  return (
    <Ctx value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="glass pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm">
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg" />}
            <span className="flex-1">{t.text}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-fg-muted hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return { ok: (t: string) => push("ok", t), error: (t: string) => push("error", t) };
}
