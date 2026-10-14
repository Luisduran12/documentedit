import { describe, expect, it } from "vitest";
import { cleanFontName, detectStyle, fitsWinAnsi, mapFont } from "@/lib/editor/fonts";
import { frameSize, frameToNative, normalizeRotation, screenDeltaToFrame } from "@/lib/editor/geometry";
import type { ViewBox } from "@/lib/editor/types";

const V: ViewBox = [0, 0, 600, 800]; // W=600, H=800

describe("geometría marco de pantalla → PDF nativo", () => {
  it("sin rotación: arriba-izquierda ↔ (0, H)", () => {
    expect(frameToNative(0, 0, V, 0)).toEqual([0, 800]);
    expect(frameToNative(600, 800, V, 0)).toEqual([600, 0]);
  });
  it("90°: la esquina superior izquierda visible es el origen nativo", () => {
    expect(frameSize(V, 90)).toEqual({ w: 800, h: 600 });
    expect(frameToNative(0, 0, V, 90)).toEqual([0, 0]);
    expect(frameToNative(800, 0, V, 90)).toEqual([0, 800]);
    expect(frameToNative(0, 600, V, 90)).toEqual([600, 0]);
  });
  it("180° y 270°", () => {
    expect(frameToNative(0, 0, V, 180)).toEqual([600, 0]);
    expect(frameToNative(0, 0, V, 270)).toEqual([600, 800]);
    expect(frameToNative(800, 600, V, 270)).toEqual([0, 0]);
  });
  it("respeta el desplazamiento de la caja de vista", () => {
    expect(frameToNative(10, 20, [50, 100, 650, 900], 0)).toEqual([60, 880]);
  });
  it("normaliza y gira desplazamientos", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(screenDeltaToFrame(10, 0, 90)).toEqual([0, -10]);
  });
});

describe("mapeo de fuentes", () => {
  it("quita el prefijo de subconjunto", () => expect(cleanFontName("ABCDEF+Calibri-Bold")).toBe("Calibri-Bold"));
  it("detecta negrita e itálica", () => {
    expect(detectStyle("ArialMT-BoldItalicMT")).toEqual({ bold: true, italic: true });
    expect(detectStyle("Roboto-Regular")).toEqual({ bold: false, italic: false });
    expect(detectStyle("OpenSans-SemiBold")).toEqual({ bold: true, italic: false });
  });
  it.each([
    ["ABCDEF+ArialMT", "Helvetica"],
    ["Helvetica-Bold", "Helvetica"],
    ["TimesNewRomanPSMT", "Times"],
    ["CourierNewPSMT", "Courier"],
    ["XYZABC+Inter-Medium", "inter"],
    ["Roboto-Bold", "roboto"],
    ["OpenSans-Regular", "open-sans"],
    ["Montserrat-Black", "montserrat"],
    ["Lora-Italic", "lora"],
    ["ABCDEF+Calibri-Bold", "carlito"],
    ["Cambria", "caladea"],
  ])("%s → %s (exacta)", (raw, family) => {
    const m = mapFont(raw, "sans-serif");
    expect(m.font.family).toBe(family);
    expect(m.exact).toBe(true);
  });
  it("fuente no disponible → aviso y sustituta por categoría", () => {
    const sans = mapFont("ABCDEF+Tahoma", "sans-serif");
    expect(sans).toMatchObject({ exact: false, original: "Tahoma", font: { family: "liberation-sans" } });
    expect(mapFont("Garamond-Bold", undefined)).toMatchObject({ exact: false, font: { family: "liberation-serif", bold: true } });
    expect(mapFont("Consolas", "monospace").font.family).toBe("Courier");
  });
  it("prefiere fuentes personalizadas subidas", () => {
    const custom = [{ id: "custom:1", label: "Calibri", kind: "custom" as const, css: "x", category: "sans" as const }];
    expect(mapFont("ABCDEF+Calibri-Bold", "sans-serif", custom)).toMatchObject({ exact: true, font: { family: "custom:1" } });
  });
  it("detecta texto no representable en fuentes estándar", () => {
    expect(fitsWinAnsi("Contraseña: año €")).toBe(true);
    expect(fitsWinAnsi("Привет")).toBe(false);
  });
});
