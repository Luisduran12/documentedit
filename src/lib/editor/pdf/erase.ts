// "Borrar zona" y borrado de imágenes originales: se eliminan las operaciones de dibujo del content stream
// (imágenes, trayectos vectoriales y, opcionalmente, glifos) que caen dentro de la zona. Las líneas que
// atraviesan la zona se conservan (y se informa).

import { apply, type PageAnalysis } from "./interpret";
import type { RemovalMap } from "./rewrite";

export type UserRect = [number, number, number, number];

export type EraseStats = {
  images: number;
  paths: number;
  subpaths: number;
  glyphs: number;
  /** Trazos/rellenos que atraviesan la zona y se conservaron (p. ej. líneas de tabla). */
  crossing: number;
  /** Imágenes solo parcialmente dentro de la zona (no se borran). */
  partialImages: number;
};

const inside = (b: UserRect, z: UserRect, tol = 0.5) => b[0] >= z[0] - tol && b[1] >= z[1] - tol && b[2] <= z[2] + tol && b[3] <= z[3] + tol;
const intersects = (b: UserRect, z: UserRect) => b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1];
const area = (b: UserRect) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const overlap = (b: UserRect, z: UserRect): UserRect => [Math.max(b[0], z[0]), Math.max(b[1], z[1]), Math.min(b[2], z[2]), Math.min(b[3], z[3])];

export function opId(path: string[], index: number) {
  return `${path.join("/")}#${index}`;
}

/** Calcula qué operaciones eliminar para borrar una zona (en espacio de usuario). */
export function computeZoneErase(analysis: PageAnalysis, zone: UserRect, includeText: boolean) {
  const deleteOps = new Set<string>();
  const glyphs: RemovalMap = new Map();
  const stats: EraseStats = { images: 0, paths: 0, subpaths: 0, glyphs: 0, crossing: 0, partialImages: 0 };

  for (const img of analysis.images) {
    if (!intersects(img.bbox, zone)) continue;
    if (area(overlap(img.bbox, zone)) >= area(img.bbox) * 0.9) {
      deleteOps.add(img.id);
      stats.images++;
    } else stats.partialImages++;
  }

  for (const p of analysis.paths) {
    if (p.clip || p.paint === "none" || !intersects(p.bbox, zone)) continue;
    if (inside(p.bbox, zone)) {
      for (let i = p.start; i <= p.end; i++) deleteOps.add(opId(p.path, i));
      stats.paths++;
      continue;
    }
    if (p.subpaths.length > 1) {
      // Recortar el trayecto: quitar solo los subtrayectos que están dentro de la zona.
      const removable = p.subpaths.map((sp, k) => ({ sp, k, end: k + 1 < p.subpaths.length ? p.subpaths[k + 1].start - 1 : p.end - 1 }));
      let removedHere = 0;
      for (const { sp, end } of removable) {
        if (!inside(sp.bbox, zone)) {
          if (intersects(sp.bbox, zone)) stats.crossing++;
          continue;
        }
        for (let i = sp.start; i <= end; i++) deleteOps.add(opId(p.path, i));
        removedHere++;
      }
      if (removedHere === p.subpaths.length) deleteOps.add(opId(p.path, p.end));
      stats.subpaths += removedHere;
    } else stats.crossing++;
  }

  if (includeText) {
    for (const r of analysis.records) {
      const asc = (r.font.ascent / 1000) * r.size;
      const desc = (r.font.descent / 1000) * r.size;
      r.glyphs.forEach((g, gi) => {
        const pts = [apply(r.trm, g.tx, r.rise - desc), apply(r.trm, g.tx + g.adv, r.rise + asc)];
        const b: UserRect = [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
        if (!inside(b, zone, 0.2)) return;
        const set = glyphs.get(r.id) ?? new Set<number>();
        set.add(gi);
        glyphs.set(r.id, set);
        stats.glyphs++;
      });
    }
  }
  return { deleteOps, glyphs, stats };
}
