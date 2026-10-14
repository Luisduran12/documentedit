"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Download, FileText, Loader2, PenSquare, Pencil, RotateCcw, Search, Trash2, Upload, XCircle } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Modal } from "@/components/ui/modal";
import { ActionMenu, Pill, type MenuAction } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatBytes } from "@/lib/files";
import { RenameDialog } from "./rename-dialog";
import type { DocumentItem } from "./types";
import { DropOverlay, UploadProgress, useUploader } from "./upload-zone";
import { useDocuments } from "./use-documents";

export function DocumentsView({ trash = false }: { trash?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const { documents, error, reload } = useDocuments({ trash, q });
  const uploader = useUploader(reload);
  const [renaming, setRenaming] = useState<DocumentItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DocumentItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, okText: string) {
    try {
      await fn();
      toast.ok(okText);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Algo salió mal");
    }
  }

  const patch = (id: string, json: unknown) => api(`/api/documents/${id}`, { method: "PATCH", json });

  function actionsFor(doc: DocumentItem): MenuAction[] {
    if (trash) {
      return [
        { label: "Restaurar", icon: RotateCcw, onSelect: () => run(() => patch(doc.id, { action: "restore" }), "Documento restaurado") },
        { label: "Eliminar definitivamente", icon: XCircle, danger: true, onSelect: () => setConfirmDelete(doc) },
      ];
    }
    return [
      { label: "Abrir en el editor", icon: PenSquare, onSelect: () => router.push(`/editor/${doc.id}`) },
      { label: "Renombrar", icon: Pencil, onSelect: () => setRenaming(doc) },
      // Descarga mediante redirección a una URL firmada: requiere navegación completa.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      { label: "Descargar", icon: Download, onSelect: () => window.location.assign(`/api/documents/${doc.id}/download`) },
      { label: "Duplicar", icon: Copy, onSelect: () => run(() => api(`/api/documents/${doc.id}/duplicate`, { method: "POST" }), "Copia creada") },
      { label: "Enviar a la papelera", icon: Trash2, danger: true, onSelect: () => run(() => patch(doc.id, { action: "trash" }), "Enviado a la papelera") },
    ];
  }

  const content = (
    <>
      <PageHeader
        title={trash ? "Papelera" : "Documentos"}
        description={trash ? "Los documentos se eliminan definitivamente a los 30 días de estar aquí." : undefined}
        actions={
          !trash && (
            <button type="button" onClick={uploader.pick} className="btn btn-primary h-11">
              <Upload className="h-4 w-4" aria-hidden /> Subir PDF o Imagen
            </button>
          )
        }
      />
      {uploader.input}

      {!trash && (documents?.length || q) ? (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar documentos por nombre"
            className="input h-11 pl-9"
          />
        </div>
      ) : null}

      <UploadProgress items={uploader.progress} />

      {error && <p role="alert" className="mb-4 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-fg">{error}</p>}

      {documents === null && !error ? (
        <div className="flex items-center gap-2 py-10 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : documents && documents.length === 0 ? (
        q ? (
          <p className="py-10 text-center text-sm text-fg-muted">Ningún documento coincide con «{q}».</p>
        ) : trash ? (
          <EmptyState icon={<Trash2 className="h-5 w-5" />} title="La papelera está vacía" description="Los documentos que envíes a la papelera aparecerán aquí." />
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Aún no tienes documentos"
            description="Sube un PDF o imagen (PNG, JPG, WEBP) para empezar a editar o extraer texto con OCR."
            action={
              <button type="button" onClick={uploader.pick} className="btn btn-primary h-11">
                <Upload className="h-4 w-4" aria-hidden /> Subir PDF o Imagen
              </button>
            }
          />
        )
      ) : (
        <ul className="panel divide-y divide-white/[0.06] rounded-2xl">
          {documents?.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2 hover:bg-subtle/60 sm:px-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-primary-fg">
                <FileText className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                {trash ? (
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                ) : (
                  <Link href={`/editor/${doc.id}`} className="block truncate text-sm font-medium hover:text-primary-fg">
                    {doc.name}
                  </Link>
                )}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-mono-timer text-fg-muted">
                  {doc.pageCount != null && <span>{doc.pageCount} pág.</span>}
                  <span>{formatBytes(doc.sizeBytes)}</span>
                  <span>v{doc.version}</span>
                  <span className="sm:hidden">{formatDate(trash ? doc.deletedAt! : doc.updatedAt)}</span>
                  {doc.hasDraft && !trash && (
                    <Link href={`/editor/${doc.id}`} className="font-sans">
                      <Pill tone="info">Continuar editando</Pill>
                    </Link>
                  )}
                </p>
              </div>
              <span className="hidden shrink-0 text-right font-mono text-mono-data text-fg-muted sm:block" title={trash ? "Enviado a la papelera" : "Última modificación"}>
                {trash ? `Borrado ${formatRelative(doc.deletedAt!)}` : formatDate(doc.updatedAt)}
              </span>
              <ActionMenu actions={actionsFor(doc)} label={`Acciones para ${doc.name}`} />
            </li>
          ))}
        </ul>
      )}

      <RenameDialog
        initial={renaming?.name ?? null}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          const id = renaming!.id;
          setRenaming(null);
          await run(() => patch(id, { name }), "Nombre actualizado");
        }}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="¿Eliminar definitivamente?"
        footer={
          <>
            <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-secondary h-11">Cancelar</button>
            <button
              type="button"
              disabled={busy}
              className="btn btn-danger h-11"
              onClick={async () => {
                const doc = confirmDelete!;
                setBusy(true);
                await run(() => api(`/api/documents/${doc.id}`, { method: "DELETE" }), "Documento eliminado");
                setBusy(false);
                setConfirmDelete(null);
              }}
            >
              Eliminar
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          Se borrarán «{confirmDelete?.name}» y todas sus versiones anteriores. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </>
  );

  return trash ? content : <DropOverlay onFiles={uploader.uploadFiles}>{content}</DropOverlay>;
}
