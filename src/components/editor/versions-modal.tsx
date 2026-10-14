"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { DocumentItem } from "@/components/documents/types";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/files";

/** Historial de versiones con opción de volver a una (crea una versión nueva; no se borra nada). */
export function VersionsModal({ open, onClose, documentId, latestId }: { open: boolean; onClose: () => void; documentId: string; latestId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [versions, setVersions] = useState<DocumentItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ versions: DocumentItem[] }>(`/api/documents/${latestId}/versions`)
      .then((d) => setVersions(d.versions))
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar el historial"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, latestId]);

  async function restore(v: DocumentItem) {
    setBusy(v.id);
    try {
      const { document } = await api<{ document: DocumentItem }>(`/api/documents/${latestId}/versions`, { method: "POST", json: { fromId: v.id } });
      toast.ok(`Se creó la versión v${document.version} con el contenido de la v${v.version}`);
      onClose();
      router.replace(`/editor/${document.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Historial de versiones" size="lg">
      {!versions ? (
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      ) : (
        <ol className="divide-y divide-white/[0.06]">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-10 font-mono text-mono-data font-semibold">v{v.version}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{formatDateTime(v.createdAt)}</p>
                <p className="font-mono text-mono-timer text-fg-muted">
                  {formatBytes(v.sizeBytes)}
                  {v.pageCount != null ? ` · ${v.pageCount} pág.` : ""}
                </p>
              </div>
              {v.id === latestId && <Pill tone="ok">Vigente</Pill>}
              {v.id === documentId && v.id !== latestId && <Pill tone="info">Abierta</Pill>}
              <div className="flex gap-2">
                {v.id !== documentId && (
                  <Link href={`/editor/${v.id}`} onClick={onClose} className="btn btn-secondary h-10">
                    Ver
                  </Link>
                )}
                {v.id !== latestId && (
                  <button type="button" className="btn btn-secondary h-10" disabled={busy !== null} onClick={() => restore(v)}>
                    {busy === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Volver a esta
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
