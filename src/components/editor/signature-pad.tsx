"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";

export type Signature = { aspect: number; strokes: [number, number][][] };

const W = 600;
const H = 220;

function normalize(strokes: [number, number][][]): Signature | null {
  const all = strokes.flat();
  if (all.length < 2) return null;
  const pad = 4;
  const minX = Math.min(...all.map((p) => p[0])) - pad;
  const minY = Math.min(...all.map((p) => p[1])) - pad;
  const w = Math.max(10, Math.max(...all.map((p) => p[0])) + pad - minX);
  const h = Math.max(10, Math.max(...all.map((p) => p[1])) + pad - minY);
  return { aspect: w / h, strokes: strokes.map((s) => s.map(([x, y]) => [(x - minX) / w, (y - minY) / h] as [number, number])) };
}

export function SignaturePad({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (s: Signature) => void }) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<[number, number][][]>([]);
  const [saved, setSaved] = useState<Signature | null>(null);
  const [remember, setRemember] = useState(true);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open) return;
    api<{ signature: Signature | null }>("/api/settings")
      .then((s) => setSaved(s.signature))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#1d3b8f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
  }, [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  async function insert(sig: Signature, save: boolean) {
    if (save) {
      await api("/api/settings", { method: "PATCH", json: { signature: sig } }).catch(() => toast.error("No se pudo guardar la firma para reutilizarla"));
    }
    onInsert(sig);
    setStrokes([]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Firma a mano"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary h-11" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary h-11"
            disabled={strokes.length === 0}
            onClick={() => {
              const sig = normalize(strokes);
              if (sig) insert(sig, remember);
            }}
          >
            Insertar firma
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {saved && (
          <button type="button" onClick={() => insert(saved, false)} className="flex items-center gap-3 rounded-xl border border-border bg-white p-2 text-left hover:border-primary-strong">
            <svg viewBox={`0 0 ${saved.aspect * 100} 100`} className="h-14 w-auto max-w-[60%]">
              {saved.strokes.map((s, i) => (
                <polyline key={i} points={s.map(([u, v]) => `${u * saved.aspect * 100},${v * 100}`).join(" ")} fill="none" stroke="#1d3b8f" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </svg>
            <span className="text-sm font-medium text-neutral-800">Usar mi firma guardada</span>
          </button>
        )}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Dibuja tu firma</span>
            <button type="button" className="btn btn-ghost h-9 px-2 text-xs" onClick={() => setStrokes([])}>
              <Eraser className="h-4 w-4" /> Borrar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            aria-label="Área de firma"
            className="w-full touch-none rounded-xl border border-border bg-white"
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              setStrokes((s) => [...s, [point(e)]]);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = point(e);
              setStrokes((s) => [...s.slice(0, -1), [...s[s.length - 1], p]]);
            }}
            onPointerUp={() => (drawing.current = false)}
            onPointerCancel={() => (drawing.current = false)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" />
          Guardar como mi firma para reutilizarla
        </label>
      </div>
    </Modal>
  );
}
