"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { countPages } from "@/lib/pdf/pdfjs";
import { uploadToR2 } from "@/lib/upload-client";
import { useToast } from "@/components/ui/toast";

type Progress = { name: string; pct: number };

/** Sube PDFs: botón/selector de archivos (también en celular) y arrastrar-soltar sobre toda la página. */
export function useUploader(onDone: () => void) {
  const toast = useToast();
  const [progress, setProgress] = useState<Progress[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name);
        let fileToUpload: File = file;
        let finalName = file.name;

        if (isImage) {
          try {
            setProgress((p) => [...p, { name: file.name, pct: 10 }]);
            // Convertir la imagen a un PDF respetando sus dimensiones y aspecto original
            const { PDFDocument } = await import("pdf-lib");
            const pdfDoc = await PDFDocument.create();
            const arrayBuffer = await file.arrayBuffer();
            let embeddedImage;

            if (file.type === "image/png" || /\.png$/i.test(file.name)) {
              embeddedImage = await pdfDoc.embedPng(arrayBuffer);
            } else if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
              embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
            } else {
              // Para WEBP u otros formatos, convertir a PNG mediante un canvas temporal en el navegador
              const bitmap = await createImageBitmap(file);
              const canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("No se pudo inicializar canvas para procesar la imagen");
              ctx.drawImage(bitmap, 0, 0);
              const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
              if (!pngBlob) throw new Error("Error al convertir imagen a PNG");
              embeddedImage = await pdfDoc.embedPng(await pngBlob.arrayBuffer());
            }

            const imgWidth = embeddedImage.width;
            const imgHeight = embeddedImage.height;
            const page = pdfDoc.addPage([imgWidth, imgHeight]);
            page.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: imgWidth,
              height: imgHeight,
            });

            const pdfBytes = await pdfDoc.save();
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            finalName = `${baseName}.pdf`;
            fileToUpload = new File([pdfBytes as any], finalName, { type: "application/pdf" });
          } catch (err: any) {
            toast.error(`Error preparando imagen «${file.name}»: ${err?.message || err}`);
            setProgress((p) => p.filter((x) => x.name !== file.name));
            continue;
          }
        }

        const name = finalName;
        setProgress((p) => [...p.filter((x) => x.name !== file.name), { name, pct: 20 }]);
        try {
          const pageCount = await countPages(fileToUpload);
          const token = await uploadToR2(fileToUpload, "pdf", name, (pct) =>
            setProgress((p) => p.map((x) => (x.name === name ? { ...x, pct } : x))),
          );
          await api("/api/documents", { method: "POST", json: { token, name, pageCount } });
          toast.ok(isImage ? `«${file.name}» convertida a PDF y lista para OCR` : `«${name}» subido`);
          onDone();
        } catch (e) {
          toast.error(`«${name}»: ${e instanceof Error ? e.message : "no se pudo subir"}`);
        } finally {
          setProgress((p) => p.filter((x) => x.name !== name));
        }
      }
    },
    [onDone, toast],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/jpg"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) uploadFiles(files);
      }}
    />
  );

  return { progress, uploadFiles, pick: () => inputRef.current?.click(), input };
}

export function DropOverlay({ onFiles, children }: { onFiles: (f: File[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  return (
    <>
      {children}
      {over && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary-strong px-12 py-10 text-center">
            <Upload className="h-8 w-8 text-primary-fg" />
            <p className="font-display text-lg font-semibold">Suelta para subir</p>
          </div>
        </div>
      )}
    </>
  );
}

export function UploadProgress({ items }: { items: Progress[] }) {
  if (items.length === 0) return null;
  return (
    <div className="panel mb-4 flex flex-col gap-3 rounded-2xl p-4" aria-live="polite">
      {items.map((p) => (
        <div key={p.name}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-fg" />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="font-mono text-mono-data text-fg-muted">{p.pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-primary-strong transition-[width]" style={{ width: `${p.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
