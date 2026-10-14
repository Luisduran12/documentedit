"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { DocumentItem } from "./types";

// Caché en memoria compartida entre pantallas (Documentos, Editor, Papelera): al volver a una
// pantalla se pinta al instante la última lista conocida y se revalida en segundo plano.
const cache = new Map<string, DocumentItem[]>();

export function useDocuments({ trash = false, q = "" }: { trash?: boolean; q?: string }) {
  const key = `${trash ? "t" : "d"}:${q}`;
  const [state, setState] = useState<{ key: string; documents: DocumentItem[] | null }>({ key, documents: cache.get(key) ?? null });
  const [error, setError] = useState<string | null>(null);

  // Al cambiar de búsqueda/vista se parte de lo que haya en caché para esa clave.
  const documents = state.key === key ? state.documents : (cache.get(key) ?? null);

  const setDocuments = useCallback(
    (value: DocumentItem[] | null | ((prev: DocumentItem[] | null) => DocumentItem[] | null)) => {
      setState((prev) => {
        const next = typeof value === "function" ? value(prev.key === key ? prev.documents : (cache.get(key) ?? null)) : value;
        if (next) cache.set(key, next);
        return { key, documents: next };
      });
    },
    [key],
  );

  const reload = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (trash) params.set("trash", "1");
      if (q) params.set("q", q);
      const data = await api<{ documents: DocumentItem[] }>(`/api/documents?${params}`);
      cache.set(key, data.documents);
      setState({ key, documents: data.documents });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista");
    }
  }, [trash, q, key]);

  useEffect(() => {
    const t = setTimeout(reload, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [reload, q]);

  return { documents, error, reload, setDocuments };
}
