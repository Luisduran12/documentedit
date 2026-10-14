import { describe, expect, it } from "vitest";
import {
  computeExpiry,
  extendExpiry,
  formatCountdown,
  resolvePublic,
  shareState,
  TTL_OPTIONS,
  ttlMs,
} from "@/lib/shares/ttl";

const T0 = new Date("2026-10-10T15:00:00.000Z");
const DAY = 86_400_000;

describe("cálculo de caducidades", () => {
  it.each([
    ["1d", 1],
    ["2d", 2],
    ["7d", 7],
    ["15d", 15],
    ["30d", 30],
    ["60d", 60],
    ["180d", 180],
  ])("%s vence a los %i días exactos", (label, days) => {
    expect(computeExpiry(label, T0).getTime() - T0.getTime()).toBe(days * DAY);
  });

  it("ofrece exactamente los 7 chips pedidos", () => {
    expect(TTL_OPTIONS.map((o) => o.text)).toEqual(["1 día", "2 días", "1 semana", "15 días", "1 mes", "2 meses", "6 meses"]);
  });

  it("rechaza caducidades no válidas", () => {
    expect(() => computeExpiry("3d", T0)).toThrow(RangeError);
    expect(ttlMs("1y")).toBeNull();
  });

  it("la caducidad de prueba de 5 min solo existe en modo desarrollo", () => {
    expect(ttlMs("5m")).toBeNull();
    expect(ttlMs("5m", true)).toBe(5 * 60_000);
  });

  it("ampliar un enlace vigente suma al vencimiento actual", () => {
    const current = new Date(T0.getTime() + 2 * DAY);
    expect(extendExpiry(current, "7d", T0).getTime()).toBe(current.getTime() + 7 * DAY);
  });

  it("ampliar un enlace ya vencido cuenta desde ahora", () => {
    const current = new Date(T0.getTime() - DAY);
    expect(extendExpiry(current, "1d", T0).getTime()).toBe(T0.getTime() + DAY);
  });
});

describe("estado de un enlace", () => {
  const share = (expOffset: number, deleted?: number) => ({
    expiresAt: new Date(T0.getTime() + expOffset),
    deletedAt: deleted === undefined ? null : new Date(T0.getTime() + deleted),
  });

  it("activo con más de 24 h", () => expect(shareState(share(2 * DAY), T0)).toBe("active"));
  it("por vencer con menos de 24 h", () => expect(shareState(share(DAY - 1000), T0)).toBe("expiring"));
  it("vencido justo al llegar la hora", () => expect(shareState(share(0), T0)).toBe("expired"));
  it("revocado si se borró antes de vencer", () => expect(shareState(share(DAY, -1000), T0)).toBe("revoked"));
  it("vencido si lo purgó el cron después de vencer", () => expect(shareState(share(-DAY, -1000), T0)).toBe("expired"));
});

describe("validación de /s/[id]", () => {
  it("activo → se sirve", () => {
    expect(resolvePublic({ expiresAt: new Date(T0.getTime() + 1000), deletedAt: null }, T0)).toEqual({ ok: true });
  });
  it("vencido → no se sirve aunque el archivo siga existiendo", () => {
    expect(resolvePublic({ expiresAt: new Date(T0.getTime() - 1), deletedAt: null }, T0)).toEqual({ ok: false, reason: "expired" });
  });
  it("revocado → no se sirve", () => {
    expect(resolvePublic({ expiresAt: new Date(T0.getTime() + DAY), deletedAt: new Date(T0.getTime() - 1) }, T0)).toEqual({ ok: false, reason: "revoked" });
  });
  it("inexistente → no se sirve", () => {
    expect(resolvePublic(null, T0)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("contador regresivo", () => {
  it("formatea días, horas y minutos", () => expect(formatCountdown(7 * DAY - 60_000)).toBe("6 d 23 h 59 min"));
  it("bajo un día muestra segundos", () => expect(formatCountdown(3_723_000)).toBe("01 h 02 min 03 s"));
  it("vencido", () => expect(formatCountdown(0)).toBe("Vencido"));
});
