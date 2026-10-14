// Lógica pura de caducidades (sin dependencias de servidor; se prueba con Vitest).

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const TTL_OPTIONS = [
  { label: "1d", text: "1 día", ms: 1 * DAY },
  { label: "2d", text: "2 días", ms: 2 * DAY },
  { label: "7d", text: "1 semana", ms: 7 * DAY },
  { label: "15d", text: "15 días", ms: 15 * DAY },
  { label: "30d", text: "1 mes", ms: 30 * DAY },
  { label: "60d", text: "2 meses", ms: 60 * DAY },
  { label: "180d", text: "6 meses", ms: 180 * DAY },
] as const;

/** Caducidad corta SOLO para probar el vencimiento en desarrollo. */
export const DEV_TTL = { label: "5m", text: "5 min (prueba)", ms: 5 * MIN } as const;

export type TtlLabel = (typeof TTL_OPTIONS)[number]["label"] | typeof DEV_TTL.label;

export function ttlOptions(allowDev: boolean) {
  return allowDev ? [DEV_TTL, ...TTL_OPTIONS] : [...TTL_OPTIONS];
}

export function ttlMs(label: string, allowDev = false): number | null {
  const opt = ttlOptions(allowDev).find((o) => o.label === label);
  return opt ? opt.ms : null;
}

export function ttlText(label: string) {
  return [DEV_TTL, ...TTL_OPTIONS].find((o) => o.label === label)?.text ?? label;
}

export function computeExpiry(label: string, from: Date, allowDev = false): Date {
  const ms = ttlMs(label, allowDev);
  if (ms === null) throw new RangeError(`Caducidad no válida: ${label}`);
  return new Date(from.getTime() + ms);
}

/**
 * Ampliar caducidad: si el enlace sigue vigente se suma el intervalo a la fecha actual de vencimiento;
 * si ya venció (pero el archivo aún existe), se cuenta desde ahora.
 */
export function extendExpiry(currentExpiry: Date, label: string, now: Date, allowDev = false): Date {
  const base = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return computeExpiry(label, base, allowDev);
}

export type ShareState = "active" | "expiring" | "expired" | "revoked";

export const EXPIRING_WINDOW_MS = DAY;

export function shareState(s: { expiresAt: Date | string; deletedAt: Date | string | null }, now: Date): ShareState {
  if (s.deletedAt) {
    // deleted_at lo marca tanto "revocar" como la purga del cron tras vencer.
    return new Date(s.expiresAt).getTime() <= new Date(s.deletedAt).getTime() ? "expired" : "revoked";
  }
  const left = new Date(s.expiresAt).getTime() - now.getTime();
  if (left <= 0) return "expired";
  if (left < EXPIRING_WINDOW_MS) return "expiring";
  return "active";
}

/** Resultado de validar un enlace público /s/[id]. */
export type PublicResolution =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

export function resolvePublic(s: { expiresAt: Date; deletedAt: Date | null } | null | undefined, now: Date): PublicResolution {
  if (!s) return { ok: false, reason: "not_found" };
  const state = shareState(s, now);
  if (state === "revoked") return { ok: false, reason: "revoked" };
  if (state === "expired") return { ok: false, reason: "expired" };
  return { ok: true };
}

/** "6 d 23 h 59 min" / "4 h 12 min 05 s" — para el contador regresivo. */
export function formatCountdown(ms: number) {
  if (ms <= 0) return "Vencido";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d} d ${pad(h)} h ${pad(m)} min`;
  return `${pad(h)} h ${pad(m)} min ${pad(sec)} s`;
}

export const SHARE_ID_LENGTH = 12;
export const SHARE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
