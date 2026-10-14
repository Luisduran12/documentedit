"use client";

import type { ReactNode } from "react";
import { AlertTriangle, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, Check, Info, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { ContentReport } from "@/lib/editor/pdf/text-edits";
import { alignSelection, deleteSelection, removeObject, updateObject } from "@/lib/editor/store";
import type { ImageEditObject, ZoneEraseObject } from "@/lib/editor/types";
import { useEditor } from "./editor-context";

function Chip({ tone, children }: { tone: "ok" | "warn" | "info"; children: ReactNode }) {
  const cls = { ok: "border-success/40 bg-success/10 text-success-fg", warn: "border-warning/40 bg-warning/10 text-warning-fg", info: "border-accent/40 bg-accent/10 text-accent-fg" }[tone];
  const Icon = tone === "ok" ? Check : tone === "warn" ? AlertTriangle : Info;
  return (
    <div role="status" className={`flex gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${cls}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Status({ report }: { report: ContentReport | undefined }) {
  if (!report || !("kind" in report)) return <p className="text-xs text-fg-muted">Calculando vista previa…</p>;
  return report.clean ? (
    <Chip tone="ok">Eliminado limpiamente del PDF (lo de alrededor queda intacto).</Chip>
  ) : (
    <Chip tone="warn">No se pudo eliminar limpiamente: se cubrió con color. El fondo puede verse alterado.</Chip>
  );
}

export function ImageEditInspector({ obj }: { obj: ImageEditObject }) {
  const ed = useEditor();
  const { store } = ed;
  const report = ed.textReports[obj.id]?.report;
  const moved = obj.x !== obj.orig.x || obj.y !== obj.orig.y || obj.w !== obj.orig.w || obj.h !== obj.orig.h || Boolean(obj.rotation);
  return (
    <>
      <div>
        <h3 className="label">Imagen original del PDF</h3>
        <p className="text-xs text-fg-muted">Arrástrala para moverla, usa las esquinas para cambiar su tamaño y el asa superior para rotarla. No se recomprime.</p>
      </div>
      {(obj.removed || moved) && <Status report={report} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-danger h-10" onClick={() => store.change(updateObject(store.doc, obj.id, { removed: true }))}>
          <Trash2 className="h-4 w-4" /> Borrar del PDF
        </button>
        {moved && (
          <button type="button" className="btn btn-secondary h-10" onClick={() => store.change(updateObject(store.doc, obj.id, { ...obj.orig, rotation: 0 }))}>
            <RotateCcw className="h-4 w-4" /> Volver a su sitio
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary h-10"
          onClick={() => {
            store.change(removeObject(store.doc, obj.id));
            ed.select(null);
          }}
        >
          <Undo2 className="h-4 w-4" /> Restaurar original
        </button>
      </div>
      <p className="text-xs text-fg-muted">Para reemplazarla, pega (Cmd/Ctrl+V) o suelta otra imagen con esta seleccionada.</p>
    </>
  );
}

export function ZoneEraseInspector({ obj }: { obj: ZoneEraseObject }) {
  const ed = useEditor();
  const { store } = ed;
  const report = ed.textReports[obj.id]?.report;
  const stats = report && "kind" in report && report.kind === "erase" ? report.stats : null;
  return (
    <>
      <div>
        <h3 className="label">{obj.label === "QR" ? "QR borrado" : "Zona borrada"}</h3>
        <p className="text-xs text-fg-muted">Se eliminan del PDF las imágenes y los trazos vectoriales que quedan dentro de la zona. Ajusta el recuadro con las esquinas.</p>
      </div>
      <Status report={report} />
      {stats && (
        <ul className="space-y-1 text-xs text-fg-2">
          <li>Imágenes eliminadas: {stats.images}</li>
          <li>Trazos/rellenos eliminados: {stats.paths + stats.subpaths}</li>
          {obj.includeText && <li>Letras eliminadas: {stats.glyphs}</li>}
        </ul>
      )}
      {stats && stats.crossing > 0 && (
        <Chip tone="info">
          Se conservaron {stats.crossing} {stats.crossing === 1 ? "trazo que atraviesa" : "trazos que atraviesan"} la zona (por ejemplo, líneas de tabla). Las líneas sueltas no son objetos individuales; si necesitas quitarlas, ajusta la zona para que las contenga por completo.
        </Chip>
      )}
      {stats && stats.partialImages > 0 && <Chip tone="info">{stats.partialImages} imagen(es) solo parcialmente dentro de la zona no se borraron.</Chip>}
      <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={obj.includeText} onChange={(e) => store.change(updateObject(store.doc, obj.id, { includeText: e.target.checked }))} />
        Borrar también el texto dentro de la zona
      </label>
      <button
        type="button"
        className="btn btn-secondary h-10 self-start"
        onClick={() => {
          store.change(removeObject(store.doc, obj.id));
          ed.select(null);
        }}
      >
        <Undo2 className="h-4 w-4" /> Restaurar lo borrado
      </button>
    </>
  );
}

export function MultiInspector() {
  const ed = useEditor();
  const { store, selectedIds } = ed;
  const align = (m: Parameters<typeof alignSelection>[2]) => store.change(alignSelection(store.doc, selectedIds, m));
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-subtle text-fg-2 hover:text-fg";
  return (
    <>
      <h3 className="label">{selectedIds.length} elementos seleccionados</h3>
      <div>
        <span className="label">Alinear</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} aria-label="Alinear a la izquierda" onClick={() => align("left")}><AlignStartVertical className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Centrar horizontalmente" onClick={() => align("center")}><AlignCenterVertical className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Alinear a la derecha" onClick={() => align("right")}><AlignEndVertical className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Alinear arriba" onClick={() => align("top")}><AlignStartHorizontal className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Centrar verticalmente" onClick={() => align("middle")}><AlignCenterHorizontal className="h-4 w-4" /></button>
          <button type="button" className={btn} aria-label="Alinear abajo" onClick={() => align("bottom")}><AlignEndHorizontal className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="text-xs text-fg-muted">Arrastra cualquiera para mover el grupo; flechas para ajustar (Shift: pasos grandes).</p>
      <button
        type="button"
        className="btn btn-danger h-10 self-start"
        onClick={() => {
          store.change(deleteSelection(store.doc, selectedIds));
          ed.select(null);
        }}
      >
        <Trash2 className="h-4 w-4" /> Borrar selección
      </button>
    </>
  );
}
