"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Loader2 } from "lucide-react";
import { ensureFont, measureText } from "@/lib/editor/font-runtime";
import { frameSize } from "@/lib/editor/geometry";
import { addObject, uid, updateObject } from "@/lib/editor/store";
import type { TextBlock } from "@/lib/editor/pdf/blocks";
import { sampleColors } from "@/lib/editor/text-extract";
import type { EditObject, InkObject, PageState, TextEditObject, TextObject, TextStyle } from "@/lib/editor/types";
import { openPdfTask } from "@/lib/pdf/pdfjs";
import { detectQrs, type DetectedQr } from "@/lib/editor/qr-detect";
import { startGesture, visualBox } from "./gestures";
import { useEditor } from "./editor-context";
import { ObjectView } from "./object-view";

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: { family: "liberation-sans", bold: false, italic: false },
  size: 12,
  color: "#000000",
  opacity: 1,
  lineHeight: 1.2,
  tracking: 0,
  align: "left",
};

const MAX_CANVAS_PIXELS = 16_000_000;

/** Convierte un punto de pantalla a coordenadas del marco de la página (pt), considerando la rotación del usuario. */
export function clientToFrame(clientX: number, clientY: number, wrapper: HTMLElement, page: PageState, zoom: number): [number, number] {
  const r = wrapper.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  const f = frameSize(page.view, page.baseRotation);
  const W = f.w * zoom;
  const H = f.h * zoom;
  let u = px;
  let v = py;
  if (page.rotation === 90) [u, v] = [py, H - px];
  else if (page.rotation === 180) [u, v] = [W - px, H - py];
  else if (page.rotation === 270) [u, v] = [W - py, px];
  return [u / zoom, v / zoom];
}

function innerTransform(rotation: number, W: number, H: number) {
  switch (rotation) {
    case 90:
      return `translate(${H}px, 0) rotate(90deg)`;
    case 180:
      return `translate(${W}px, ${H}px) rotate(180deg)`;
    case 270:
      return `translate(0, ${W}px) rotate(270deg)`;
    default:
      return undefined;
  }
}

export function PageView({ page, index }: { page: PageState; index: number }) {
  const ed = useEditor();
  const { zoom, tool, store } = ed;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(index < 2);
  const [rendering, setRendering] = useState(false);
  const [blocks, setBlocks] = useState<TextBlock[] | null>(null);
  const [origImages, setOrigImages] = useState<{ id: string; kind: string; box: { x: number; y: number; w: number; h: number } }[]>([]);
  const [qrs, setQrs] = useState<DetectedQr[]>([]);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const dragStart = useRef<[number, number] | null>(null);

  const frame = frameSize(page.view, page.baseRotation);
  const W = frame.w * zoom;
  const H = frame.h * zoom;
  const swapped = page.rotation === 90 || page.rotation === 270;

  // Render perezoso: solo las páginas cercanas a la vista.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setVisible(e.isIntersecting);
          if (e.isIntersecting && e.intersectionRatio > 0.3) ed.setCurrentPageId(page.id);
        }
      },
      { rootMargin: "800px 0px", threshold: [0, 0.3] },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const objects = useMemo(() => store.doc.objects.filter((o) => o.pageId === page.id), [store.doc.objects, page.id]);
  const textEdits = useMemo(() => objects.filter((o): o is TextEditObject => o.type === "textEdit"), [objects]);
  // Ediciones del contenido original (textos, zonas borradas, imágenes): se ven en el render de vista previa.
  const contentEdits = useMemo(() => objects.filter((o) => o.type === "textEdit" || o.type === "zoneErase" || o.type === "imageEdit"), [objects]);
  const editsKey = useMemo(() => JSON.stringify(contentEdits), [contentEdits]);
  const editedBlocks = useMemo(() => new Set(textEdits.map((o) => o.parts[0]?.rec)), [textEdits]);

  // Render de la página: el PDF original o, si hay ediciones de texto, la vista previa generada con la
  // misma función que la exportación (lo que se ve es exactamente lo que se exportará).
  useEffect(() => {
    if (!visible || page.src === null || !ed.pdf) return;
    const pdf = ed.pdf;
    const engine = ed.engine;
    const usePreview = contentEdits.length > 0 && engine !== null;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let previewTask: Awaited<ReturnType<typeof openPdfTask>> | null = null;
    const timer = setTimeout(
      async () => {
        setRendering(true);
        try {
          let p;
          if (usePreview) {
            const { bytes, reports } = await engine.preview(store.doc, page.id);
            if (cancelled) return;
            ed.setTextReports(reports, Object.fromEntries(contentEdits.map((o) => [o.id, o.type === "textEdit" ? o.text : ""])));
            previewTask = await openPdfTask(bytes);
            p = await (await previewTask.promise).getPage(1);
          } else {
            p = await pdf.getPage(page.src! + 1);
          }
          if (cancelled) return;
          const dpr = Math.min(window.devicePixelRatio || 1, 3);
          let scale = zoom * dpr;
          const base = p.getViewport({ scale: 1, rotation: page.baseRotation });
          if (base.width * base.height * scale * scale > MAX_CANVAS_PIXELS) scale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
          const viewport = p.getViewport({ scale, rotation: page.baseRotation });
          const off = document.createElement("canvas");
          off.width = Math.floor(viewport.width);
          off.height = Math.floor(viewport.height);
          task = p.render({ canvas: off, viewport });
          await task.promise;
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = off.width;
            canvas.height = off.height;
            canvas.getContext("2d")?.drawImage(off, 0, 0);
            ed.canvases.current.set(page.id, { canvas, scale });
          }
        } catch {
          /* render cancelado */
        } finally {
          previewTask?.destroy();
          if (!cancelled) setRendering(false);
        }
      },
      usePreview ? 140 : 120,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, zoom, page.src, page.baseRotation, ed.pdf, ed.engine, editsKey]);

  // Contenido original editable (líneas de texto e imágenes) en las herramientas que lo usan.
  const wantsOriginals = tool === "editText" || tool === "select" || tool === "erase";
  useEffect(() => {
    if (!wantsOriginals || page.src === null || !visible || !ed.engine) return;
    let alive = true;
    ed.engine.blocks(page).then((b) => alive && setBlocks(b));
    ed.engine.images(page).then((im) => alive && setOrigImages(im));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsOriginals, page.src, visible, ed.engine]);

  // Detección automática de códigos QR (imagen o vectoriales) sobre el render de la página.
  useEffect(() => {
    if ((tool !== "select" && tool !== "erase") || !visible || rendering) return;
    const entry = ed.canvases.current.get(page.id);
    if (!entry) return;
    const t = setTimeout(() => setQrs(detectQrs(entry.canvas, entry.scale)), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, visible, rendering, editsKey]);

  const toFrame = (e: { clientX: number; clientY: number }) => clientToFrame(e.clientX, e.clientY, wrapperRef.current!, page, zoom);

  function textEditFromBlock(block: TextBlock): TextEditObject {
    const entry = ed.canvases.current.get(page.id);
    // Respaldo (si no se puede eliminar limpiamente): tapar solo el rectángulo ajustado al texto real.
    const tight = { x: block.box.x - 0.3, y: block.box.y - 0.3, w: block.box.w + 0.6, h: block.box.h + 0.6 };
    const coverColor = entry ? sampleColors(entry.canvas, tight, entry.scale).background : "#ffffff";
    const obj: TextEditObject = {
      type: "textEdit",
      id: uid(),
      pageId: page.id,
      ...block.box,
      parts: block.parts,
      originalText: block.text,
      text: block.text,
      align: block.align,
      scaleX: 1,
      sizeScale: 1,
      room: { x0: Math.max(0, block.room.x0), x1: Math.min(block.room.x1, frame.w) },
      fontNames: block.fontNames,
      cover: block.clean ? undefined : { color: coverColor, rects: [tight] },
    };
    return obj;
  }

  function editBlock(block: TextBlock) {
    const obj = textEditFromBlock(block);
    ed.addAndSelect(obj);
    ed.setEditingId(obj.id);
  }

  /** Convierte un elemento original en objeto editable y empieza a arrastrarlo en el mismo gesto. */
  function grabOriginal(e: RPointerEvent, obj: EditObject) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const doc = addObject(store.doc, obj);
    store.change(doc);
    ed.setSelection([obj.id]);
    ed.setCurrentPageId(page.id);
    startGesture({ ed, kind: "move", ids: [obj.id], page, wrapper: wrapperRef.current!, clientX: e.clientX, clientY: e.clientY, baseDoc: doc });
  }

  function eraseQr(q: DetectedQr) {
    // Si coincide con una imagen original, se borra esa imagen; si no (QR vectorial), se borra la zona.
    const iou = (a: typeof q.box, b: typeof q.box) => {
      const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
      const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      return inter / (a.w * a.h + b.w * b.h - inter);
    };
    const img = origImages.find((im) => iou(im.box, q.box) > 0.5);
    if (img) ed.addAndSelect({ type: "imageEdit", id: uid(), pageId: page.id, ...img.box, ref: img.id, orig: img.box, removed: true });
    else ed.addAndSelect({ type: "zoneErase", id: uid(), pageId: page.id, x: q.box.x - 1, y: q.box.y - 1, w: q.box.w + 2, h: q.box.h + 2, includeText: false, label: "QR" });
    setQrs((list) => list.filter((x) => x !== q));
  }

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    ed.setCurrentPageId(page.id);
    const [x, y] = toFrame(e);
    if (tool === "editText") {
      ed.select(null);
      ed.setEditingId(null);
      return;
    }
    if (tool === "select") {
      // Recuadro de selección (o deseleccionar con un clic)
      ed.setEditingId(null);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = [x, y];
      setDraft({ x, y, w: 0, h: 0 });
      return;
    }
    if (tool === "addText") {
      const style = DEFAULT_TEXT_STYLE;
      ensureFont(style.font, ed.customCatalog).then(() => {
        const text = "Texto";
        const m = measureText(text, style, ed.customCatalog);
        const obj: TextObject = { type: "text", id: uid(), pageId: page.id, x, y: y - m.h / 2, w: m.w, h: m.h, text, style };
        ed.addAndSelect(obj);
        ed.setEditingId(obj.id);
      });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = [x, y];
    if (tool === "draw") setStroke([[x, y]]);
    else setDraft({ x, y, w: 0, h: 0 });
  }

  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const [x, y] = toFrame(e);
    if (tool === "draw") {
      setStroke((s) => (s ? [...s, [x, y]] : s));
      return;
    }
    const [sx, sy] = dragStart.current;
    setDraft({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
  }

  function onPointerUp() {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (tool === "draw" && stroke) {
      commitStroke(stroke);
      setStroke(null);
      return;
    }
    if (tool === "select") {
      if (draft && draft.w > 3 && draft.h > 3) {
        const hit = objects.filter((o) => {
          if (o.type === "imageEdit" && o.removed) return false;
          const b = visualBox(o);
          return b.x < draft.x + draft.w && b.x + b.w > draft.x && b.y < draft.y + draft.h && b.y + b.h > draft.y;
        });
        ed.setSelection(hit.map((o) => o.id));
      } else ed.select(null);
      setDraft(null);
      return;
    }
    if (draft && draft.w > 3 && draft.h > 3) {
      const id = uid();
      if (tool === "erase") ed.addAndSelect({ type: "zoneErase", id, pageId: page.id, ...draft, includeText: false });
      if (tool === "highlight") ed.addAndSelect({ type: "highlight", id, pageId: page.id, ...draft, color: "#ffeb3b", opacity: 0.45 });
      if (tool === "cover") {
        const entry = ed.canvases.current.get(page.id);
        const color = entry ? sampleColors(entry.canvas, draft, entry.scale).background : "#ffffff";
        ed.addAndSelect({ type: "cover", id, pageId: page.id, ...draft, color });
      }
    }
    setDraft(null);
  }

  function commitStroke(points: [number, number][]) {
    const width = 2;
    const existing = store.doc.objects.find((o): o is InkObject => o.id === ed.activeInkId.current && o.type === "ink" && o.pageId === page.id);
    const absolute: [number, number][][] = existing ? existing.strokes.map((s) => s.map(([u, v]) => [existing.x + u * existing.w, existing.y + v * existing.h])) : [];
    absolute.push(points);
    const all = absolute.flat();
    const pad = width;
    const minX = Math.min(...all.map((p) => p[0])) - pad;
    const minY = Math.min(...all.map((p) => p[1])) - pad;
    const w = Math.max(4, Math.max(...all.map((p) => p[0])) + pad - minX);
    const h = Math.max(4, Math.max(...all.map((p) => p[1])) + pad - minY);
    const strokes = absolute.map((s) => s.map(([px, py]) => [(px - minX) / w, (py - minY) / h] as [number, number]));
    if (existing) {
      store.change(updateObject(store.doc, existing.id, { x: minX, y: minY, w, h, strokes }));
    } else {
      const id = uid();
      ed.setActiveInk(id);
      store.change(addObject(store.doc, { type: "ink", id, pageId: page.id, x: minX, y: minY, w, h, strokes, color: "#1d3b8f", width }));
    }
  }

  const creating = tool === "highlight" || tool === "cover" || tool === "draw" || tool === "erase" || tool === "select";
  const editedImages = new Set(objects.filter((o) => o.type === "imageEdit").map((o) => (o as { ref: string }).ref));

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={wrapperRef}
        data-page-id={page.id}
        className="relative shadow-[0_8px_30px_-8px_rgba(0,0,0,0.7)]"
        style={{ width: swapped ? H : W, height: swapped ? W : H }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left bg-white"
          style={{ width: W, height: H, transform: innerTransform(page.rotation, W, H) }}
        >
          {page.src !== null && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />}
          {rendering && page.src !== null && !ed.canvases.current.has(page.id) && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          <div
            className="absolute inset-0"
            style={{ touchAction: creating && tool !== "select" ? "none" : "pan-x pan-y", cursor: (creating && tool !== "select") || tool === "addText" ? "crosshair" : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Contenido original movible (debajo de los objetos): textos e imágenes del PDF */}
            {tool === "select" &&
              blocks?.map((b) =>
                editedBlocks.has(b.parts[0]?.rec) ? null : (
                  <div
                    key={`t-${b.key}`}
                    title="Arrastra para mover este texto"
                    onPointerDown={(e) => grabOriginal(e, textEditFromBlock(b))}
                    className="absolute cursor-grab rounded-[2px] outline-0 hover:outline-1 hover:outline-accent-strong/60 active:cursor-grabbing"
                    style={{ left: b.box.x * zoom, top: b.box.y * zoom, width: b.box.w * zoom, height: b.box.h * zoom, touchAction: "none", outlineStyle: "solid" }}
                  />
                ),
              )}
            {(tool === "select" || tool === "erase") &&
              origImages.map((im) =>
                editedImages.has(im.id) ? null : (
                  <div
                    key={`i-${im.id}`}
                    role="button"
                    aria-label="Imagen del PDF: arrastrar para mover, Supr para borrar"
                    title="Imagen del PDF: arrastra para moverla; Supr la borra"
                    onPointerDown={(e) => tool === "select" && grabOriginal(e, { type: "imageEdit", id: uid(), pageId: page.id, ...im.box, ref: im.id, orig: im.box, removed: false })}
                    className={`absolute outline-0 ${tool === "select" ? "cursor-grab hover:outline-2 hover:outline-accent-strong/70 active:cursor-grabbing" : "pointer-events-none"}`}
                    style={{ left: im.box.x * zoom, top: im.box.y * zoom, width: im.box.w * zoom, height: im.box.h * zoom, touchAction: "none", outlineStyle: "dashed" }}
                  />
                ),
              )}

            {objects.map((o) => (
              <ObjectView key={o.id} obj={o} page={page} wrapperRef={wrapperRef} />
            ))}

            {(tool === "select" || tool === "erase") &&
              qrs.map((q, i) => (
                <div key={`qr-${i}`} className="pointer-events-none absolute border-2 border-dashed border-accent-strong" style={{ left: q.box.x * zoom, top: q.box.y * zoom, width: q.box.w * zoom, height: q.box.h * zoom }}>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => eraseQr(q)}
                    title={`QR detectado: ${q.data}`}
                    className="pointer-events-auto absolute -top-8 left-0 flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold whitespace-nowrap text-white shadow"
                  >
                    QR · Borrar
                  </button>
                </div>
              ))}

            {ed.guides?.pageId === page.id && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                {ed.guides.xs.map((gx) => (
                  <line key={`gx${gx}`} x1={gx * zoom} x2={gx * zoom} y1={0} y2={H} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" />
                ))}
                {ed.guides.ys.map((gy) => (
                  <line key={`gy${gy}`} y1={gy * zoom} y2={gy * zoom} x1={0} x2={W} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" />
                ))}
              </svg>
            )}

            {tool === "editText" &&
              blocks?.map((b) =>
                editedBlocks.has(b.parts[0]?.rec) ? null : (
                  <button
                    key={b.key}
                    type="button"
                    title={b.text}
                    aria-label={`Editar texto: ${b.text}`}
                    onClick={() => editBlock(b)}
                    className={`absolute rounded-[2px] outline-1 hover:bg-accent/15 hover:outline-2 focus-visible:bg-accent/15 ${
                      b.clean ? "outline-accent-strong/40 hover:outline-accent-strong" : "outline-warning/60 hover:outline-warning"
                    }`}
                    style={{ left: b.box.x * zoom, top: b.box.y * zoom, width: b.box.w * zoom, height: b.box.h * zoom, outlineStyle: "dashed" }}
                  />
                ),
              )}

            {draft && (
              <div
                className={
                  tool === "highlight"
                    ? "absolute bg-yellow-300/50"
                    : tool === "select"
                      ? "absolute border border-accent-strong bg-accent/10"
                      : tool === "erase"
                        ? "absolute border-2 border-dashed border-danger bg-danger/10"
                        : "absolute border border-dashed border-accent-strong bg-white/80"
                }
                style={{ left: draft.x * zoom, top: draft.y * zoom, width: draft.w * zoom, height: draft.h * zoom }}
              />
            )}
            {stroke && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polyline points={stroke.map(([x, y]) => `${x * zoom},${y * zoom}`).join(" ")} fill="none" stroke="#1d3b8f" strokeWidth={2 * zoom} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      </div>
      <span className="font-mono text-mono-timer text-fg-muted">
        {index + 1} / {store.doc.pages.length}
      </span>
    </div>
  );
}
