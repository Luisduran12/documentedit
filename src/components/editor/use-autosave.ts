"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditDoc } from "@/lib/editor/types";

export type SaveStatus = { state: "idle" | "pending" | "saving" | "saved" | "error"; savedAt: string | null };

const DELAY_MS = 2500;

/**
 * Autoguardado del borrador (JSON de ediciones) en R2 unos segundos después de cada cambio,
 * y de inmediato al ocultar la pestaña (cambio de app en el celular, cierre, etc.).
 */
export function useAutosave(documentId: string, doc: EditDoc, dirtyVersion: number, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>({ state: "idle", savedAt: null });
  const latest = useRef({ doc, dirtyVersion, saved: 0 });
  useEffect(() => {
    latest.current.doc = doc;
    latest.current.dirtyVersion = dirtyVersion;
  }, [doc, dirtyVersion]);

  const flush = useCallback(
    async (keepalive = false) => {
      const { doc: d, dirtyVersion: v, saved } = latest.current;
      if (!enabled || v === 0 || v === saved) return;
      setStatus((s) => ({ ...s, state: "saving" }));
      const body = JSON.stringify(d);
      try {
        const res = await fetch(`/api/documents/${documentId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: keepalive && body.length < 60_000,
        });
        if (!res.ok) throw new Error(String(res.status));
        const { savedAt } = await res.json();
        latest.current.saved = v;
        setStatus({ state: latest.current.dirtyVersion === v ? "saved" : "pending", savedAt });
      } catch {
        setStatus((s) => ({ ...s, state: "error" }));
      }
    },
    [documentId, enabled],
  );

  useEffect(() => {
    if (!enabled || dirtyVersion === 0 || dirtyVersion === latest.current.saved) return;
    const t = setTimeout(() => {
      setStatus((s) => ({ ...s, state: "pending" }));
      flush();
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [dirtyVersion, enabled, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (enabled && latest.current.dirtyVersion !== latest.current.saved) {
        flush(true);
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [flush, enabled]);

  /** Marca el estado actual como ya persistido (p. ej. tras cargar un borrador o guardar versión). */
  const markClean = useCallback(() => {
    latest.current.saved = latest.current.dirtyVersion;
    setStatus({ state: "idle", savedAt: null });
  }, []);

  return { status, flush, markClean };
}
