import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPdfForEditing, md5, PasswordRequiredError, rc4 } from "@/lib/editor/pdf/decrypt";
import { analyzePage } from "@/lib/editor/pdf/interpret";
import { diffPixels, renderPage } from "./helpers/render";
import { FIXTURE } from "./helpers/text-edit";

const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const texts = async (bytes: Uint8Array) => analyzePage((await loadPdfForEditing(bytes)).getPage(0)).records.map((r) => r.glyphs.map((g) => g.unicode).join(""));

describe("primitivas criptográficas", () => {
  it("MD5 (vectores RFC 1321)", () => {
    const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex(md5(new Uint8Array()))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(hex(md5(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")))).toBe("9e107d9d372bb6826bd81d3542a419d6");
  });
  it("RC4 es simétrico", () => {
    const key = new TextEncoder().encode("clave");
    const data = new TextEncoder().encode("texto de prueba");
    expect(rc4(key, rc4(key, data))).toEqual(data);
  });
});

describe("PDF cifrado que se abre sin contraseña (restricciones de edición)", async () => {
  const reference = await texts(FIXTURE);
  it.each(["rc4-128", "aes-128", "aes-256"])("%s: se descifra y el texto se lee igual que el original", async (variant) => {
    const bytes = fixture(`fuec-sintetico-${variant}.pdf`);
    const doc = await loadPdfForEditing(bytes);
    expect(doc.context.trailerInfo.Encrypt).toBeUndefined();
    expect(await texts(bytes)).toEqual(reference);
    // El PDF guardado ya no está cifrado y se ve igual que el original.
    const saved = await doc.save();
    const a = await renderPage(bytes, 1, 100);
    const b = await renderPage(saved, 1, 100);
    expect(diffPixels(a, b).diff).toBe(0);
  }, 60000);

  it("si exige contraseña de apertura, se informa con un error claro", async () => {
    await expect(loadPdfForEditing(fixture("fuec-sintetico-con-clave.pdf"))).rejects.toBeInstanceOf(PasswordRequiredError);
  });
});
