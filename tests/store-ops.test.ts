import { describe, expect, it } from "vitest";
import { addObject, alignSelection, deleteSelection, duplicateSelection, moveSelection, reducer, sendToBack, type State } from "@/lib/editor/store";
import type { EditDoc, EditObject } from "@/lib/editor/types";

const page = { id: "p0", src: 0, baseRotation: 0 as const, rotation: 0 as const, view: [0, 0, 595, 842] as [number, number, number, number] };
const objs: EditObject[] = [
  { type: "image", id: "a", pageId: "p0", x: 10, y: 10, w: 50, h: 50, assetKey: "assets/x.png", mime: "image/png", opacity: 1 },
  { type: "imageEdit", id: "b", pageId: "p0", x: 100, y: 20, w: 40, h: 40, ref: "#5", orig: { x: 100, y: 20, w: 40, h: 40 }, removed: false },
  { type: "textEdit", id: "c", pageId: "p0", x: 200, y: 30, w: 80, h: 10, parts: [{ rec: "#9", from: 0, to: 4 }], originalText: "Hola", text: "Hola", align: "left", scaleX: 1, sizeScale: 1 },
  { type: "zoneErase", id: "d", pageId: "p0", x: 300, y: 300, w: 60, h: 60, includeText: false },
];
const doc0: EditDoc = { pages: [page], objects: objs };
const init = (doc: EditDoc): State => ({ doc, past: [], future: [], gestureBase: null, dirtyVersion: 0 });

/** Aplica una operación y comprueba que deshacer/rehacer devuelven exactamente los documentos. */
function roundTrip(next: EditDoc) {
  let s = reducer(init(doc0), { type: "change", doc: next });
  expect(s.doc).toBe(next);
  s = reducer(s, { type: "undo" });
  expect(s.doc).toBe(doc0);
  s = reducer(s, { type: "redo" });
  expect(s.doc).toBe(next);
}

describe("operaciones con deshacer/rehacer", () => {
  it("borrar: imagen original marcada como borrada, texto original vaciado, lo añadido se quita", () => {
    const next = deleteSelection(doc0, ["a", "b", "c"]);
    expect(next.objects.find((o) => o.id === "a")).toBeUndefined();
    expect(next.objects.find((o) => o.id === "b")).toMatchObject({ removed: true });
    expect(next.objects.find((o) => o.id === "c")).toMatchObject({ text: "" });
    roundTrip(next);
  });
  it("mover en grupo: los textos originales usan desplazamiento, el resto su posición", () => {
    const next = moveSelection(doc0, ["a", "c"], 5, -3);
    expect(next.objects.find((o) => o.id === "a")).toMatchObject({ x: 15, y: 7 });
    expect(next.objects.find((o) => o.id === "c")).toMatchObject({ x: 200, dx: 5, dy: -3 });
    roundTrip(next);
  });
  it("duplicar solo lo añadido (el contenido original no se duplica como objeto)", () => {
    const { doc, ids } = duplicateSelection(doc0, ["a", "b"]);
    expect(doc.objects).toHaveLength(objs.length + 1);
    expect(doc.objects.find((o) => o.id === ids[0])).toMatchObject({ type: "image", x: 20, y: 20 });
    roundTrip(doc);
  });
  it("alinear varios a la izquierda", () => {
    const next = alignSelection(doc0, ["a", "b"], "left");
    expect(next.objects.find((o) => o.id === "b")).toMatchObject({ x: 10 });
    roundTrip(next);
  });
  it("orden de capas: enviar atrás", () => {
    const next = sendToBack(doc0, "d");
    expect(next.objects[0].id).toBe("d");
    roundTrip(next);
  });
  it("un gesto completo (arrastre) es un solo paso de historial", () => {
    let s = init(doc0);
    s = reducer(s, { type: "gestureStart" });
    for (let i = 1; i <= 5; i++) s = reducer(s, { type: "gestureMove", doc: moveSelection(doc0, ["a"], i, i) });
    s = reducer(s, { type: "gestureEnd" });
    expect(s.past).toHaveLength(1);
    s = reducer(s, { type: "undo" });
    expect(s.doc).toBe(doc0);
  });
  it("añadir y quitar una zona borrada", () => {
    const zone: EditObject = { type: "zoneErase", id: "z", pageId: "p0", x: 0, y: 0, w: 10, h: 10, includeText: true };
    roundTrip(addObject(doc0, zone));
  });
});
