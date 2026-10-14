"use client";

import { useMemo, useReducer } from "react";
import type { EditDoc, EditObject, PageState } from "./types";

export type Tool = "select" | "editText" | "addText" | "highlight" | "draw" | "cover" | "erase";

export type State = {
  doc: EditDoc;
  past: EditDoc[];
  future: EditDoc[];
  /** Copia del documento al empezar un gesto (arrastre/redimensión): el gesto entero es un solo paso de historial. */
  gestureBase: EditDoc | null;
  dirtyVersion: number;
};

export type Action =
  | { type: "reset"; doc: EditDoc }
  | { type: "change"; doc: EditDoc }
  | { type: "gestureStart" }
  | { type: "gestureMove"; doc: EditDoc }
  | { type: "gestureEnd" }
  | { type: "undo" }
  | { type: "redo" };

const LIMIT = 100;

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return { doc: a.doc, past: [], future: [], gestureBase: null, dirtyVersion: 0 };
    case "change":
      if (a.doc === s.doc) return s;
      return { ...s, doc: a.doc, past: [...s.past, s.doc].slice(-LIMIT), future: [], dirtyVersion: s.dirtyVersion + 1 };
    case "gestureStart":
      return { ...s, gestureBase: s.doc };
    case "gestureMove":
      return { ...s, doc: a.doc };
    case "gestureEnd":
      if (!s.gestureBase || s.gestureBase === s.doc) return { ...s, gestureBase: null };
      return { ...s, past: [...s.past, s.gestureBase].slice(-LIMIT), future: [], gestureBase: null, dirtyVersion: s.dirtyVersion + 1 };
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirtyVersion: s.dirtyVersion + 1 };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, doc: next, past: [...s.past, s.doc], future: s.future.slice(1), dirtyVersion: s.dirtyVersion + 1 };
    }
  }
}

export function uid(prefix = "o") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function useEditorStore(initial: EditDoc) {
  const [state, dispatch] = useReducer(reducer, { doc: initial, past: [], future: [], gestureBase: null, dirtyVersion: 0 });

  const actions = useMemo(() => {
    const change = (doc: EditDoc) => dispatch({ type: "change", doc });
    return {
      reset: (doc: EditDoc) => dispatch({ type: "reset", doc }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      gestureStart: () => dispatch({ type: "gestureStart" }),
      gestureMove: (doc: EditDoc) => dispatch({ type: "gestureMove", doc }),
      gestureEnd: () => dispatch({ type: "gestureEnd" }),
      change,
    };
  }, []);

  return { ...state, canUndo: state.past.length > 0, canRedo: state.future.length > 0, ...actions };
}

// ── Operaciones puras sobre el documento ─────────────────────────────────────

export function updateObject(doc: EditDoc, id: string, patch: Partial<EditObject>): EditDoc {
  return { ...doc, objects: doc.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o)) };
}

export function addObject(doc: EditDoc, obj: EditObject): EditDoc {
  return { ...doc, objects: [...doc.objects, obj] };
}

export function removeObject(doc: EditDoc, id: string): EditDoc {
  return { ...doc, objects: doc.objects.filter((o) => o.id !== id) };
}

export function bringToFront(doc: EditDoc, id: string): EditDoc {
  const obj = doc.objects.find((o) => o.id === id);
  return obj ? { ...doc, objects: [...doc.objects.filter((o) => o.id !== id), obj] } : doc;
}

export function rotatePage(doc: EditDoc, pageId: string, delta: 90 | -90): EditDoc {
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, rotation: ((((p.rotation + delta) % 360) + 360) % 360) as PageState["rotation"] } : p)),
  };
}

export function deletePage(doc: EditDoc, pageId: string): EditDoc {
  if (doc.pages.length <= 1) return doc;
  return { pages: doc.pages.filter((p) => p.id !== pageId), objects: doc.objects.filter((o) => o.pageId !== pageId) };
}

export function duplicatePage(doc: EditDoc, pageId: string): EditDoc {
  const i = doc.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return doc;
  const copy = { ...doc.pages[i], id: uid("p") };
  const objs = doc.objects.filter((o) => o.pageId === pageId).map((o) => ({ ...o, id: uid(), pageId: copy.id }) as EditObject);
  return { pages: [...doc.pages.slice(0, i + 1), copy, ...doc.pages.slice(i + 1)], objects: [...doc.objects, ...objs] };
}

export function insertBlankPage(doc: EditDoc, afterPageId: string, size: { w: number; h: number }): EditDoc {
  const i = doc.pages.findIndex((p) => p.id === afterPageId);
  const page: PageState = { id: uid("p"), src: null, baseRotation: 0, rotation: 0, view: [0, 0, size.w, size.h] };
  return { ...doc, pages: [...doc.pages.slice(0, i + 1), page, ...doc.pages.slice(i + 1)] };
}

export function movePage(doc: EditDoc, from: number, to: number): EditDoc {
  if (from === to || to < 0 || to >= doc.pages.length) return doc;
  const pages = [...doc.pages];
  const [p] = pages.splice(from, 1);
  pages.splice(to, 0, p);
  return { ...doc, pages };
}


// ── Operaciones de selección (varios objetos) ─────────────────────────────────

/** Borrar: imágenes originales → marcadas como borradas; textos originales → texto vacío; el resto se quita. */
export function deleteSelection(doc: EditDoc, ids: string[]): EditDoc {
  const set = new Set(ids);
  return {
    ...doc,
    objects: doc.objects.flatMap((o) => {
      if (!set.has(o.id)) return [o];
      if (o.type === "imageEdit") return [{ ...o, removed: true }];
      if (o.type === "textEdit") return [{ ...o, text: "" }];
      return [];
    }),
  };
}

export function moveSelection(doc: EditDoc, ids: string[], dx: number, dy: number): EditDoc {
  const set = new Set(ids);
  return {
    ...doc,
    objects: doc.objects.map((o) => {
      if (!set.has(o.id)) return o;
      if (o.type === "textEdit") return { ...o, dx: (o.dx ?? 0) + dx, dy: (o.dy ?? 0) + dy };
      return { ...o, x: o.x + dx, y: o.y + dy };
    }),
  };
}

/** Duplicar (solo lo añadido: el contenido original del PDF no se puede duplicar como objeto). */
export function duplicateSelection(doc: EditDoc, ids: string[]): { doc: EditDoc; ids: string[] } {
  const copies = doc.objects
    .filter((o) => ids.includes(o.id) && o.type !== "textEdit" && o.type !== "imageEdit" && o.type !== "zoneErase")
    .map((o) => ({ ...o, id: uid(), x: o.x + 10, y: o.y + 10 }) as EditObject);
  return { doc: { ...doc, objects: [...doc.objects, ...copies] }, ids: copies.length ? copies.map((c) => c.id) : ids };
}

export function sendToBack(doc: EditDoc, id: string): EditDoc {
  const obj = doc.objects.find((o) => o.id === id);
  return obj ? { ...doc, objects: [obj, ...doc.objects.filter((o) => o.id !== id)] } : doc;
}

/** Alinear varios objetos respecto a la caja que los engloba. */
export function alignSelection(doc: EditDoc, ids: string[], mode: "left" | "center" | "right" | "top" | "middle" | "bottom"): EditDoc {
  const sel = doc.objects.filter((o) => ids.includes(o.id));
  if (sel.length < 2) return doc;
  const box = (o: EditObject) => (o.type === "textEdit" ? { x: o.x + (o.dx ?? 0), y: o.y + (o.dy ?? 0), w: o.w, h: o.h } : o);
  const bs = sel.map(box);
  const x0 = Math.min(...bs.map((b) => b.x)), x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y0 = Math.min(...bs.map((b) => b.y)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  let out = doc;
  for (const o of sel) {
    const b = box(o);
    const dx = mode === "left" ? x0 - b.x : mode === "right" ? x1 - (b.x + b.w) : mode === "center" ? (x0 + x1) / 2 - (b.x + b.w / 2) : 0;
    const dy = mode === "top" ? y0 - b.y : mode === "bottom" ? y1 - (b.y + b.h) : mode === "middle" ? (y0 + y1) / 2 - (b.y + b.h / 2) : 0;
    out = moveSelection(out, [o.id], dx, dy);
  }
  return out;
}
