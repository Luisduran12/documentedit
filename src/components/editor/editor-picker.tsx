"use client";

import Link from "next/link";
import { FileText, Loader2, Upload } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pill } from "@/components/ui/menu";
import { useDocuments } from "@/components/documents/use-documents";
import { formatDate } from "@/lib/dates";

/** /editor sin documento: elegir cuál abrir. */
export function EditorPicker() {
  const { documents, error } = useDocuments({});
  return (
    <>
      <PageHeader title="Editor" description="Elige el documento que quieres editar." />
      {error && <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-fg">{error}</p>}
      {documents === null && !error ? (
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      ) : documents?.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Aún no tienes documentos"
          description="Sube un PDF en Documentos para empezar a editarlo."
          action={
            <Link href="/documentos" className="btn btn-primary h-11">
              <Upload className="h-4 w-4" /> Ir a Documentos
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents?.map((d) => (
            <li key={d.id}>
              <Link href={`/editor/${d.id}`} className="panel flex h-full flex-col gap-2 rounded-2xl p-4 hover:border-primary-strong/60">
                <FileText className="h-5 w-5 text-primary-fg" />
                <span className="line-clamp-2 text-sm font-medium">{d.name}</span>
                <span className="mt-auto flex flex-wrap items-center gap-2 font-mono text-mono-timer text-fg-muted">
                  {d.pageCount != null && <span>{d.pageCount} pág.</span>}
                  <span>v{d.version}</span>
                  <span>{formatDate(d.updatedAt)}</span>
                  {d.hasDraft && <Pill tone="info">Borrador</Pill>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
