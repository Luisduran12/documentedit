"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { findFont } from "@/lib/editor/fonts";
import { substituteFamily } from "@/lib/editor/pdf/layout";
import { updateObject } from "@/lib/editor/store";
import type { TextEditObject } from "@/lib/editor/types";
import { useEditor } from "./editor-context";

let measureCtx: CanvasRenderingContext2D | null = null;
const measure = (text: string, font: string) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx!.font = font;
  return measureCtx!.measureText(text).width;
};

/** Familia CSS aproximada (solo para el cursor mientras se escribe; lo que se ve es el render real). */
export function approxCss(obj: TextEditObject) {
  const name = obj.fontNames?.[0] ?? "";
  const fam = obj.fontOverride ?? substituteFamily({ baseFont: name } as Parameters<typeof substituteFamily>[0]);
  return findFont(fam)?.css ?? '"Liberation Sans"';
}

export function textEditBounds(obj: TextEditObject, report?: object) {
  const b = report && "bounds" in report ? (report as { bounds?: { x: number; y: number; w: number; h: number } }).bounds : undefined;
  if (b && b.w > 0) return b;
  // Sin informe aún: la caja original, desplazada si el texto se movió.
  return { x: obj.x + (obj.dx ?? 0), y: obj.y + (obj.dy ?? 0), w: obj.w, h: obj.h };
}

export function isOverflowing(obj: TextEditObject, b: { x: number; w: number }) {
  return Boolean(obj.room && (b.x < obj.room.x0 - 0.5 || b.x + b.w > obj.room.x1 + 0.5));
}

/**
 * Campo de edición en línea para un texto original: transparente (se ve el render real de la vista
 * previa); el texto solo se muestra, en azul, mientras la vista previa aún no refleja lo escrito.
 */
export function TextEditInput({ obj }: { obj: TextEditObject }) {
  const ed = useEditor();
  const ref = useRef<HTMLInputElement>(null);
  const entry = ed.textReports[obj.id];
  const b = textEditBounds(obj, entry?.report);
  const fresh = entry?.text === obj.text;
  const zoom = ed.zoom;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    ed.store.gestureStart();
    return () => {
      clearTimeout(t);
      ed.store.gestureEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fontSize = (obj.h / 1.15) * obj.sizeScale * zoom;
  const font = `${fontSize}px ${approxCss(obj)}`;
  const natural = typeof document !== "undefined" ? measure(obj.text || " ", font) : 1;
  const scale = natural > 0 ? (b.w * zoom) / natural : 1;
  const style: CSSProperties = {
    position: "absolute",
    left: (b.x - obj.x) * zoom,
    top: (b.y - obj.y) * zoom,
    width: Math.max(b.w * zoom, natural) + 40,
    height: b.h * zoom,
    font,
    lineHeight: `${b.h * zoom}px`,
    color: fresh ? "transparent" : "#1d4ed8",
    caretColor: "#7c3aed",
    background: "transparent",
    transform: `scaleX(${Math.max(0.2, Math.min(5, scale))})`,
    transformOrigin: "left center",
    whiteSpace: "pre",
  };

  return (
    <input
      ref={ref}
      value={obj.text}
      aria-label={`Editar texto original: ${obj.originalText}`}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => ed.store.gestureMove(updateObject(ed.store.doc, obj.id, { text: e.target.value }))}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") ed.setEditingId(null);
        e.stopPropagation();
      }}
      onBlur={() => ed.setEditingId(null)}
      className="border-0 p-0 outline-none"
      style={style}
    />
  );
}
