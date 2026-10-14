"use client";

// Controlador de gestos (ratón y dedo): mover, redimensionar y rotar uno o varios objetos, con guías de
// alineación magnéticas. Usa escuchas en `window`, así un mismo gesto puede empezar sobre un elemento
// original del PDF (que se convierte en objeto editable en ese instante) y seguir arrastrándose.

import { frameSize } from "@/lib/editor/geometry";
import type { EditDoc, EditObject, PageState, TextObject } from "@/lib/editor/types";
import type { EditorCtx } from "./editor-context";
import { clientToFrame } from "./page-view";

export type Corner = "nw" | "ne" | "sw" | "se";

type Box = { x: number; y: number; w: number; h: number };

/** Caja visible de un objeto (los textos originales movidos usan su desplazamiento). */
export function visualBox(o: EditObject): Box {
  if (o.type === "textEdit") return { x: o.x + (o.dx ?? 0), y: o.y + (o.dy ?? 0), w: o.w, h: o.h };
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function moved(o: EditObject, dx: number, dy: number): EditObject {
  if (o.type === "textEdit") return { ...o, dx: (o.dx ?? 0) + dx, dy: (o.dy ?? 0) + dy };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

const SNAP_PX = 6;

/** Mientras dura un pellizco de redimensión, el arrastre de un dedo queda en pausa. */
export const pinchState = { active: false };

/** Ajusta un desplazamiento a las guías (bordes y centros de la página y de otros objetos). */
function snap(box: Box, doc: EditDoc, page: PageState, exclude: Set<string>, zoom: number) {
  const f = frameSize(page.view, page.baseRotation);
  const xs = [0, f.w / 2, f.w];
  const ys = [0, f.h / 2, f.h];
  for (const o of doc.objects) {
    if (o.pageId !== page.id || exclude.has(o.id) || (o.type === "imageEdit" && o.removed)) continue;
    const b = visualBox(o);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  const tol = SNAP_PX / zoom;
  const pick = (cands: number[], vals: number[]) => {
    let best: { d: number; line: number } | null = null;
    for (const v of vals)
      for (const c of cands) {
        const d = c - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: c };
      }
    return best;
  };
  const sx = pick(xs, [box.x, box.x + box.w / 2, box.x + box.w]);
  const sy = pick(ys, [box.y, box.y + box.h / 2, box.y + box.h]);
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guideX: sx ? [sx.line] : [], guideY: sy ? [sy.line] : [] };
}

type Start = {
  ed: EditorCtx;
  kind: "move" | "resize" | "rotate";
  ids: string[];
  page: PageState;
  wrapper: HTMLElement;
  clientX: number;
  clientY: number;
  corner?: Corner;
  /** Documento base del gesto (si se acaba de crear un objeto, el doc que ya lo incluye). */
  baseDoc?: EditDoc;
  onEnd?: (movedAtAll: boolean) => void;
};

export function startGesture(s: Start) {
  const { ed, page, wrapper } = s;
  const baseDoc = s.baseDoc ?? ed.store.doc;
  const ids = new Set(s.ids);
  const base = baseDoc.objects.filter((o) => ids.has(o.id));
  if (base.length === 0) return;
  const toFrame = (cx: number, cy: number) => clientToFrame(cx, cy, wrapper, page, ed.zoom);
  const [sx, sy] = toFrame(s.clientX, s.clientY);
  let didMove = false;
  ed.store.gestureStart();

  const onMove = (e: PointerEvent) => {
    if (pinchState.active) return;
    const [x, y] = toFrame(e.clientX, e.clientY);
    let dx = x - sx;
    let dy = y - sy;
    if (!didMove && Math.hypot(dx, dy) * ed.zoom < 3) return;
    didMove = true;
    let next: EditObject[];
    if (s.kind === "move") {
      // Guías sobre la caja que engloba la selección (Alt desactiva el imán).
      const union = base.map(visualBox).reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) }));
      const sn = e.altKey ? { dx: 0, dy: 0, guideX: [] as number[], guideY: [] as number[] } : snap({ ...union, x: union.x + dx, y: union.y + dy }, baseDoc, page, ids, ed.zoom);
      dx += sn.dx;
      dy += sn.dy;
      ed.setGuides(sn.guideX.length || sn.guideY.length ? { pageId: page.id, xs: sn.guideX, ys: sn.guideY } : null);
      next = base.map((o) => moved(o, dx, dy));
    } else if (s.kind === "resize") {
      const o = base[0];
      const b = visualBox(o);
      const west = s.corner!.includes("w");
      const north = s.corner!.includes("n");
      let w = Math.max(4, b.w + (west ? -dx : dx));
      let h = Math.max(4, b.h + (north ? -dy : dy));
      // Proporción fija por defecto; Shift = libre (QR siempre cuadrado; zonas y resaltados, libres).
      const free = o.type === "highlight" || o.type === "cover" || o.type === "zoneErase";
      if ((!e.shiftKey && !free) || o.type === "qr") {
        const ratio = b.w / b.h;
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      const nx = west ? b.x + b.w - w : b.x;
      const ny = north ? b.y + b.h - h : b.y;
      next = [resized(o, { x: nx, y: ny, w, h }, w / b.w)];
    } else {
      const o = base[0];
      const b = visualBox(o);
      const c = [b.x + b.w / 2, b.y + b.h / 2];
      const a0 = Math.atan2(sy - c[1], sx - c[0]);
      const a1 = Math.atan2(y - c[1], x - c[0]);
      let deg = (o.rotation ?? 0) + ((a1 - a0) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      next = [{ ...o, rotation: Math.round(deg * 10) / 10 }];
    }
    const byId = new Map(next.map((o) => [o.id, o]));
    ed.store.gestureMove({ ...baseDoc, objects: baseDoc.objects.map((o) => byId.get(o.id) ?? o) });
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    ed.setGuides(null);
    ed.store.gestureEnd();
    s.onEnd?.(didMove);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** Redimensiona un objeto. Los textos escalan su tamaño de letra; los textos originales, su tamaño relativo. */
export function resized(o: EditObject, b: Box, k: number): EditObject {
  if (o.type === "textEdit") {
    const vb = visualBox(o);
    return { ...o, sizeScale: Math.max(0.1, (o.sizeScale || 1) * k), dx: (o.dx ?? 0) + (b.x - vb.x), dy: (o.dy ?? 0) + (b.y - vb.y) };
  }
  if (o.type === "text") {
    const t = o as TextObject;
    return { ...t, ...b, style: { ...t.style, size: Math.max(2, Math.round(t.style.size * k * 10) / 10), tracking: t.style.tracking * k } };
  }
  return { ...o, ...b };
}

/** Pellizco con dos dedos sobre un objeto seleccionado: escala uniforme alrededor de su centro. */
export function pinchResize(ed: EditorCtx, id: string, factor: number, baseDoc: EditDoc) {
  const o = baseDoc.objects.find((x) => x.id === id);
  if (!o) return;
  const b = visualBox(o);
  const w = Math.max(4, b.w * factor);
  const h = Math.max(4, b.h * factor);
  const next = resized(o, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h }, factor);
  ed.store.gestureMove({ ...baseDoc, objects: baseDoc.objects.map((x) => (x.id === id ? next : x)) });
}
