"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { DocumentItem } from "./types";

export function useDocuments({ trash = false, q = "" }: { trash?: boolean; q?: string }) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (trash) params.set("trash", "1");
      if (q) params.set("q", q);
      const data = await api<{ documents: DocumentItem[] }>(`/api/documents?${params}`);
      setDocuments(data.documents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista");
    }
  }, [trash, q]);

  useEffect(() => {
    const t = setTimeout(reload, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [reload, q]);

  return { documents, error, reload, setDocuments };
}
