import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET = "x".repeat(48);

vi.mock("server-only", () => ({}));
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));
const settings = { sessionVersion: 3 };
vi.mock("@/lib/auth/settings", () => ({ getSettings: async () => settings }));
const presignPut = vi.fn(async () => "https://cuenta.r2.cloudflarestorage.com/subida");
vi.mock("@/lib/storage/r2", () => ({ presignPut, PREFIX: { documents: "documents/", shares: "shares/", assets: "assets/", fonts: "fonts/" } }));

const { POST } = await import("@/app/api/uploads/route");
const { signSession } = await import("@/lib/auth/session");

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/uploads", { method: "POST", body: JSON.stringify(body) }), undefined as never);
const pdf = { kind: "pdf", contentType: "application/pdf", size: 1000, name: "a.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = undefined;
});

describe("emisión de URLs firmadas", () => {
  it("sin cookie → 401 y no firma nada", async () => {
    const res = await call(pdf);
    expect(res.status).toBe(401);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("cookie falsificada → 401", async () => {
    cookieValue = "eyJhbGciOiJIUzI1NiJ9.eyJzdiI6M30.firma-falsa";
    expect((await call(pdf)).status).toBe(401);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("sesión de una versión revocada (cerrar sesión en todos) → 401", async () => {
    cookieValue = await signSession(2);
    expect((await call(pdf)).status).toBe(401);
  });

  it("sesión válida → 200 con URL y token", async () => {
    cookieValue = await signSession(3);
    const res = await call(pdf);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("r2.cloudflarestorage.com");
    expect(body.token).toBeTruthy();
    expect(presignPut).toHaveBeenCalledWith(expect.stringMatching(/^documents\/.+\.pdf$/), "application/pdf", 1000);
  });

  it("sesión válida pero archivo demasiado grande → 413", async () => {
    cookieValue = await signSession(3);
    expect((await call({ ...pdf, size: 51 * 1024 * 1024 })).status).toBe(413);
  });

  it("sesión válida pero tipo no permitido → 415", async () => {
    cookieValue = await signSession(3);
    expect((await call({ ...pdf, contentType: "text/html" })).status).toBe(415);
  });
});
