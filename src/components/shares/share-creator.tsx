"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatBytes, IMAGE_MIMES, MAX_IMAGE_BYTES } from "@/lib/files";
import { uploadToR2, validateFile } from "@/lib/upload-client";
import { useToast } from "@/components/ui/toast";
import { ShareResult } from "./share-result";
import { TtlChips } from "./ttl-chips";
import type { ShareItem } from "./types";

/**
 * Flujo completo: elegir/pegar/arrastrar/fotografiar imagen → caducidad → subir → enlace + QR.
 */
export function ShareCreator({ onCreated, onInsert }: { onCreated?: (s: ShareItem) => void; onInsert?: (s: ShareItem) => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(null);
  const file = picked?.file ?? null;
  const preview = picked?.preview ?? null;
  const [ttl, setTtl] = useState("7d");
  const [pct, setPct] = useState<number | null>(null);
  const [result, setResult] = useState<ShareItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ defaultTtl: string }>("/api/settings").then((s) => setTtl(s.defaultTtl)).catch(() => {});
  }, []);

  function setFile(f: File | null) {
    setPicked((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return f ? { file: f, preview: URL.createObjectURL(f) } : null;
    });
  }

  async function choose(f: File | null | undefined) {
    if (!f) return;
    try {
      await validateFile(f, "image");
      setFile(f);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Archivo no válido");
    }
  }

  // Pegar desde el portapapeles (Ctrl/Cmd+V) mientras el flujo está abierto.
  useEffect(() => {
    if (result) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        choose(new File([item], item.name || "imagen-pegada.png", { type: item.type }));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  async function submit() {
    if (!file) return;
    setPct(0);
    try {
      const token = await uploadToR2(file, "image", file.name, setPct);
      const { share } = await api<{ share: ShareItem }>("/api/shares", { method: "POST", json: { token, ttl } });
      setResult(share);
      onCreated?.(share);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el enlace");
    } finally {
      setPct(null);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <ShareResult share={result} onInsert={onInsert} />
        <button
          type="button"
          className="btn btn-ghost h-11 self-start"
          onClick={() => {
            setResult(null);
            setFile(null);
          }}
        >
          <ImagePlus className="h-4 w-4" /> Crear otro enlace
        </button>
      </div>
    );
  }

  const inputs = (
    <>
      <input ref={pickRef} type="file" accept={IMAGE_MIMES.join(",")} hidden onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ""))} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {inputs}
      {preview ? (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
          <img src={preview} alt="Vista previa" className="mx-auto max-h-72 object-contain" />
          <button type="button" onClick={() => setFile(null)} aria-label="Quitar imagen" className="glass absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full">
            <X className="h-4 w-4" />
          </button>
          <p className="border-t border-white/[0.06] px-3 py-2 font-mono text-mono-timer text-fg-muted">
            {file?.name} · {formatBytes(file?.size ?? 0)}
          </p>
        </div>
      ) : (
        <div
          onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            choose(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver ? "border-primary-strong bg-primary/10" : "border-border"
          }`}
        >
          <ImagePlus className="h-8 w-8 text-primary-fg" aria-hidden />
          <p className="text-sm text-fg-2">
            Arrastra una imagen aquí o <span className="hidden md:inline">pégala con Ctrl+V</span>
            <span className="md:hidden">elígela</span>
          </p>
          <p className="font-mono text-mono-timer text-fg-muted">PNG, JPG, WEBP o GIF · máx. {formatBytes(MAX_IMAGE_BYTES)}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-secondary h-11" onClick={() => pickRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Elegir imagen
            </button>
            <button type="button" className="btn btn-secondary h-11 md:hidden" onClick={() => camRef.current?.click()}>
              <Camera className="h-4 w-4" /> Tomar foto
            </button>
          </div>
        </div>
      )}

      <TtlChips value={ttl} onChange={setTtl} />

      <button type="button" disabled={!file || pct !== null} onClick={submit} className="btn btn-primary h-11">
        {pct !== null ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo… {pct}%
          </>
        ) : (
          "Crear enlace y QR"
        )}
      </button>
    </div>
  );
}
