"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, FilePlus2, RotateCw, Trash2 } from "lucide-react";
import { frameSize } from "@/lib/editor/geometry";
import { deletePage, duplicatePage, insertBlankPage, movePage, rotatePage } from "@/lib/editor/store";
import type { PageState } from "@/lib/editor/types";
import { useEditor } from "./editor-context";

const THUMB_W = 150;

function Thumb({ page }: { page: PageState }) {
  const { pdf } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const f = frameSize(page.view, page.baseRotation);
  const scale = THUMB_W / f.w;

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !pdf || page.src === null) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const p = await pdf.getPage(page.src! + 1);
      const viewport = p.getViewport({ scale: scale * Math.min(2, window.devicePixelRatio || 1), rotation: page.baseRotation });
      const c = ref.current;
      if (!c) return;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = p.render({ canvas: c, viewport });
      await task.promise.catch(() => {});
    })();
    return () => task?.cancel();
  }, [visible, pdf, page.src, page.baseRotation, scale]);

  const swapped = page.rotation === 90 || page.rotation === 270;
  const w = THUMB_W;
  const h = f.h * scale;
  return (
    <div ref={holder} className="flex items-center justify-center" style={{ width: swapped ? h : w, height: swapped ? w : h }}>
      <div className="bg-white shadow" style={{ width: w, height: h, transform: `rotate(${page.rotation}deg)`, flexShrink: 0 }}>
        {page.src !== null && <canvas ref={ref} className="h-full w-full" aria-hidden />}
      </div>
    </div>
  );
}

export function Thumbnails({ onNavigate }: { onNavigate?: () => void }) {
  const ed = useEditor();
  const { store } = ed;
  const pages = store.doc.pages;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const btn = "flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 hover:bg-subtle hover:text-fg disabled:opacity-30";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
        <span className="label mb-0">{pages.length} {pages.length === 1 ? "página" : "páginas"}</span>
        <button
          type="button"
          className="btn btn-ghost h-9 px-2 text-xs"
          title="Insertar página en blanco después de la actual"
          onClick={() => {
            const cur = pages.find((p) => p.id === ed.currentPageId) ?? pages[pages.length - 1];
            store.change(insertBlankPage(store.doc, cur.id, frameSize(cur.view, cur.baseRotation)));
          }}
        >
          <FilePlus2 className="h-4 w-4" /> En blanco
        </button>
      </div>
      <ol className="flex-1 space-y-3 overflow-y-auto p-3">
        {pages.map((p, i) => {
          const current = p.id === ed.currentPageId;
          return (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) store.change(movePage(store.doc, dragFrom, i));
                setDragFrom(null);
                setDragOver(null);
              }}
              className={`group rounded-2xl border p-2 transition-colors ${
                current ? "border-primary-strong bg-primary/10" : "border-transparent hover:bg-subtle/60"
              } ${dragOver === i && dragFrom !== i ? "border-dashed border-accent-strong" : ""}`}
            >
              <button
                type="button"
                className="flex w-full flex-col items-center gap-1.5"
                aria-label={`Ir a la página ${i + 1}`}
                aria-current={current ? "page" : undefined}
                onClick={() => {
                  ed.scrollToPage(p.id);
                  onNavigate?.();
                }}
              >
                <Thumb page={p} />
                <span className="font-mono text-mono-timer text-fg-muted">
                  Pág. {i + 1}
                  {p.src === null ? " · en blanco" : ""}
                </span>
              </button>
              <div className="mt-1 flex justify-center gap-0.5">
                <button type="button" className={btn} title="Rotar 90°" aria-label={`Rotar página ${i + 1}`} onClick={() => store.change(rotatePage(store.doc, p.id, 90))}>
                  <RotateCw className="h-4 w-4" />
                </button>
                <button type="button" className={btn} title="Duplicar" aria-label={`Duplicar página ${i + 1}`} onClick={() => store.change(duplicatePage(store.doc, p.id))}>
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" className={btn} title="Subir" aria-label={`Subir página ${i + 1}`} disabled={i === 0} onClick={() => store.change(movePage(store.doc, i, i - 1))}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className={btn} title="Bajar" aria-label={`Bajar página ${i + 1}`} disabled={i === pages.length - 1} onClick={() => store.change(movePage(store.doc, i, i + 1))}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`${btn} hover:text-danger-fg`}
                  title="Eliminar"
                  aria-label={`Eliminar página ${i + 1}`}
                  disabled={pages.length <= 1}
                  onClick={() => store.change(deletePage(store.doc, p.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
