// Genera tests/fixtures/fuec-sintetico.pdf: PDF SINTÉTICO (sin datos reales) que imita un formato FUEC.
// Uso: npx tsx tests/fixtures/make-fuec.mts
import fontkit from "@pdf-lib/fontkit";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import {
  beginText,
  clip,
  endPath,
  endText,
  rectangle,
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setCharacterSqueeze,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  setWordSpacing,
  showText,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";

const F = (n: string) => readFileSync(new URL(`../../public/fonts/${n}`, import.meta.url));

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
doc.setTitle("FUEC sintético de prueba");
doc.setProducer("DocuPilot Studio (fixture de pruebas)");

const arial = await doc.embedFont(F("liberation-sans-regular.ttf"), { subset: true });
const arialBold = await doc.embedFont(F("liberation-sans-bold.ttf"), { subset: true });
const arialItalic = await doc.embedFont(F("liberation-sans-italic.ttf"), { subset: true });
const carlito = await doc.embedFont(F("carlito-regular.ttf"), { subset: true });
const lora = await doc.embedFont(F("lora-regular.ttf"), { subset: true });
const helv = await doc.embedFont(StandardFonts.Helvetica);
const times = await doc.embedFont(StandardFonts.TimesRoman);
const courier = await doc.embedFont(StandardFonts.Courier);

type Style = { font: PDFFont; size: number; tz?: number; tc?: number; tw?: number; color?: [number, number, number] };

function fontKey(page: PDFPage, font: PDFFont) {
  return page.node.newFontDictionary(font.name, font.ref);
}

/** Escribe texto con operadores de bajo nivel (Tz, Tc, Tw). `x` según alineación respecto a `align`. */
function text(page: PDFPage, s: string, x: number, y: number, st: Style, align: "left" | "right" | "center" = "left") {
  const tz = st.tz ?? 100;
  const tc = st.tc ?? 0;
  const tw = st.tw ?? 0;
  const glyphs = [...s].length;
  const spaces = [...s].filter((c) => c === " ").length;
  const width = (st.font.widthOfTextAtSize(s, st.size) + tc * glyphs + tw * spaces) * (tz / 100);
  const x0 = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  const key = fontKey(page, st.font);
  const [r, g, b] = st.color ?? [0, 0, 0];
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(key, st.size),
    setCharacterSqueeze(tz),
    setCharacterSpacing(tc),
    setWordSpacing(tw),
    setFillingRgbColor(r, g, b),
    setTextMatrix(1, 0, 0, 1, x0, y),
    showText(st.font.encodeText(s)),
    endText(),
    popGraphicsState(),
  );
  return width;
}

/** Texto con TJ y ajustes de kerning entre fragmentos. */
function textTJ(page: PDFPage, parts: (string | number)[], x: number, y: number, st: Style) {
  const key = fontKey(page, st.font);
  const arr = doc.context.obj(parts.map((p) => (typeof p === "number" ? p : st.font.encodeText(p))));
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(key, st.size),
    setTextMatrix(1, 0, 0, 1, x, y),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [arr]),
    endText(),
    popGraphicsState(),
  );
}

function cell(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
}

// ── Imágenes ───────────────────────────────────────────────
function gradientPng(w: number, h: number, from: string, to: string) {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}
const header = await doc.embedPng(gradientPng(800, 90, "#1e3a8a", "#38bdf8"));
const gradient = await doc.embedPng(gradientPng(600, 40, "#fde68a", "#f97316"));
const qr = await doc.embedPng(await QRCode.toBuffer("https://ejemplo.invalid/s/AbCdEfGh1234", { width: 600, margin: 4 }));

// ── Página 1 ───────────────────────────────────────────────
const p = doc.addPage([595.28, 841.89]);
p.drawImage(header, { x: 40, y: 770, width: 515, height: 55 });
text(p, "TRANSPORTES EJEMPLO S.A.S.", 297.6, 792, { font: arialBold, size: 15, color: [1, 1, 1] }, "center");
text(p, "FORMATO ÚNICO DE EXTRACTO DEL CONTRATO", 297.6, 750, { font: arialBold, size: 11 }, "center");

// Tabla
const L = 50, R = 545;
cell(p, L, 700, 124, 30); cell(p, L + 124, 700, 124, 30); cell(p, L + 248, 700, 124, 30); cell(p, L + 372, 700, 123, 30);
text(p, "PLACA", L + 62, 718, { font: arialBold, size: 7.5, tz: 85, tc: -0.2 }, "center");
text(p, "ABC 123", L + 62, 706, { font: arial, size: 8, tz: 85, tc: -0.2 }, "center");
text(p, "MODELO", L + 186, 718, { font: arialBold, size: 7.5, tz: 85, tc: -0.2 }, "center");
text(p, "2015", L + 186, 706, { font: arial, size: 8, tz: 85, tc: -0.2 }, "center");
text(p, "MARCA", L + 310, 718, { font: arialBold, size: 7.5, tz: 85, tc: -0.2 }, "center");
text(p, "MARCAEJEMPLO", L + 310, 706, { font: arial, size: 8, tz: 85, tc: -0.2 }, "center");
text(p, "CLASE", L + 433, 718, { font: arialBold, size: 7.5, tz: 85, tc: -0.2 }, "center");
text(p, "Bus", L + 433, 706, { font: arial, size: 8, tz: 85, tc: -0.2 }, "center");

// Fila de conductores: texto condensado Tz 85 + Tc negativo, números alineados a la derecha
cell(p, L, 680, 110, 20); cell(p, L + 110, 680, 200, 20); cell(p, L + 310, 680, 95, 20); cell(p, L + 405, 680, 90, 20);
text(p, "CONDUCTOR 1", L + 4, 686, { font: arial, size: 8, tz: 85, tc: -0.25 });
text(p, "PEDRO PÉREZ MUÑOZ", L + 114, 686, { font: arial, size: 8, tz: 85, tc: -0.25 });
text(p, "1234567890", L + 401, 686, { font: arial, size: 8, tz: 85, tc: -0.25 }, "right");
text(p, "26/05/2028", L + 491, 686, { font: arial, size: 8, tz: 85, tc: -0.25 }, "right");

// Celda ajustada: el texto casi toca los bordes (si se "tapa", se cortan las líneas)
cell(p, L, 664, 495, 12);
text(p, "Responsable del contrato: JOSÉ ÁLVAREZ NIÑO", L + 2, 667, { font: arial, size: 8, tz: 85, tc: -0.25 });

// Línea fragmentada en tres operaciones, ensanchada (Tz 110)
cell(p, L, 640, 495, 20);
let x = L + 4;
x += text(p, "DESCRIPCION DEL RECORRIDO: Ruta ", x, 647, { font: arial, size: 8, tz: 110 });
x += text(p, "NEIVA - MELGAR Y ", x, 647, { font: arial, size: 8, tz: 110 });
text(p, "VICEVERSA.", x, 647, { font: arial, size: 8, tz: 110 });

// Negrita + regular + cursiva en la misma línea
cell(p, L, 616, 495, 20);
x = L + 4;
x += text(p, "Nota: ", x, 623, { font: arialBold, size: 8 });
x += text(p, "El presente extracto no lleva sellos ", x, 623, { font: arial, size: 8 });
text(p, "según el Decreto 2150.", x, 623, { font: arialItalic, size: 8 });

// TJ con kerning y fechas
cell(p, L, 592, 495, 20);
textTJ(p, ["Válido desde: ", 20, "11/10/2026", -50, " hasta: ", 10, "30/10/2026"], L + 4, 599, { font: arial, size: 8 });

// Texto sobre fondo de color y sobre degradado
p.drawRectangle({ x: L, y: 560, width: 495, height: 22, color: rgb(0.12, 0.23, 0.54) });
text(p, "Servicio especial de pasajeros", L + 8, 567, { font: arial, size: 9, color: [1, 1, 1] });
p.drawImage(gradient, { x: L, y: 530, width: 495, height: 24 });
text(p, "Vigencia sujeta a verificación", L + 8, 538, { font: arialBold, size: 9 });

// Fuentes estándar no incrustadas, Carlito (≈ Calibri) y una fuente propia (Lora)
text(p, "Oficina - Calle 11 A Bis No. 72 B 27", L, 505, { font: helv, size: 9 });
text(p, "Representante legal: Ana María Ríos", L, 490, { font: times, size: 10 });
text(p, "Código interno 2202-B", L, 475, { font: courier, size: 9 });
text(p, "Documento generado con Calibri (Carlito)", L, 460, { font: carlito, size: 10 });
text(p, "Firma del representante legal", L, 445, { font: lora, size: 10 });

// Texto dentro de un Form XObject (embedPage → drawPage)
const src = await PDFDocument.create();
src.registerFontkit(fontkit);
const sp = src.addPage([300, 30]);
const srcFont = await src.embedFont(StandardFonts.Helvetica);
sp.drawText("Texto dentro de un XObject", { x: 4, y: 10, size: 10, font: srcFont });
const [embedded] = await doc.embedPdf(await src.save());
p.drawPage(embedded, { x: L, y: 405 });

// Patrones vistos en FUEC reales:
// (1) Tf 1 y la escala/condensación en la matriz de texto
{
  const key = fontKey(p, arial);
  p.pushOperators(pushGraphicsState(), beginText(), setFontAndSize(key, 1), setTextMatrix(6.8, 0, 0, 8, 300, 505), showText(arial.encodeText("MATRIZ CONDENSADA: TF 1")), endText(), popGraphicsState());
}
// (2) Texto dentro de un recorte que corta los acentos (el texto nuevo debe quedar igual de recortado)
{
  const key = fontKey(p, arialBold);
  p.pushOperators(
    pushGraphicsState(),
    rectangle(300, 486, 200, 8.2),
    clip(),
    endPath(),
    beginText(),
    setFontAndSize(key, 10),
    setTextMatrix(1, 0, 0, 1, 300, 488),
    showText(arialBold.encodeText("RECORTE ÁÉÍÓÚ ÑANDÚ")),
    endText(),
    popGraphicsState(),
  );
}
// (3) Texto tapado en parte por un rectángulo dibujado DESPUÉS (orden de dibujo)
text(p, "TEXTO BAJO UN SELLO POSTERIOR", 300, 470, { font: arial, size: 9 });
p.drawRectangle({ x: 380, y: 466, width: 40, height: 14, color: rgb(0.2, 0.6, 0.3), opacity: 1 });

// QR y pie
p.drawImage(qr, { x: L, y: 300, width: 90, height: 90 });
p.drawLine({ start: { x: L + 100, y: 345 }, end: { x: R, y: 345 }, thickness: 0.6 });
text(p, "Documento generado por un sistema de ejemplo", 297.6, 280, { font: arial, size: 8 }, "center");

// ── Página 2 ───────────────────────────────────────────────
const p2 = doc.addPage([595.28, 841.89]);
cell(p2, L, 760, 495, 24);
text(p2, "Página 2 — Anexo de condiciones", L + 6, 768, { font: arialBold, size: 10 });
text(p2, "Total a pagar: $ 1.250.000", R - 6, 740, { font: arial, size: 10 }, "right");

// ── Imágenes y QR para "borrar" (página 2) ─────────────────
// (a) QR dibujado con vectores (un único trayecto con un rectángulo por módulo) y una línea de tabla que lo atraviesa
{
  const qrv = QRCode.create("https://ejemplo.invalid/s/VectorQR0001", { errorCorrectionLevel: "M" });
  const n = qrv.modules.size;
  const mod = 3;
  const x0 = 60, y0 = 560;
  const ops: string[] = ["q", "0 0 0 rg"];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qrv.modules.get(r, c)) ops.push(`${x0 + (c + 4) * mod} ${y0 + (n + 3 - r) * mod} ${mod} ${mod} re`);
  ops.push("f", "Q");
  const ref = doc.context.register(doc.context.flateStream(ops.join("\n")));
  p2.node.addContentStream(ref);
  // Línea de tabla que cruza la zona del QR vectorial
  p2.drawLine({ start: { x: L, y: 600 }, end: { x: R, y: 600 }, thickness: 0.8, color: rgb(0, 0, 0) });
  text(p2, "QR VECTORIAL", 60, 545, { font: arial, size: 8 });
}
// (b) PNG con transparencia (SMask) sobre una banda de color
{
  const c = createCanvas(240, 80);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
  ctx.beginPath();
  ctx.arc(40, 40, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("LOGO", 90, 52);
  const logo = await doc.embedPng(c.toBuffer("image/png"));
  p2.drawRectangle({ x: 300, y: 640, width: 245, height: 60, color: rgb(0.86, 0.93, 1) });
  p2.drawImage(logo, { x: 310, y: 645, width: 150, height: 50 });
}
// (c) Imagen dentro de un Form XObject COMPARTIDO por las dos páginas
{
  const sello = await PDFDocument.create();
  const sp2 = sello.addPage([120, 60]);
  const img = await sello.embedPng(gradientPng(120, 60, "#16a34a", "#065f46"));
  sp2.drawImage(img, { x: 0, y: 0, width: 120, height: 60 });
  const [embedded2] = await doc.embedPdf(await sello.save());
  p2.drawPage(embedded2, { x: 300, y: 540 });
  p.drawPage(embedded2, { x: 440, y: 300, xScale: 0.8, yScale: 0.8 });
}
// (d) Imagen en línea (BI … ID … EI): 4×4 píxeles en escala de grises
{
  const raw = "00 55 AA FF 55 AA FF 00 AA FF 00 55 FF 00 55 AA".split(" ").map((h) => String.fromCharCode(parseInt(h, 16))).join("");
  const content = `q 60 0 0 60 60 440 cm BI /W 4 /H 4 /CS /G /BPC 8 ID ${raw} EI Q`;
  const ref = doc.context.register(doc.context.stream(Uint8Array.from(content, (ch) => ch.charCodeAt(0))));
  p2.node.addContentStream(ref);
  text(p2, "IMAGEN EN LINEA", 60, 430, { font: arial, size: 8 });
}

const out = await doc.save({ useObjectStreams: false });
writeFileSync(new URL("./fuec-sintetico.pdf", import.meta.url), out);
// Nombre del recurso de cada fuente (útil para depurar)
console.log("fuec-sintetico.pdf", out.length, "bytes");
