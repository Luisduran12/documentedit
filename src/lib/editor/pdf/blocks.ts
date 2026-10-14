// Detección de bloques editables (líneas) a partir del análisis de la página.

import type { Rotation, ViewBox } from "../types";
import { apply, type PageAnalysis, type Segment, type ShowRecord } from "./interpret";
import { buildLine, type BlockPart } from "./layout";

export type Rect = { x: number; y: number; w: number; h: number };

export type TextBlock = {
  key: string;
  parts: BlockPart[];
  text: string;
  /** Caja en el marco de pantalla (pt, origen arriba-izquierda). */
  box: Rect;
  /** Cajas de cada glifo (marco de pantalla) — para el respaldo de tapado ajustado. */
  glyphBoxes: Rect[];
  align: "left" | "center" | "right";
  /** Rango horizontal disponible (marco) antes de chocar con un borde o con el texto vecino. */
  room: { x0: number; x1: number };
  /** false si alguna fuente no permite eliminar/reescribir con precisión. */
  clean: boolean;
  fontNames: string[];
  size: number;
};

export function nativeToFrame(nx: number, ny: number, view: ViewBox, rotation: Rotation): [number, number] {
  const [x0, y0, x1, y1] = view;
  const W = x1 - x0;
  const H = y1 - y0;
  const u = nx - x0;
  const v = ny - y0;
  switch (rotation) {
    case 0:
      return [u, H - v];
    case 90:
      return [v, u];
    case 180:
      return [W - u, v];
    case 270:
      return [H - v, W - u];
  }
}

const textOf = (r: ShowRecord) => r.glyphs.map((g) => g.unicode).join("");

/** Tamaño efectivo en puntos: muchos generadores usan Tf 1 y escalan con la matriz de texto. */
export const effectiveSize = (r: ShowRecord) => r.size * Math.hypot(r.trm[2], r.trm[3]);

/** Agrupa los registros en líneas: misma orientación y línea base, separación pequeña y sin borde entre medias. */
export function detectBlocks(analysis: PageAnalysis, view: ViewBox, rotation: Rotation): TextBlock[] {
  const recs = analysis.records.filter((r) => r.glyphs.length > 0 && r.render !== 3 && r.size > 0 && textOf(r).trim());
  const toFrame = (x: number, y: number) => nativeToFrame(x, y, view, rotation);

  // Cajas de glifos en el marco
  const boxes = new Map<ShowRecord, Rect[]>();
  for (const r of recs) {
    const asc = (r.font.ascent / 1000) * r.size;
    const desc = (r.font.descent / 1000) * r.size;
    boxes.set(
      r,
      r.glyphs.map((g) => {
        const pts = [
          apply(r.trm, g.tx, r.rise - desc),
          apply(r.trm, g.tx + g.adv, r.rise - desc),
          apply(r.trm, g.tx, r.rise + asc),
          apply(r.trm, g.tx + g.adv, r.rise + asc),
        ].map(([x, y]) => toFrame(x, y));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }),
    );
  }

  // Bordes verticales y horizontales en el marco
  const rules = analysis.rules.map((s: Segment) => {
    const [ax, ay] = toFrame(s.x0, s.y0);
    const [bx, by] = toFrame(s.x1, s.y1);
    return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  });
  const vertical = rules.filter((r) => r.x1 - r.x0 < 1.5 && r.y1 - r.y0 > 2);

  // Orden de lectura: por orientación + línea base
  type Item = { rec: ShowRecord; dir: [number, number]; base: number; s0: number; s1: number; box: Rect };
  const items: Item[] = recs.map((rec) => {
    const len = Math.hypot(rec.trm[0], rec.trm[1]) || 1;
    const dir: [number, number] = [rec.trm[0] / len, rec.trm[1] / len];
    const [ox, oy] = apply(rec.trm, 0, 0);
    const base = -dir[1] * ox + dir[0] * oy; // distancia perpendicular de la línea base
    const s0 = dir[0] * ox + dir[1] * oy;
    const bs = boxes.get(rec)!;
    const box = union(bs);
    return { rec, dir, base, s0, s1: s0 + rec.advance * len, box };
  });
  items.sort((a, b) => b.base - a.base || a.s0 - b.s0);

  const lines: Item[][] = [];
  for (const it of items) {
    const line = lines.find((l) => {
      const lastItem = l[l.length - 1];
      const sameDir = Math.abs(lastItem.dir[0] - it.dir[0]) < 0.01 && Math.abs(lastItem.dir[1] - it.dir[1]) < 0.01;
      const sameScale = Math.abs(Math.hypot(lastItem.rec.trm[0], lastItem.rec.trm[1]) - Math.hypot(it.rec.trm[0], it.rec.trm[1])) < 0.01;
      const em = Math.max(effectiveSize(lastItem.rec), effectiveSize(it.rec));
      if (!sameDir || !sameScale || Math.abs(lastItem.base - it.base) > em * 0.3) return false;
      const gap = it.s0 - lastItem.s1;
      if (gap > em * 1.5 || gap < -em) return false;
      // ¿Hay un borde vertical entre los dos fragmentos?
      const xL = lastItem.box.x + lastItem.box.w;
      const xR = it.box.x;
      const yMid = (it.box.y + it.box.y + it.box.h) / 2;
      return !vertical.some((v) => v.x0 > Math.min(xL, xR) - 0.5 && v.x0 < Math.max(xL, xR) + 0.5 && v.y0 <= yMid && v.y1 >= yMid);
    });
    if (line) line.push(it);
    else lines.push([it]);
  }

  return lines.map((l, idx) => {
    const glyphBoxes = l.flatMap((it) => boxes.get(it.rec)!);
    const box = union(l.map((it) => it.box));
    const parts = l.map((it) => ({ rec: it.rec.id, from: 0, to: it.rec.glyphs.length }));
    // Texto editable con los espacios "virtuales" entre palabras posicionadas por separado.
    const text = buildLine(analysis.records, parts)?.text ?? l.map((it) => textOf(it.rec)).join("");
    const yMid = box.y + box.h / 2;
    // Celda: bordes verticales más cercanos a izquierda y derecha que cruzan la línea
    const crossing = vertical.filter((v) => v.y0 <= yMid && v.y1 >= yMid);
    const left = Math.max(-Infinity, ...crossing.filter((v) => v.x0 <= box.x + 0.5).map((v) => v.x0));
    const right = Math.min(Infinity, ...crossing.filter((v) => v.x0 >= box.x + box.w - 0.5).map((v) => v.x0));
    let align: TextBlock["align"] = "left";
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const lg = box.x - left;
      const rg = right - (box.x + box.w);
      if (Math.abs(lg - rg) < Math.max(1.5, (right - left) * 0.04) && lg > 2) align = "center";
      else if (rg < lg && rg < 8) align = "right";
    }
    // Espacio disponible: hasta el borde de la celda o el texto vecino en la misma línea base
    const neighbours = items.filter((o) => !l.includes(o) && o.box.y < box.y + box.h && o.box.y + o.box.h > box.y);
    const x0 = Math.max(Number.isFinite(left) ? left + 1 : 0, ...neighbours.filter((o) => o.box.x + o.box.w <= box.x).map((o) => o.box.x + o.box.w + 2));
    const x1 = Math.min(Number.isFinite(right) ? right - 1 : Infinity, ...neighbours.filter((o) => o.box.x >= box.x + box.w).map((o) => o.box.x - 2));
    const fontNames = [...new Set(l.map((it) => it.rec.font.baseFont))];
    return {
      key: `${parts[0].rec}:${idx}`,
      parts,
      text,
      box,
      glyphBoxes,
      align,
      room: { x0, x1: Number.isFinite(x1) ? x1 : Infinity },
      clean: analysis.ok && l.every((it) => it.rec.font.supported),
      fontNames,
      size: Math.max(...l.map((it) => effectiveSize(it.rec))),
    };
  });
}

export function union(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
