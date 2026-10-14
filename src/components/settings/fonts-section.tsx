"use client";

import { useEffect, useState } from "react";
import { Trash2, Type } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/dates";
import { FontUploadButton, type UploadedFont } from "./font-upload";

/** Fuentes personalizadas para el editor (para reproducir tipografías que no vienen incluidas). */
export function FontsSection() {
  const toast = useToast();
  const [fonts, setFonts] = useState<(UploadedFont & { createdAt: string })[] | null>(null);

  const load = () =>
    api<{ fonts: (UploadedFont & { createdAt: string })[] }>("/api/fonts")
      .then((d) => setFonts(d.fonts))
      .catch(() => setFonts([]));

  useEffect(() => {
    api<{ fonts: (UploadedFont & { createdAt: string })[] }>("/api/fonts")
      .then((d) => setFonts(d.fonts))
      .catch(() => setFonts([]));
  }, []);

  return (
    <section className="panel rounded-2xl p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-primary-fg">
          <Type className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold">Fuentes personalizadas</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Si un PDF usa una fuente que no viene incluida (p. ej. Calibri), sube su archivo para editar con la misma tipografía. Usa solo fuentes que tengas derecho a usar.
          </p>
        </div>
      </div>
      {fonts && fonts.length > 0 && (
        <ul className="mb-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {fonts.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 truncate text-sm" style={{ fontFamily: `"custom-${f.id}"` }}>
                {f.family}
              </span>
              <span className="font-mono text-mono-timer text-fg-muted">{formatDate(f.createdAt)}</span>
              <button
                type="button"
                aria-label={`Eliminar fuente ${f.family}`}
                className="btn btn-ghost btn-icon h-10 w-10 hover:text-danger-fg"
                onClick={async () => {
                  try {
                    await api(`/api/fonts/${f.id}`, { method: "DELETE" });
                    toast.ok("Fuente eliminada");
                    load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {fonts?.length === 0 && <p className="mb-4 text-sm text-fg-muted">Aún no has subido fuentes.</p>}
      <FontUploadButton onUploaded={() => load()} />
    </section>
  );
}
