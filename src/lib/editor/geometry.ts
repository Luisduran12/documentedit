import type { Rotation, ViewBox } from "./types";

export function viewSize(view: ViewBox) {
  return { w: view[2] - view[0], h: view[3] - view[1] };
}

/** Tamaño del marco de pantalla para una rotación dada. */
export function frameSize(view: ViewBox, rotation: Rotation) {
  const { w, h } = viewSize(view);
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

/**
 * Convierte un punto del marco de pantalla (origen arriba-izquierda, y hacia abajo) al espacio
 * PDF nativo (origen abajo-izquierda, y hacia arriba) según la rotación intrínseca de la página.
 */
export function frameToNative(fx: number, fy: number, view: ViewBox, rotation: Rotation): [number, number] {
  const [x0, y0] = view;
  const { w: W, h: H } = viewSize(view);
  switch (rotation) {
    case 0:
      return [x0 + fx, y0 + H - fy];
    case 90:
      return [x0 + fy, y0 + fx];
    case 180:
      return [x0 + W - fx, y0 + fy];
    case 270:
      return [x0 + W - fy, y0 + H - fx];
  }
}

export function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Rota un desplazamiento de pantalla al marco de la página (para arrastrar sobre páginas giradas por el usuario). */
export function screenDeltaToFrame(dx: number, dy: number, userRotation: Rotation): [number, number] {
  switch (userRotation) {
    case 0:
      return [dx, dy];
    case 90:
      return [dy, -dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [-dy, dx];
  }
}

/** Métricas de línea compartidas por el lienzo y la exportación (modelo CSS: medio interlineado arriba y abajo). */
export function firstBaselineOffset(size: number, lineHeight: number, ascent: number, descent: number) {
  const L = lineHeight * size;
  return (L - (ascent + descent)) / 2 + ascent;
}

type M6 = [number, number, number, number, number, number];
const mul6 = (a: M6, b: M6): M6 => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const inv6 = (m: M6): M6 => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};

/** Matriz marco de pantalla → espacio PDF nativo (convención de vector fila). */
export function frameMatrix(view: ViewBox, rotation: Rotation): M6 {
  const p0 = frameToNative(0, 0, view, rotation);
  const p1 = frameToNative(1, 0, view, rotation);
  const p2 = frameToNative(0, 1, view, rotation);
  return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]];
}

type FBox = { x: number; y: number; w: number; h: number };

/**
 * Transformación en espacio nativo que lleva un elemento de la caja `from` a la caja `to` (marco) y lo
 * rota `deg` grados (horario en pantalla) alrededor del centro de destino.
 */
export function placementTransform(view: ViewBox, rotation: Rotation, from: FBox, to: FBox, deg = 0): M6 {
  const N = frameMatrix(view, rotation);
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const c0 = [from.x + from.w / 2, from.y + from.h / 2];
  const c1 = [to.x + to.w / 2, to.y + to.h / 2];
  const t = (deg * Math.PI) / 180;
  const F = mul6(mul6(mul6([1, 0, 0, 1, -c0[0], -c0[1]], [sx, 0, 0, sy, 0, 0]), [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]), [1, 0, 0, 1, c1[0], c1[1]]);
  return mul6(mul6(inv6(N), F), N);
}

export function isIdentityPlacement(from: FBox, to: FBox, deg = 0) {
  const e = 0.01;
  return Math.abs(from.x - to.x) < e && Math.abs(from.y - to.y) < e && Math.abs(from.w - to.w) < e && Math.abs(from.h - to.h) < e && Math.abs(deg) < 0.01;
}
