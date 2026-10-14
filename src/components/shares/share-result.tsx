"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, FileInput, QrCode } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { downloadBlob, qrPngDataUrl, qrSvg } from "@/lib/qr";
import { useToast } from "@/components/ui/toast";
import { Countdown } from "./countdown";
import type { ShareItem } from "./types";

export function CopyButton({ text, label = "Copiar enlace" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-secondary h-11"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
        }
      }}
    >
      {done ? <Check className="h-4 w-4 text-success-fg" /> : <Copy className="h-4 w-4" />}
      {done ? "Copiado" : label}
    </button>
  );
}

/** Tarjeta de despacho: enlace, QR, vencimiento exacto (hora Colombia) y contador. */
export function ShareResult({ share, onInsert }: { share: ShareItem; onInsert?: (share: ShareItem) => void }) {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    qrPngDataUrl(share.url).then(setPng);
  }, [share.url]);

  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div className="mx-auto shrink-0 rounded-2xl border border-border bg-white p-2 sm:mx-0">
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL generada localmente
          <img src={png} alt={`Código QR para ${share.url}`} width={200} height={200} className="h-[200px] w-[200px]" />
        ) : (
          <div className="flex h-[200px] w-[200px] items-center justify-center text-fg-muted">
            <QrCode className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <span className="label">Enlace público</span>
          <a href={share.url} target="_blank" rel="noreferrer" className="block break-all font-mono text-mono-data text-accent-fg hover:underline">
            {share.url}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Vence</span>
            <p className="text-sm">{formatDateTime(share.expiresAt)}</p>
          </div>
          <div>
            <span className="label">Tiempo restante</span>
            <Countdown to={share.expiresAt} className="text-warning-fg" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={share.url} />
          <button
            type="button"
            className="btn btn-secondary h-11"
            onClick={async () => {
              const res = await fetch(await qrPngDataUrl(share.url, 1200));
              downloadBlob(await res.blob(), `qr-${share.id}.png`);
            }}
          >
            <Download className="h-4 w-4" /> PNG
          </button>
          <button
            type="button"
            className="btn btn-secondary h-11"
            onClick={async () => downloadBlob(new Blob([await qrSvg(share.url)], { type: "image/svg+xml" }), `qr-${share.id}.svg`)}
          >
            <Download className="h-4 w-4" /> SVG
          </button>
          {onInsert && (
            <button type="button" className="btn btn-primary h-11" onClick={() => onInsert(share)}>
              <FileInput className="h-4 w-4" /> Insertar en el PDF abierto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
