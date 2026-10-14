"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { cssFont, ensureFont, measureText } from "@/lib/editor/font-runtime";
import { updateObject } from "@/lib/editor/store";
import type { EditObject, PageState, TextObject } from "@/lib/editor/types";
import { qrPngDataUrl } from "@/lib/qr";
import { useEditor } from "./editor-context";
import { startGesture, visualBox, type Corner } from "./gestures";
import { isOverflowing, TextEditInput, textEditBounds } from "./text-edit-view";

const qrCache = new Map<string, Promise<string>>();
function useQrDataUrl(url: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    if (!qrCache.has(url)) qrCache.set(url, qrPngDataUrl(url, 1024));
    let alive = true;
    qrCache.get(url)!.then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url]);
  return src;
}

export function textCss(obj: TextObject, zoom: number, custom: ReturnType<typeof useEditor>["customCatalog"]): CSSProperties {
  const f = cssFont(obj.style.font, custom);
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    fontStyle: f.style,
    fontSize: obj.style.size * zoom,
    lineHeight: obj.style.lineHeight,
    letterSpacing: obj.style.tracking * zoom,
    color: obj.style.color,
    opacity: obj.style.opacity,
    textAlign: obj.style.align,
    whiteSpace: "pre",
  };
}

export function ObjectView({ obj, page, wrapperRef }: { obj: EditObject; page: PageState; wrapperRef: RefObject<HTMLDivElement | null> }) {
  const ed = useEditor();
  const { zoom, tool } = ed;
  const selected = ed.selectedIds.includes(obj.id);
  const primary = ed.selectedId === obj.id && ed.selectedIds.length === 1;
  const editing = ed.editingId === obj.id && (obj.type === "text" || obj.type === "textEdit");
  const qrSrc = useQrDataUrl(obj.type === "qr" ? obj.url : null);
  const interactive = tool === "select" || tool === "editText" || tool === "addText";

  // Asegurar que la fuente del texto esté cargada (si no, CSS mostraría una sustituta).
  useEffect(() => {
    if (obj.type === "text") ensureFont(obj.style.font, ed.customCatalog);
  }, [obj, ed.customCatalog]);

  if (obj.type === "imageEdit" && obj.removed) return null;

  const report = ed.textReports[obj.id]?.report;
  const vb = obj.type === "textEdit" ? textEditBounds(obj, report) : visualBox(obj);
  const overflow = obj.type === "textEdit" ? isOverflowing(obj, vb) : false;
  // El texto original movido ya incluye su rotación en el render; el recuadro se gira igual.
  const rotation = obj.rotation ?? 0;

  function onPointerDown(e: RPointerEvent) {
    if (!interactive || editing || e.button !== 0) return;
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const corner = target.closest<HTMLElement>("[data-corner]")?.dataset.corner as Corner | undefined;
    const rotate = Boolean(target.closest("[data-rotate]"));
    ed.setCurrentPageId(page.id);
    if (e.shiftKey && !corner && !rotate) {
      ed.setSelection(selected ? ed.selectedIds.filter((x) => x !== obj.id) : [...ed.selectedIds, obj.id]);
      return;
    }
    const wasSelected = selected && ed.selectedIds.length === 1;
    const ids = selected && !corner && !rotate ? ed.selectedIds : [obj.id];
    if (!selected) ed.setSelection([obj.id]);
    startGesture({
      ed,
      kind: rotate ? "rotate" : corner ? "resize" : "move",
      ids,
      page,
      wrapper: wrapperRef.current!,
      clientX: e.clientX,
      clientY: e.clientY,
      corner,
      onEnd: (didMove) => {
        if (!didMove && wasSelected && (obj.type === "text" || obj.type === "textEdit")) ed.setEditingId(obj.id);
      },
    });
  }

  const box: CSSProperties = {
    left: vb.x * zoom,
    top: vb.y * zoom,
    width: Math.max(vb.w, 2) * zoom,
    height: Math.max(vb.h, 2) * zoom,
    transform: rotation && obj.type !== "textEdit" ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center",
  };

  let content: React.ReactNode = null;
  switch (obj.type) {
    case "textEdit":
    case "imageEdit":
      // Contenido original: se ve en el render real (vista previa = exportación); aquí solo la zona interactiva.
      content = editing && obj.type === "textEdit" ? <TextEditInput obj={obj} /> : null;
      break;
    case "zoneErase":
      content = (
        <div className="flex h-full w-full items-start justify-end border border-dashed border-danger/70">
          <span className="m-0.5 rounded bg-danger/80 px-1 text-[10px] font-semibold text-white">{obj.label ?? "Zona borrada"}</span>
        </div>
      );
      break;
    case "text":
      content = editing ? <TextEditor obj={obj} /> : <div style={textCss(obj, zoom, ed.customCatalog)}>{obj.text}</div>;
      break;
    case "image":
      content = (
        // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por URL firmada
        <img
          src={`/api/assets?key=${encodeURIComponent(obj.assetKey)}`}
          alt=""
          draggable={false}
          className={`h-full w-full select-none ${obj.pixelated ? "[image-rendering:pixelated]" : ""}`}
          style={{ opacity: obj.opacity, objectFit: obj.fit === "cover" ? "cover" : obj.fit === "contain" ? "contain" : "fill" }}
        />
      );
      break;
    case "qr":
      // eslint-disable-next-line @next/next/no-img-element -- data URL local
      content = qrSrc ? <img src={qrSrc} alt={`QR ${obj.url}`} draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" /> : <div className="h-full w-full bg-white" />;
      break;
    case "highlight":
      content = <div className="h-full w-full mix-blend-multiply" style={{ background: obj.color, opacity: obj.opacity }} />;
      break;
    case "cover":
      content = <div className="h-full w-full" style={{ background: obj.color }} />;
      break;
    case "ink":
      content = (
        <svg viewBox={`0 0 ${obj.w} ${obj.h}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {obj.strokes.map((st, i) => (
            <polyline
              key={i}
              points={st.map(([u, v]) => `${u * obj.w},${v * obj.h}`).join(" ")}
              fill="none"
              stroke={obj.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: obj.width * zoom }}
            />
          ))}
        </svg>
      );
      break;
  }

  const canRotate = primary && obj.type !== "zoneErase" && obj.type !== "highlight";

  return (
    <>
      {obj.type === "text" && obj.cover && (
        <div
          className="pointer-events-none absolute"
          style={{ left: obj.cover.x * zoom, top: obj.cover.y * zoom, width: obj.cover.w * zoom, height: obj.cover.h * zoom, background: obj.cover.color }}
        />
      )}
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        data-obj-id={obj.id}
        aria-label={labelFor(obj)}
        aria-pressed={selected}
        onPointerDown={onPointerDown}
        onFocus={() => interactive && !selected && ed.setSelection([obj.id])}
        className={`absolute ${interactive ? (editing ? "" : obj.type === "textEdit" && selected ? "cursor-text" : "cursor-grab active:cursor-grabbing") : "pointer-events-none"} ${
          overflow
            ? "outline-2 outline-offset-1 outline-warning"
            : selected
              ? "outline-2 outline-offset-1 outline-accent-strong"
              : interactive
                ? `hover:outline-1 hover:outline-accent-strong/60 ${obj.type === "textEdit" ? "outline-1 outline-accent-strong/25" : ""}`
                : ""
        }`}
        style={{ ...box, touchAction: interactive ? "none" : undefined, outlineStyle: selected || interactive ? "solid" : undefined }}
      >
        {content}
        {primary && !editing && interactive && (
          <>
            {(["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
              <span
                key={c}
                data-corner={c}
                aria-hidden
                className="absolute flex h-11 w-11 items-center justify-center"
                style={{
                  left: c.includes("w") ? -22 : undefined,
                  right: c.includes("e") ? -22 : undefined,
                  top: c.includes("n") ? -22 : undefined,
                  bottom: c.includes("s") ? -22 : undefined,
                  cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
                  touchAction: "none",
                }}
              >
                <span className="h-3 w-3 rounded-sm border-2 border-accent-strong bg-white" />
              </span>
            ))}
            {canRotate && (
              <span data-rotate aria-hidden title="Rotar (Shift: pasos de 15°)" className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center" style={{ top: -50, cursor: "grab", touchAction: "none" }}>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-strong bg-white" />
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
}

function labelFor(obj: EditObject) {
  switch (obj.type) {
    case "text":
      return `Texto: ${obj.text.slice(0, 40)}`;
    case "textEdit":
      return `Texto original editado: ${obj.text.slice(0, 40)}`;
    case "image":
      return "Imagen";
    case "qr":
      return "Código QR";
    case "highlight":
      return "Resaltado";
    case "cover":
      return "Zona tapada";
    case "ink":
      return "Dibujo o firma";
    case "zoneErase":
      return "Zona borrada";
    case "imageEdit":
      return "Imagen original del PDF";
  }
}

/** Edición en línea: un textarea con el mismo estilo; la caja crece con el contenido. */
function TextEditor({ obj }: { obj: TextObject }) {
  const ed = useEditor();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // En el siguiente ciclo: si se enfoca dentro del mismo pointerdown, la acción por defecto
    // del mousedown devolvería el foco al body y cerraría la edición.
    const t = setTimeout(() => {
      el.focus();
      el.select();
    }, 0);
    ed.store.gestureStart();
    return () => {
      clearTimeout(t);
      ed.store.gestureEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={ref}
      value={obj.text}
      aria-label="Editar texto"
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const text = e.target.value;
        const m = measureText(text || " ", obj.style, ed.customCatalog);
        const w = obj.style.align === "left" ? m.w : Math.max(m.w, obj.w);
        const x = obj.style.align === "right" ? obj.x + obj.w - w : obj.style.align === "center" ? obj.x + (obj.w - w) / 2 : obj.x;
        ed.store.gestureMove(updateObject(ed.store.doc, obj.id, { text, w, h: m.h, x }));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.setEditingId(null);
        e.stopPropagation();
      }}
      onBlur={() => ed.setEditingId(null)}
      className="block h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{ ...textCss(obj, ed.zoom, ed.customCatalog), caretColor: "#7c3aed" }}
    />
  );
}
