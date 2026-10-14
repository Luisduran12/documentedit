"use client";

import { useEffect, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { ShareItem } from "@/components/shares/types";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";
import { shareState } from "@/lib/shares/ttl";

/** Elegir un QR ya creado en «Imágenes y QR» (solo enlaces vigentes) para insertarlo en el PDF. */
export function ShareQrPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (s: ShareItem) => void }) {
  const [shares, setShares] = useState<ShareItem[] | null>(null);
  useEffect(() => {
    if (!open) return;
    api<{ shares: ShareItem[] }>("/api/shares")
      .then((d) => setShares(d.shares.filter((s) => ["active", "expiring"].includes(shareState(s, new Date())))))
      .catch(() => setShares([]));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Insertar un QR de la app" size="lg">
      {!shares ? (
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      ) : shares.length === 0 ? (
        <p className="text-sm text-fg-muted">No tienes enlaces vigentes. Crea uno con «QR de imagen temporal».</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {shares.map((s) => (
            <li key={s.id}>
              <button type="button" className="flex w-full items-center gap-3 py-3 text-left hover:bg-subtle/60" onClick={() => onPick(s)}>
                {s.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
                  <img src={s.thumbUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <QrCode className="h-10 w-10 text-fg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-mono-data text-accent-fg">/s/{s.id}</span>
                  <span className="text-xs text-fg-muted">Vence {formatDateTime(s.expiresAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
