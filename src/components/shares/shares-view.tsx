"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Copy, ImageIcon, Loader2, Plus, QrCode, ShieldOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ActionMenu, Pill } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";
import { extendExpiry, shareState, type ShareState } from "@/lib/shares/ttl";
import { ALLOW_DEV_TTL } from "@/lib/shares/dev";
import { Countdown, useNow } from "./countdown";
import { ShareCreator } from "./share-creator";
import { ShareResult } from "./share-result";
import { TtlChips } from "./ttl-chips";
import type { ShareItem } from "./types";

const STATE_PILL: Record<ShareState, { tone: "ok" | "warn" | "danger" | "neutral"; text: string }> = {
  active: { tone: "ok", text: "Activo" },
  expiring: { tone: "warn", text: "Vence en < 24 h" },
  expired: { tone: "neutral", text: "Vencido" },
  revoked: { tone: "danger", text: "Revocado" },
};

export function SharesView() {
  const toast = useToast();
  const now = useNow(30_000);
  const [shares, setShares] = useState<ShareItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<ShareItem | null>(null);
  const [extending, setExtending] = useState<ShareItem | null>(null);
  const [extendTtl, setExtendTtl] = useState("7d");
  const [revoking, setRevoking] = useState<ShareItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<{ shares: ShareItem[] }>("/api/shares")
        .then((d) => setShares(d.shares))
        .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar el historial")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    api<{ shares: ShareItem[] }>("/api/shares")
      .then((d) => setShares(d.shares))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "No se pudo cargar el historial"));
  }, []);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.ok("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  const createButton = (
    <button type="button" className="btn btn-primary h-11" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" /> Nueva imagen temporal
    </button>
  );

  return (
    <>
      <PageHeader title="Imágenes y QR" description="Enlaces temporales que se borran solos al vencer." actions={createButton} />

      {loadError && shares === null ? (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-fg">{loadError}</p>
      ) : shares === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-5 w-5" />}
          title="Aún no tienes imágenes compartidas"
          description="Sube una imagen, elige cuánto tiempo estará disponible y obtén su enlace y código QR."
          action={createButton}
        />
      ) : (
        <ul className="panel divide-y divide-white/[0.06] rounded-2xl">
          {shares.map((s) => {
            const state = shareState(s, new Date(now ?? Date.parse(s.createdAt)));
            const pill = STATE_PILL[state];
            const live = state === "active" || state === "expiring";
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-subtle">
                  {s.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de R2
                    <img src={s.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-fg-muted">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`truncate font-mono text-mono-data ${live ? "text-accent-fg" : "text-fg-muted line-through"}`}>/s/{s.id}</span>
                    <Pill tone={pill.tone}>
                      {state === "expiring" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />}
                      {pill.text}
                    </Pill>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
                    <span>{live ? "Vence" : state === "revoked" ? "Iba a vencer" : "Venció"} {formatDateTime(s.expiresAt)}</span>
                    {live && <Countdown to={s.expiresAt} className={state === "expiring" ? "text-warning-fg" : "text-fg-2"} />}
                    <span className="font-mono">
                      {s.views} {s.views === 1 ? "vista" : "vistas"}
                    </span>
                  </p>
                </div>
                <ActionMenu
                  label={`Acciones para /s/${s.id}`}
                  actions={[
                    { label: "Copiar enlace", icon: Copy, onSelect: () => copy(s.url), hidden: !live },
                    { label: "Ver QR", icon: QrCode, onSelect: () => setViewing(s), hidden: !live },
                    { label: "Ampliar caducidad", icon: CalendarPlus, onSelect: () => setExtending(s), hidden: Boolean(s.deletedAt) },
                    { label: "Revocar ahora", icon: ShieldOff, danger: true, onSelect: () => setRevoking(s), hidden: Boolean(s.deletedAt) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva imagen temporal" size="lg">
        {creating && <ShareCreator onCreated={reload} />}
      </Modal>

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title="Código QR" size="lg">
        {viewing && <ShareResult share={viewing} />}
      </Modal>

      <Modal
        open={extending !== null}
        onClose={() => setExtending(null)}
        title="Ampliar caducidad"
        footer={
          <>
            <button type="button" className="btn btn-secondary h-11" onClick={() => setExtending(null)}>Cancelar</button>
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary h-11"
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/shares/${extending!.id}`, { method: "PATCH", json: { action: "extend", ttl: extendTtl } });
                  toast.ok("Caducidad ampliada");
                  setExtending(null);
                  await reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "No se pudo ampliar");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ampliar
            </button>
          </>
        }
      >
        {extending && (
          <div className="flex flex-col gap-4">
            <TtlChips value={extendTtl} onChange={setExtendTtl} label="Añadir" />
            <p className="text-sm text-fg-2">
              Nuevo vencimiento:{" "}
              <strong className="text-fg">{formatDateTime(extendExpiry(new Date(extending.expiresAt), extendTtl, new Date(), ALLOW_DEV_TTL))}</strong>
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="¿Revocar este enlace?"
        footer={
          <>
            <button type="button" className="btn btn-secondary h-11" onClick={() => setRevoking(null)}>Cancelar</button>
            <button
              type="button"
              disabled={busy}
              className="btn btn-danger h-11"
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/shares/${revoking!.id}`, { method: "DELETE" });
                  toast.ok("Enlace revocado y archivo borrado");
                  setRevoking(null);
                  await reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "No se pudo revocar");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revocar ahora
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          La imagen se borrará de inmediato y quien escanee el QR verá «Este enlace ya no está disponible». No se puede deshacer.
        </p>
      </Modal>
    </>
  );
}
