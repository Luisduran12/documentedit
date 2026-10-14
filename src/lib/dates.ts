// Fechas y horas siempre en hora de Colombia.
export const TZ = "America/Bogota";
const LOCALE = "es-CO";

export function formatDate(iso: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatRelative(iso: string | Date, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}
