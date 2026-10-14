import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const repo = { consumeView: vi.fn(), findShare: vi.fn() };
vi.mock("@/lib/shares/repo", () => repo);
const presignGet = vi.fn(async () => "https://cuenta.r2.cloudflarestorage.com/firmada");
vi.mock("@/lib/storage/r2", () => ({ presignGet }));

const { GET: page } = await import("@/app/s/[id]/route");
const { GET: img } = await import("@/app/s/[id]/img/route");

const ID = "AbCdEfGh1234";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = new Request(`http://localhost/s/${ID}`);
const H = 3_600_000;

function row(expiresInMs: number, deletedAgoMs?: number) {
  const now = Date.now();
  return {
    id: ID,
    storageKey: "shares/x.png",
    mime: "image/png",
    expiresAt: new Date(now + expiresInMs),
    deletedAt: deletedAgoMs === undefined ? null : new Date(now - deletedAgoMs),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("/s/[id] (página)", () => {
  it("activo → 200 con la imagen, noindex y sin caché", async () => {
    repo.consumeView.mockResolvedValue(row(H));
    const res = await page(req, ctx());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`/s/${ID}/img`);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("vencido, revocado o inexistente → 410 sin referencia a la imagen", async () => {
    repo.consumeView.mockResolvedValue(null); // la consulta atómica no devuelve fila
    const res = await page(req, ctx());
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toContain("Este enlace ya no está disponible");
    expect(html).not.toContain("/img");
  });

  it("id con formato inválido → 410 sin consultar la BD", async () => {
    const res = await page(req, ctx("../../etc"));
    expect(res.status).toBe(410);
    expect(repo.consumeView).not.toHaveBeenCalled();
  });
});

describe("/s/[id]/img", () => {
  it("activo → 302 a URL firmada de máx. 60 s", async () => {
    repo.findShare.mockResolvedValue(row(H));
    const res = await img(req, ctx());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("r2.cloudflarestorage.com");
    expect(presignGet).toHaveBeenCalledWith("shares/x.png", expect.objectContaining({ expiresIn: 60 }));
  });

  it("la URL firmada nunca dura más que el enlace", async () => {
    repo.findShare.mockResolvedValue(row(20_000));
    await img(req, ctx());
    const opts = (presignGet.mock.calls[0] as unknown as [string, { expiresIn: number }])[1];
    expect(opts.expiresIn).toBeLessThanOrEqual(20);
  });

  it.each([
    ["vencido (archivo aún no purgado)", row(-1000)],
    ["revocado", row(H, 1000)],
    ["inexistente", null],
  ])("%s → 410 sin firmar URL", async (_name, r) => {
    repo.findShare.mockResolvedValue(r);
    const res = await img(req, ctx());
    expect(res.status).toBe(410);
    expect(presignGet).not.toHaveBeenCalled();
  });
});
