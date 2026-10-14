"use client";

import type { ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, AlertTriangle, ArrowDownToLine, ArrowUpToLine, Bold, Copy, Italic, RotateCw, Trash2, Undo2 } from "lucide-react";
import { BUNDLED_FONTS, findFont, mapFont, STANDARD_FONTS } from "@/lib/editor/fonts";
import { ensureFont, measureText } from "@/lib/editor/font-runtime";
import { frameSize } from "@/lib/editor/geometry";
import { bringToFront, deletePage, duplicatePage, removeObject, rotatePage, sendToBack, updateObject } from "@/lib/editor/store";
import type { EditObject, TextObject, TextStyle } from "@/lib/editor/types";
import { FontUploadButton } from "@/components/settings/font-upload";
import { useEditor } from "./editor-context";
import { effectiveDpi, LOW_DPI } from "./image-input";
import { TextEditInspector } from "./text-edit-inspector";
import { ImageEditInspector, MultiInspector, ZoneEraseInspector } from "./inspector-extra";

const PT_TO_MM = 25.4 / 72;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, step = 1, min, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="input h-10 pr-8 font-mono text-mono-data"
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-mono-timer text-fg-muted">{suffix}</span>}
    </div>
  );
}

function Color({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1" />
      <input
        value={value.toUpperCase()}
        aria-label={`${label} (hexadecimal)`}
        onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())}
        className="input h-10 flex-1 font-mono text-mono-data"
        maxLength={7}
      />
    </div>
  );
}

function Toggle({ active, onClick, label, children, disabled }: { active: boolean; onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${
        active ? "border-accent-strong bg-accent/20 text-fg" : "border-border bg-subtle text-fg-2 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function Inspector() {
  const ed = useEditor();
  const obj = ed.store.doc.objects.find((o) => o.id === ed.selectedId);
  return (
    <div className="flex flex-col gap-5 p-4">
      {ed.selectedIds.length > 1 ? <MultiInspector /> : obj ? <ObjectInspector obj={obj} /> : <PageInspector />}
    </div>
  );
}

function PageInspector() {
  const ed = useEditor();
  const { store } = ed;
  const idx = store.doc.pages.findIndex((p) => p.id === ed.currentPageId);
  const page = store.doc.pages[idx];
  if (!page) return null;
  const f = frameSize(page.view, page.baseRotation);
  const landscape = (page.rotation === 90 || page.rotation === 270 ? f.h > f.w : f.w > f.h);
  return (
    <>
      <div>
        <h3 className="label">Página {idx + 1}</h3>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-fg-muted">Dimensiones</dt>
          <dd className="text-right font-mono text-mono-data">
            {Math.round(f.w * PT_TO_MM)} × {Math.round(f.h * PT_TO_MM)} mm
          </dd>
          <dt className="text-fg-muted">Orientación</dt>
          <dd className="text-right">{landscape ? "Horizontal" : "Vertical"}</dd>
          <dt className="text-fg-muted">Origen</dt>
          <dd className="text-right">{page.src === null ? "Página en blanco" : `Página ${page.src + 1} del original`}</dd>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary h-10" onClick={() => store.change(rotatePage(store.doc, page.id, 90))}>
          <RotateCw className="h-4 w-4" /> Rotar
        </button>
        <button type="button" className="btn btn-secondary h-10" onClick={() => store.change(duplicatePage(store.doc, page.id))}>
          <Copy className="h-4 w-4" /> Duplicar
        </button>
        <button type="button" className="btn btn-secondary h-10 hover:text-danger-fg" disabled={store.doc.pages.length <= 1} onClick={() => store.change(deletePage(store.doc, page.id))}>
          <Trash2 className="h-4 w-4" /> Eliminar
        </button>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        Con <strong className="text-fg-2">Seleccionar</strong> puedes arrastrar textos, imágenes y QR del PDF y todo lo añadido. Usa{" "}
        <strong className="text-fg-2">Editar texto</strong> para cambiar textos existentes.
      </p>
      <p className="rounded-xl border border-white/[0.06] p-3 text-xs leading-relaxed text-fg-muted">
        Límite: las <strong className="text-fg-2">líneas sueltas de tabla y los gráficos vectoriales</strong> no son objetos individuales del PDF, así que no se pueden arrastrar. Para quitarlos usa{" "}
        <strong className="text-fg-2">Borrar zona</strong>. Textos, imágenes y QR sí se mueven al 100 %.
      </p>
    </>
  );
}

function ObjectInspector({ obj }: { obj: EditObject }) {
  const ed = useEditor();
  const { store } = ed;
  const set = (patch: Partial<EditObject>) => store.change(updateObject(store.doc, obj.id, patch));

  if (obj.type === "textEdit") return <TextEditInspector obj={obj} />;
  if (obj.type === "imageEdit") return <ImageEditInspector obj={obj} />;
  if (obj.type === "zoneErase") return <ZoneEraseInspector obj={obj} />;
  return (
    <>
      {obj.type === "text" && <TextInspector obj={obj} />}
      {obj.type === "image" && (
        <>
          <Field label={`Opacidad · ${Math.round(obj.opacity * 100)} %`}>
            <input type="range" min={0.1} max={1} step={0.05} value={obj.opacity} onChange={(e) => set({ opacity: +e.target.value })} className="w-full accent-primary" />
          </Field>
          <Field label="Encaje en el recuadro">
            <select value={obj.fit ?? "stretch"} onChange={(e) => set({ fit: e.target.value as "stretch" | "contain" | "cover" })} className="input h-10">
              <option value="stretch">Estirar al recuadro</option>
              <option value="contain">Ajustar (completa, sin recortar)</option>
              <option value="cover">Rellenar (cubre y recorta)</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(obj.pixelated)} onChange={(e) => set({ pixelated: e.target.checked || undefined })} />
            Nítido (sin suavizado; recomendado para QR)
          </label>
          {obj.px && (
            <p className={`text-xs ${effectiveDpi(obj.px.w, obj.w) < LOW_DPI ? "text-warning-fg" : "text-fg-muted"}`}>
              {obj.px.w} × {obj.px.h} px · {Math.round(effectiveDpi(obj.px.w, obj.w))} ppp a este tamaño
              {effectiveDpi(obj.px.w, obj.w) < LOW_DPI ? " — resolución baja, puede verse borrosa al imprimir" : ""}
            </p>
          )}
          <p className="text-xs text-fg-muted">Para reemplazarla, pega (Cmd/Ctrl+V) o suelta otra imagen con esta seleccionada.</p>
        </>
      )}
      {obj.type === "qr" && (
        <div className="rounded-xl bg-subtle p-3 text-xs text-fg-2">
          <p className="mb-1 font-medium text-fg">Código QR de imagen temporal</p>
          <p className="break-all font-mono text-accent-fg">{obj.url}</p>
          <p className="mt-2 text-fg-muted">Para un escaneo fiable deja al menos 2 cm de lado en impreso.</p>
        </div>
      )}
      {obj.type === "highlight" && (
        <>
          <Field label="Color">
            <Color value={obj.color} onChange={(color) => set({ color })} label="Color del resaltado" />
          </Field>
          <Field label={`Opacidad · ${Math.round(obj.opacity * 100)} %`}>
            <input type="range" min={0.1} max={0.9} step={0.05} value={obj.opacity} onChange={(e) => set({ opacity: +e.target.value })} className="w-full accent-primary" />
          </Field>
        </>
      )}
      {obj.type === "cover" && (
        <Field label="Color de relleno">
          <Color value={obj.color} onChange={(color) => set({ color })} label="Color de relleno" />
        </Field>
      )}
      {obj.type === "ink" && (
        <>
          <Field label="Color del trazo">
            <Color value={obj.color} onChange={(color) => set({ color })} label="Color del trazo" />
          </Field>
          <Field label="Grosor">
            <Num value={obj.width} min={0.5} step={0.5} onChange={(width) => set({ width: Math.max(0.5, width) })} suffix="pt" />
          </Field>
        </>
      )}

      <div>
        <span className="label">Posición y tamaño</span>
        <div className="grid grid-cols-2 gap-2">
          <Num value={obj.x} onChange={(x) => set({ x })} suffix="X" />
          <Num value={obj.y} onChange={(y) => set({ y })} suffix="Y" />
          <Num value={obj.w} min={4} onChange={(w) => set(obj.type === "qr" ? { w, h: w } : { w })} suffix="An" />
          <Num value={obj.h} min={4} onChange={(h) => set(obj.type === "qr" ? { w: h, h } : { h })} suffix="Al" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary h-10" onClick={() => store.change(bringToFront(store.doc, obj.id))}>
          <ArrowUpToLine className="h-4 w-4" /> Al frente
        </button>
        <button type="button" className="btn btn-secondary h-10" onClick={() => store.change(sendToBack(store.doc, obj.id))}>
          <ArrowDownToLine className="h-4 w-4" /> Atrás
        </button>
        <button
          type="button"
          className="btn btn-secondary h-10 hover:text-danger-fg"
          onClick={() => {
            store.change(removeObject(store.doc, obj.id));
            ed.select(null);
          }}
        >
          {obj.type === "text" && obj.cover ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          {obj.type === "text" && obj.cover ? "Restaurar original" : "Eliminar"}
        </button>
      </div>
    </>
  );
}

function TextInspector({ obj }: { obj: TextObject }) {
  const ed = useEditor();
  const { store, customCatalog } = ed;
  const cat = findFont(obj.style.font.family, customCatalog);
  const isCustom = cat?.kind === "custom";
  const match = obj.sourceFont ? mapFont(obj.sourceFont, undefined, customCatalog) : null;
  const usingFallback = match && !match.exact && obj.style.font.family === match.font.family;

  async function setStyle(patch: Partial<TextStyle>) {
    const style = { ...obj.style, ...patch, font: { ...obj.style.font, ...(patch.font ?? {}) } };
    await ensureFont(style.font, customCatalog);
    const m = measureText(obj.text || " ", style, customCatalog);
    const w = style.align === "left" ? m.w : Math.max(m.w, obj.w);
    const latest = ed.store.doc.objects.find((o) => o.id === obj.id) as TextObject | undefined;
    if (!latest) return;
    store.change(updateObject(ed.store.doc, obj.id, { style, w, h: m.h }));
  }

  return (
    <>
      <div>
        <span className="label">Tipografía</span>
        {obj.sourceFont && (
          <p className="mb-2 truncate font-mono text-mono-timer text-fg-muted" title={obj.sourceFont}>
            Original: {obj.sourceFont.replace(/^[A-Z]{6}\+/, "")}
          </p>
        )}
        {usingFallback && (
          <div role="status" className="mb-3 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>
                Fuente original no disponible, usando <strong>{cat?.label.replace(/ \(.*\)$/, "")}</strong>. Puedes elegir otra o subir el archivo de la fuente.
              </p>
              <FontUploadButton
                className="btn btn-secondary h-9 text-xs"
                onUploaded={async (f) => {
                  await ed.reloadFonts();
                  setStyle({ font: { family: `custom:${f.id}`, bold: false, italic: false } });
                }}
              />
            </div>
          </div>
        )}
        <select
          value={obj.style.font.family}
          aria-label="Fuente"
          onChange={(e) => setStyle({ font: { ...obj.style.font, family: e.target.value } })}
          className="input h-10"
        >
          <optgroup label="Estándar PDF">
            {STANDARD_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Incluidas">
            {BUNDLED_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          {customCatalog.length > 0 && (
            <optgroup label="Personalizadas">
              {customCatalog.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="flex gap-2">
        <Toggle label="Negrita" active={obj.style.font.bold} disabled={isCustom} onClick={() => setStyle({ font: { ...obj.style.font, bold: !obj.style.font.bold } })}>
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle label="Cursiva" active={obj.style.font.italic} disabled={isCustom} onClick={() => setStyle({ font: { ...obj.style.font, italic: !obj.style.font.italic } })}>
          <Italic className="h-4 w-4" />
        </Toggle>
        <span className="mx-1 w-px bg-border" />
        {(["left", "center", "right"] as const).map((a) => (
          <Toggle key={a} label={{ left: "Alinear a la izquierda", center: "Centrar", right: "Alinear a la derecha" }[a]} active={obj.style.align === a} onClick={() => setStyle({ align: a })}>
            {a === "left" ? <AlignLeft className="h-4 w-4" /> : a === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
          </Toggle>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tamaño">
          <Num value={obj.style.size} min={2} step={0.5} onChange={(size) => setStyle({ size: Math.max(2, size) })} suffix="pt" />
        </Field>
        <Field label="Interlineado">
          <Num value={obj.style.lineHeight} min={0.8} step={0.05} onChange={(lineHeight) => setStyle({ lineHeight: Math.max(0.8, lineHeight) })} suffix="×" />
        </Field>
        <Field label="Espaciado">
          <Num value={obj.style.tracking} step={0.1} onChange={(tracking) => setStyle({ tracking })} suffix="pt" />
        </Field>
        <Field label={`Opacidad · ${Math.round(obj.style.opacity * 100)} %`}>
          <input type="range" min={0.1} max={1} step={0.05} value={obj.style.opacity} onChange={(e) => setStyle({ opacity: +e.target.value })} className="mt-3 w-full accent-primary" />
        </Field>
      </div>

      <Field label="Color del texto">
        <Color value={obj.style.color} onChange={(color) => setStyle({ color })} label="Color del texto" />
      </Field>

      {obj.cover && (
        <Field label="Color de fondo (tapa el texto original)">
          <Color value={obj.cover.color} onChange={(color) => store.change(updateObject(store.doc, obj.id, { cover: { ...obj.cover!, color } }))} label="Color de fondo" />
        </Field>
      )}
    </>
  );
}
