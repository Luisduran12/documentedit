"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, Check, Loader2, MoveHorizontal, Undo2 } from "lucide-react";
import { BUNDLED_FONTS } from "@/lib/editor/fonts";
import type { Line } from "@/lib/editor/pdf/layout";
import { removeObject, updateObject } from "@/lib/editor/store";
import type { TextEditObject } from "@/lib/editor/types";
import { isTextReport } from "@/lib/editor/pdf/text-edits";
import { useEditor } from "./editor-context";
import { isOverflowing, textEditBounds } from "./text-edit-view";

function Chip({ tone, children }: { tone: "ok" | "warn" | "danger" | "info"; children: ReactNode }) {
  const cls = {
    ok: "border-success/40 bg-success/10 text-success-fg",
    warn: "border-warning/40 bg-warning/10 text-warning-fg",
    danger: "border-danger/40 bg-danger/10 text-danger-fg",
    info: "border-accent/40 bg-accent/10 text-accent-fg",
  }[tone];
  return (
    <div role="status" className={`flex gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${cls}`}>
      {tone === "ok" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

const Letters = ({ list }: { list: string[] }) => (
  <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
    {list.map((c) => (
      <kbd key={c} className="rounded border border-current/40 px-1 font-mono">
        {c === " " ? "␣" : c}
      </kbd>
    ))}
  </span>
);

export function TextEditInspector({ obj }: { obj: TextEditObject }) {
  const ed = useEditor();
  const { store } = ed;
  const page = store.doc.pages.find((p) => p.id === obj.pageId);
  const entry = ed.textReports[obj.id];
  const report = isTextReport(entry?.report) ? entry.report : undefined;
  const layout = report?.layout;
  const pending = entry?.text !== obj.text;
  const [line, setLine] = useState<Line | null>(null);
  const [fitting, setFitting] = useState(false);

  useEffect(() => {
    if (!ed.engine || !page) return;
    let alive = true;
    ed.engine.line(page, obj).then((l) => alive && setLine(l));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.engine, obj.parts, page?.id]);

  const set = (patch: Partial<TextEditObject>) => store.change(updateObject(store.doc, obj.id, patch));
  const main = line?.main;
  const effSize = main ? main.size * Math.hypot(main.trm[2], main.trm[3]) : null;
  const origTz = main?.tz ?? 100;
  const bounds = textEditBounds(obj, report);
  const overflow = isOverflowing(obj, bounds);
  const original = (obj.fontNames ?? []).join(", ") || "—";

  async function fit() {
    if (!ed.engine || !page) return;
    setFitting(true);
    try {
      set({ scaleX: Math.round((await ed.engine.fit(page, obj)) * 10000) / 10000 });
    } finally {
      setFitting(false);
    }
  }

  return (
    <>
      <div>
        <label htmlFor="te-text" className="label">Texto</label>
        <input id="te-text" value={obj.text} onChange={(e) => set({ text: e.target.value })} className="input h-10" spellCheck={false} />
        <p className="mt-1 truncate font-mono text-mono-timer text-fg-muted" title={obj.originalText}>
          Original: {obj.originalText}
        </p>
      </div>

      {/* Indicadores honestos */}
      <div className="flex flex-col gap-2" aria-live="polite">
        {!report ? (
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando vista previa…
          </p>
        ) : (
          <>
            {report.removal === "clean" ? (
              <Chip tone="ok">Texto original eliminado limpiamente (líneas y fondo intactos).</Chip>
            ) : (
              <Chip tone="warn">
                <strong>Cubierto con color.</strong> Este texto no se pudo eliminar limpiamente; el fondo puede verse alterado.
              </Chip>
            )}
            {obj.fontOverride ? (
              <Chip tone="info">Fuente elegida a mano: {BUNDLED_FONTS.find((f) => f.id === obj.fontOverride)?.label}.</Chip>
            ) : layout && layout.substituted.length === 0 && report.removal === "clean" ? (
              <Chip tone="ok">Fuente exacta: {original} (la fuente incrustada del propio PDF).</Chip>
            ) : (
              <Chip tone="warn">
                Fuente sustituida{report.removal === "clean" ? " en estas letras (no existen en la fuente incrustada)" : ""}:
                {layout && layout.substituted.length > 0 ? <Letters list={layout.substituted} /> : <> todo el texto ({layout?.usedFonts.join(", ")})</>}
              </Chip>
            )}
            {layout && layout.missing.length > 0 && (
              <Chip tone="danger">
                Ninguna fuente disponible puede dibujar: <Letters list={layout.missing} />
              </Chip>
            )}
            {overflow && (
              <Chip tone="warn">
                El texto nuevo ocupa más que el espacio disponible en la celda.
                <button type="button" className="mt-1.5 block font-semibold underline" onClick={fit}>
                  Ajustar al ancho original
                </button>
              </Chip>
            )}
            {pending && <p className="text-xs text-fg-muted">Actualizando vista previa…</p>}
          </>
        )}
      </div>

      <div>
        <span className="label">Ancho</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="sr-only">Escala horizontal (%)</span>
            <div className="relative">
              <input
                type="number"
                step={1}
                min={20}
                max={300}
                value={Math.round(origTz * obj.scaleX * 10) / 10}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) set({ scaleX: v / origTz });
                }}
                className="input h-10 pr-8 font-mono text-mono-data"
                aria-label="Escala horizontal (%)"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-mono-timer text-fg-muted">%</span>
            </div>
          </label>
          <button type="button" className="btn btn-secondary h-10 text-xs" onClick={fit} disabled={fitting}>
            {fitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveHorizontal className="h-4 w-4" />} Ajustar al ancho
          </button>
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          Escala original {Math.round(origTz)} %
          {layout ? ` · ancho ${Math.round((layout.width / (layout.originalWidth || 1)) * 100)} % del original` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Tamaño</span>
          <div className="relative">
            <input
              type="number"
              step={0.1}
              min={1}
              value={effSize ? Math.round(effSize * obj.sizeScale * 10) / 10 : ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (effSize && Number.isFinite(v) && v > 0) set({ sizeScale: v / effSize });
              }}
              className="input h-10 pr-8 font-mono text-mono-data"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-mono-timer text-fg-muted">pt</span>
          </div>
        </label>
        <label className="block">
          <span className="label">Color</span>
          <input
            type="color"
            value={obj.color ?? main?.fill.hex ?? "#000000"}
            onChange={(e) => set({ color: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-border bg-transparent p-1"
          />
        </label>
      </div>

      <div>
        <label htmlFor="te-font" className="label">Fuente</label>
        <select
          id="te-font"
          value={obj.fontOverride ?? ""}
          onChange={(e) => set({ fontOverride: e.target.value || undefined })}
          className="input h-10"
        >
          <option value="">Original del PDF ({original})</option>
          {BUNDLED_FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Alineación</span>
        <div className="flex gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={obj.align === a}
              aria-label={{ left: "Alinear a la izquierda", center: "Centrar", right: "Alinear a la derecha" }[a]}
              onClick={() => set({ align: a })}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border ${obj.align === a ? "border-accent-strong bg-accent/20" : "border-border bg-subtle text-fg-2"}`}
            >
              {a === "left" ? <AlignLeft className="h-4 w-4" /> : a === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-white/[0.06] p-3">
        <summary className="cursor-pointer text-sm text-fg-2">Avanzado</summary>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={Boolean(obj.cover?.forced)}
            onChange={(e) =>
              set({
                cover: e.target.checked
                  ? { color: obj.cover?.color ?? "#ffffff", rects: obj.cover?.rects ?? [{ x: obj.x - 0.3, y: obj.y - 0.3, w: obj.w + 0.6, h: obj.h + 0.6 }], forced: true }
                  : undefined,
              })
            }
          />
          Tapar con color (solo si no se puede eliminar el texto)
        </label>
        {obj.cover && (
          <label className="mt-2 flex items-center gap-2 text-sm text-fg-2">
            Color de relleno
            <input
              type="color"
              value={obj.cover.color}
              onChange={(e) => set({ cover: { ...obj.cover!, color: e.target.value } })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1"
            />
          </label>
        )}
      </details>

      <button
        type="button"
        className="btn btn-secondary h-10 self-start hover:text-danger-fg"
        onClick={() => {
          store.change(removeObject(store.doc, obj.id));
          ed.select(null);
        }}
      >
        <Undo2 className="h-4 w-4" /> Restaurar original
      </button>
    </>
  );
}
