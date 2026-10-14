"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Loader2, LogOut, MonitorSmartphone, Timer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TtlChips } from "@/components/shares/ttl-chips";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { FontsSection } from "./fonts-section";

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="panel rounded-2xl p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-primary-fg">{icon}</div>
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsView() {
  const toast = useToast();
  const [defaultTtl, setDefaultTtl] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    api<{ defaultTtl: string }>("/api/settings")
      .then((s) => setDefaultTtl(s.defaultTtl))
      .catch(() => {});
  }, []);

  async function saveTtl(v: string) {
    setDefaultTtl(v);
    try {
      await api("/api/settings", { method: "PATCH", json: { defaultTtl: v } });
      toast.ok("Caducidad predeterminada guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("next"));
    if (next !== String(data.get("confirm"))) return setPwError("Las contraseñas nuevas no coinciden");
    setPwBusy(true);
    setPwError(null);
    try {
      await api("/api/auth/password", { method: "POST", json: { current: String(data.get("current")), next } });
      form.reset();
      toast.ok("Contraseña cambiada. Se cerró la sesión en los demás dispositivos.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setPwBusy(false);
    }
  }

  async function signOut(all: boolean) {
    await api(all ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito (sesión/descarga)
    window.location.assign("/login");
  }

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={<Timer className="h-4 w-4" />} title="Caducidad predeterminada" description="Se preselecciona al crear una imagen temporal.">
          {defaultTtl ? <TtlChips value={defaultTtl} onChange={saveTtl} label="Duración" includeDev={false} /> : <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />}
        </Section>

        <Section icon={<MonitorSmartphone className="h-4 w-4" />} title="Sesiones" description="Tu sesión dura 30 días y se renueva sola mientras uses la app.">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary h-11" onClick={() => signOut(false)}>
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
            <button type="button" className="btn btn-danger h-11" onClick={() => signOut(true)}>
              <MonitorSmartphone className="h-4 w-4" /> Cerrar sesión en todos los dispositivos
            </button>
          </div>
        </Section>

        <Section icon={<KeyRound className="h-4 w-4" />} title="Cambiar contraseña" description="Mínimo 12 caracteres. Al cambiarla se cierran las sesiones de los demás dispositivos.">
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
            <div>
              <label htmlFor="pw-current" className="label">Contraseña actual</label>
              <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input h-11" />
            </div>
            <div>
              <label htmlFor="pw-next" className="label">Nueva contraseña</label>
              <input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={12} required className="input h-11" />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="label">Repite la nueva contraseña</label>
              <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input h-11" />
            </div>
            {pwError && <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-fg">{pwError}</p>}
            <button type="submit" disabled={pwBusy} className="btn btn-primary h-11 self-start">
              {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />} Cambiar contraseña
            </button>
          </form>
        </Section>

        <FontsSection />
      </div>
    </>
  );
}
