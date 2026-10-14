import { describe, expect, it } from "vitest";
import { union, type Rect } from "@/lib/editor/pdf/blocks";
import { diffPixels, inkBox, renderPage } from "./helpers/render";
import { blocksOf, editFor, exportWith, extractText, findBlock, FIXTURE } from "./helpers/text-edit";

const pad = (r: Rect, p = 0.8): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });

describe("detección de bloques (líneas)", async () => {
  const blocks = await blocksOf(FIXTURE);
  it("une los fragmentos de una misma línea en un solo bloque", () => {
    expect(findBlock(blocks, "DESCRIPCION").text).toBe("DESCRIPCION DEL RECORRIDO: Ruta NEIVA - MELGAR Y VICEVERSA.");
    expect(findBlock(blocks, "DESCRIPCION").parts).toHaveLength(3);
  });
  it("no une celdas separadas por un borde", () => {
    expect(findBlock(blocks, "CONDUCTOR 1").text).toBe("CONDUCTOR 1");
    expect(findBlock(blocks, "PEDRO").text).toBe("PEDRO PÉREZ MUÑOZ");
  });
  it("mantiene en un bloque la línea con negrita, regular y cursiva", () => {
    const b = findBlock(blocks, "Nota:");
    expect(b.text).toBe("Nota: El presente extracto no lleva sellos según el Decreto 2150.");
    expect(b.fontNames.length).toBe(3);
  });
  it("detecta alineación izquierda, centrada y derecha dentro de la celda", () => {
    expect(findBlock(blocks, "CONDUCTOR").align).toBe("left");
    expect(findBlock(blocks, "ABC 123").align).toBe("center");
    expect(findBlock(blocks, "1234567890").align).toBe("right");
  });
  it("detecta el texto dentro de un Form XObject", () => {
    expect(findBlock(blocks, "Texto dentro de un XObject").clean).toBe(true);
  });
});

describe("eliminación limpia: líneas y fondo intactos", async () => {
  const blocks = await blocksOf(FIXTURE);
  const before = await renderPage(FIXTURE, 1, 200);

  it("tras editar texto dentro de celdas, todo lo que está fuera del texto queda idéntico (incluidos los bordes)", async () => {
    const targets = [
      ["PEDRO PÉREZ MUÑOZ", "ANA GÓMEZ"],
      ["Responsable del contrato", "Responsable: LUISA NÚÑEZ"],
      ["Servicio especial", "Servicio especial de carga"],
      ["Vigencia sujeta", "Vigencia ampliada"],
    ] as const;
    const edits = targets.map(([from, to]) => editFor(findBlock(blocks, from), to));
    const { bytes, reports } = await exportWith(edits);
    expect(reports.every((r) => r.removal === "clean")).toBe(true);
    const after = await renderPage(bytes, 1, 200);
    // Zonas que pueden cambiar: el texto original y el nuevo (con margen de antialias)
    const zones = edits.flatMap((e, i) => {
      const b = findBlock(blocks, targets[i][0]);
      const l = reports[i].layout!;
      return [pad(b.box), pad({ x: b.box.x, y: b.box.y, w: Math.max(b.box.w, l.width + (l.start - (b.box.x))), h: b.box.h })];
    });
    const outside = diffPixels(before, after, { exclude: zones });
    expect(outside.diff).toBe(0);
    // Bordes de la celda ajustada (el texto casi los toca): sin un solo píxel distinto.
    const tightCell = [
      { x: 50, y: 841.89 - 676 - 0.6, w: 495, h: 1.2 },
      { x: 50, y: 841.89 - 664 - 0.6, w: 495, h: 1.2 },
    ];
    expect(diffPixels(before, after, { only: tightCell }).diff).toBe(0);
  }, 60000);

  it("el resto de páginas queda intacto", async () => {
    const { bytes } = await exportWith([editFor(findBlock(blocks, "PEDRO"), "ANA GÓMEZ")]);
    const a = await renderPage(FIXTURE, 2, 120);
    const b = await renderPage(bytes, 2, 120);
    expect(diffPixels(a, b).diff).toBe(0);
  }, 60000);
});

describe("prueba de oro: reescribir el mismo contenido es visualmente idéntico", async () => {
  const blocks = await blocksOf(FIXTURE);
  const before = await renderPage(FIXTURE, 1, 200);
  const cases = [
    "PEDRO PÉREZ MUÑOZ", // Tz 85 + Tc negativo
    "DESCRIPCION DEL RECORRIDO", // fragmentada, Tz 110
    "Nota:", // negrita + regular + cursiva
    "Válido desde", // TJ con kerning
    "1234567890", // derecha
    "ABC 123", // centrado
    "Servicio especial", // blanco sobre color
    "Vigencia sujeta", // sobre degradado
    "Oficina", // Helvetica estándar
    "Representante legal", // Times
    "Código interno", // Courier
    "Documento generado con Calibri", // Carlito incrustada
    "Firma del representante", // fuente propia (Lora)
    "Texto dentro de un XObject", // Form XObject
    "MATRIZ CONDENSADA", // Tf 1 + condensación en la matriz de texto (patrón de FUEC reales)
    "RECORTE", // dentro de un recorte (clip) que corta los acentos
    "TEXTO BAJO UN SELLO", // tapado en parte por algo dibujado después
  ];
  it.each(cases)("«%s»", async (start) => {
    const b = findBlock(blocks, start);
    const { bytes, reports } = await exportWith([editFor(b, b.text)]);
    expect(reports[0].removal).toBe("clean");
    expect(reports[0].placement).toBe("inplace");
    expect(reports[0].layout!.substituted).toEqual([]);
    const after = await renderPage(bytes, 1, 200);
    const inText = diffPixels(before, after, { only: [pad(b.box, 1.5)] });
    // Margen para el antialias en el borde de un recorte (clip): pdf.js puede suavizar distinto una fila
    // de píxeles al volver a pintar dentro del mismo recorte. En el resto de casos la diferencia es 0.
    expect(inText.ratio).toBeLessThan(0.005);
    expect(diffPixels(before, after, { exclude: [pad(b.box, 1.5)] }).diff).toBe(0);
  }, 60000);
});

describe("métricas y ancho", async () => {
  const blocks = await blocksOf(FIXTURE);

  it("texto distinto del mismo largo ocupa el mismo ancho (±1 %)", async () => {
    for (const [from, to] of [
      ["1234567890", "9876543210"],
      ["26/05/2028", "31/12/2029"],
      ["PEDRO PÉREZ MUÑOZ", "PEDRA PÉREZ MUÑOS"],
    ] as const) {
      const { reports } = await exportWith([editFor(findBlock(blocks, from), to)]);
      const l = reports[0].layout!;
      expect(Math.abs(l.width - l.originalWidth) / l.originalWidth).toBeLessThan(0.01);
    }
  }, 60000);

  it("cambiar un dígito no mueve nada más", async () => {
    const b = findBlock(blocks, "26/05/2028");
    const before = await renderPage(FIXTURE, 1, 200);
    const { bytes } = await exportWith([editFor(b, "26/05/2029")]);
    const after = await renderPage(bytes, 1, 200);
    // Solo cambia el último dígito: la parte "26/05/202" queda idéntica.
    const lastDigit = b.glyphBoxes[b.glyphBoxes.length - 1];
    const rest = { x: b.box.x - 1, y: b.box.y - 1, w: lastDigit.x - b.box.x + 0.6, h: b.box.h + 2 };
    expect(diffPixels(before, after, { only: [rest] }).diff).toBe(0);
  }, 60000);

  it("«Ajustar al ancho original» encaja un texto más largo en el mismo ancho sin salirse de la celda", async () => {
    const { fitScale, buildLine } = await import("@/lib/editor/pdf/layout");
    const { analyzePage } = await import("@/lib/editor/pdf/interpret");
    const { SubFontRegistry } = await import("@/lib/editor/pdf/subfonts");
    const { PDFDocument } = await import("pdf-lib");
    const { loaders } = await import("./helpers/text-edit");
    const b = findBlock(blocks, "26/05/2028");
    const doc = await PDFDocument.load(FIXTURE);
    const line = buildLine(analyzePage(doc.getPage(0)).records, b.parts)!;
    const reg = new SubFontRegistry((family, bold, italic) => loaders.loadFontBytes({ family, bold, italic }, undefined));
    await reg.ensure([{ family: "liberation-sans", bold: false, italic: false }]);
    const text = "26 de mayo de 2028";
    const k = fitScale(line, text, { scaleX: 1, sizeScale: 1, align: b.align }, reg.resolver);
    expect(k).toBeLessThan(1);
    const { reports, bytes } = await exportWith([editFor(b, text, "p0", { scaleX: k })]);
    const l = reports[0].layout!;
    expect(Math.abs(l.width - l.originalWidth) / l.originalWidth).toBeLessThan(0.005);
    const after = await renderPage(bytes, 1, 200);
    const ink = inkBox(after, { x: b.room.x0, y: b.box.y, w: b.room.x1 - b.room.x0, h: b.box.h })!;
    expect(ink.x).toBeGreaterThanOrEqual(b.room.x0 - 0.5);
    expect(ink.x + ink.w).toBeLessThanOrEqual(b.room.x1 + 0.5);
  }, 60000);
});

describe("fuentes, letras sustituidas y codificación", async () => {
  const blocks = await blocksOf(FIXTURE);

  it("tildes y ñ correctas en el PDF exportado y al copiar el texto", async () => {
    const { bytes, reports } = await exportWith([editFor(findBlock(blocks, "PEDRO"), "JOSÉ ÑUÑEZ ÁVILA")]);
    expect(await extractText(bytes)).toContain("JOSÉ ÑUÑEZ ÁVILA");
    expect(reports[0].removal).toBe("clean");
  }, 60000);

  it("informa exactamente qué letras no existen en el subconjunto y se escribieron con sustituta", async () => {
    const b = findBlock(blocks, "Bus");
    const { bytes, reports } = await exportWith([editFor(b, "Buseta Ωmega 漢")]);
    const l = reports[0].layout!;
    const { PDFDocument } = await import("pdf-lib");
    const { analyzePage } = await import("@/lib/editor/pdf/interpret");
    const rec = analyzePage((await PDFDocument.load(FIXTURE)).getPage(0)).records.find((r) => r.id === b.parts[0].rec)!;
    const inSubset = (ch: string) => rec.font.fromUnicode.has(ch) && rec.font.hasGlyph(rec.font.fromUnicode.get(ch)!);
    // «Ω» no está en el subconjunto incrustado pero sí en Liberation Sans: se sustituye y se informa.
    expect(l.substituted).toContain("Ω");
    // Cada letra informada como sustituida es exactamente una que falta en el subconjunto…
    for (const ch of l.substituted) expect(inSubset(ch)).toBe(false);
    // …y todas las que faltan (salvo espacios) aparecen en la lista.
    for (const ch of new Set([..."Buseta Ωmega"].filter((c) => c.trim() && !inSubset(c)))) expect(l.substituted).toContain(ch);
    // «漢» no existe en ninguna fuente disponible: se informa como imposible de dibujar.
    expect(l.missing).toEqual(["漢"]);
    expect(await extractText(bytes)).toContain("Buseta Ωmega");
  }, 60000);

  it("cuando todas las letras existen en el subconjunto, se usa la fuente original incrustada (sin sustituir)", async () => {
    const { reports } = await exportWith([editFor(findBlock(blocks, "PEDRO"), "PEDRO PÉREZ")]);
    expect(reports[0].layout!.substituted).toEqual([]);
    expect(reports[0].layout!.usedFonts.some((f) => f.startsWith("LiberationSans"))).toBe(true);
  }, 60000);

  it("edición dentro de un XObject: limpia y sin afectar al resto", async () => {
    const b = findBlock(blocks, "Texto dentro de un XObject");
    const before = await renderPage(FIXTURE, 1, 200);
    const { bytes, reports } = await exportWith([editFor(b, "Texto editado en XObject")]);
    expect(reports[0].removal).toBe("clean");
    const after = await renderPage(bytes, 1, 200);
    expect(diffPixels(before, after, { exclude: [pad({ ...b.box, w: b.box.w + 40 }, 1.5)] }).diff).toBe(0);
    expect(await extractText(bytes)).toContain("Texto editado en XObject");
  }, 60000);
});

describe("recorte y orden de dibujo del original", async () => {
  const blocks = await blocksOf(FIXTURE);
  const before = await renderPage(FIXTURE, 1, 200);

  it("el texto nuevo queda dentro del mismo recorte (no aparecen los acentos recortados)", async () => {
    const b = findBlock(blocks, "RECORTE");
    const { bytes, reports } = await exportWith([editFor(b, "RECORTE ÁÉÍÓÚ ÑANDÚ CAMBIADO")]);
    expect(reports[0].placement).toBe("inplace");
    const after = await renderPage(bytes, 1, 200);
    // Franja por encima del recorte (borde en y = 494.2 PDF; se deja 0.6 pt por el antialias del borde): sin tinta nueva.
    const aboveClip = { x: 299, y: 841.89 - 498.5, w: 260, h: 3.7 };
    expect(diffPixels(before, after, { only: [aboveClip] }).diff).toBe(0);
  }, 60000);

  it("el texto nuevo queda debajo de lo que se dibujó después (el sello no cambia)", async () => {
    const b = findBlock(blocks, "TEXTO BAJO UN SELLO");
    const { bytes } = await exportWith([editFor(b, "OTRO TEXTO BAJO UN SELLO POSTERIOR")]);
    const after = await renderPage(bytes, 1, 200);
    const seal = { x: 381, y: 841.89 - 479, w: 38, h: 12 };
    expect(diffPixels(before, after, { only: [seal] }).diff).toBe(0);
  }, 60000);

  it("Tf 1 con matriz condensada: mismo ancho para un texto del mismo largo", async () => {
    const b = findBlock(blocks, "MATRIZ CONDENSADA");
    const { reports } = await exportWith([editFor(b, "MATRIZ CONDENSADA: TF 9")]);
    const l = reports[0].layout!;
    expect(Math.abs(l.width - l.originalWidth) / l.originalWidth).toBeLessThan(0.01);
  }, 60000);
});

describe("vista previa = exportación", async () => {
  const blocks = await blocksOf(FIXTURE);
  it("la vista previa de una página se renderiza igual que la página exportada", async () => {
    const edits = [editFor(findBlock(blocks, "PEDRO"), "ANA GÓMEZ"), editFor(findBlock(blocks, "Nota:"), "Nota: Documento sin sellos según el Decreto 2150.")];
    const full = await exportWith(edits);
    const preview = await exportWith(edits, { pageIds: ["p0"] });
    const a = await renderPage(full.bytes, 1, 150);
    const b = await renderPage(preview.bytes, 1, 150);
    expect(diffPixels(a, b).diff).toBe(0);
  }, 60000);
});

describe("ediciones repetidas y varias páginas", async () => {
  const blocks = await blocksOf(FIXTURE);
  const blocks2 = await blocksOf(FIXTURE, 1);
  it("varias líneas en la misma página y otra página en el mismo documento", async () => {
    const edits = [
      editFor(findBlock(blocks, "PEDRO"), "ANA GÓMEZ"),
      editFor(findBlock(blocks, "CONDUCTOR 1"), "CONDUCTOR 2"),
      editFor(findBlock(blocks, "26/05/2028"), "01/01/2030"),
      editFor(findBlock(blocks2, "Total a pagar"), "Total a pagar: $ 2.500.000", "p1"),
    ];
    const { bytes, reports } = await exportWith(edits);
    expect(reports.every((r) => r.removal === "clean")).toBe(true);
    const t1 = await extractText(bytes, 1);
    expect(t1).toContain("ANA GÓMEZ");
    expect(t1).toContain("CONDUCTOR 2");
    expect(t1).toContain("01/01/2030");
    expect(t1).not.toContain("PEDRO");
    expect(await extractText(bytes, 2)).toContain("Total a pagar: $ 2.500.000");
  }, 60000);

  it("respaldo de tapado forzado: se informa como «cover»", async () => {
    const b = findBlock(blocks, "PEDRO");
    const { reports } = await exportWith([editFor(b, "ANA", "p0", { cover: { color: "#ffffff", rects: [b.box], forced: true } })]);
    expect(reports[0].removal).toBe("cover");
  }, 60000);
});

void union;
