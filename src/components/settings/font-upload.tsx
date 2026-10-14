"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { uploadToR2 } from "@/lib/upload-client";
import { useToast } from "@/components/ui/toast";

export type UploadedFont = { id: string; family: string };

/** Botón para subir una fuente .ttf/.otf (se guarda en R2 y en Configuración). */
export function FontUploadButton({ onUploaded, className = "btn btn-secondary h-11" }: { onUploaded: (f: UploadedFont) => void; className?: string }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const family = file.name.replace(/\.(ttf|otf)$/i, "").replace(/[-_]+/g, " ").trim() || "Fuente";
      const token = await uploadToR2(file, "font", file.name);
      const { font } = await api<{ font: UploadedFont }>("/api/fonts", { method: "POST", json: { token, family } });
      toast.ok(`Fuente «${font.family}» añadida`);
      onUploaded(font);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la fuente");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={(e) => (e.target.files?.[0] && upload(e.target.files[0]), (e.target.value = ""))} />
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir .ttf / .otf
      </button>
    </>
  );
}
