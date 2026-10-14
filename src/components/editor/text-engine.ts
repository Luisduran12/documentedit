"use client";

import type { PDFDocument } from "pdf-lib";
import { applyEdits, type ApplyLoaders } from "@/lib/editor/apply";
import { bundledFileName } from "@/lib/editor/fonts";
import { detectBlocks, nativeToFrame, type TextBlock } from "@/lib/editor/pdf/blocks";
import { loadPdfForEditing } from "@/lib/editor/pdf/decrypt";
import { analyzePage, type PageAnalysis } from "@/lib/editor/pdf/interpret";
import { buildLine, fitScale, type Line } from "@/lib/editor/pdf/layout";
import { SubFontRegistry } from "@/lib/editor/pdf/subfonts";
import type { ContentReport } from "@/lib/editor/pdf/text-edits";
import { substituteFamily } from "@/lib/editor/pdf/layout";
import type { EditDoc, PageState, TextEditObject } from "@/lib/editor/types";

/**
 * Motor de edición de texto en el navegador: análisis del PDF original (pdf-lib), detección de líneas y
 * vista previa generada con EXACTAMENTE la misma función que la exportación (WYSIWYG).
 */
export class TextEngine {
  readonly doc: Promise<PDFDocument>;
  private analyses = new Map<number, PageAnalysis>();
  readonly registry: SubFontRegistry;

  constructor(
    private base: Uint8Array,
    private loaders: ApplyLoaders,
  ) {
    this.doc = loadPdfForEditing(base);
    this.registry = new SubFontRegistry(async (family, bold, italic) => {
      const res = await fetch(`/fonts/${bundledFileName(family, bold, italic)}`);
      return new Uint8Array(await res.arrayBuffer());
    });
  }

  async analysis(src: number) {
    let a = this.analyses.get(src);
    if (!a) {
      const doc = await this.doc;
      a = analyzePage(doc.getPage(src));
      this.analyses.set(src, a);
    }
    return a;
  }

  async blocks(page: PageState): Promise<TextBlock[]> {
    if (page.src === null) return [];
    return detectBlocks(await this.analysis(page.src), page.view, page.baseRotation);
  }

  /** Imágenes originales de la página con su caja en el marco de pantalla. */
  async images(page: PageState) {
    if (page.src === null) return [];
    const a = await this.analysis(page.src);
    return a.images.map((im) => {
      const p0 = nativeToFrame(im.bbox[0], im.bbox[1], page.view, page.baseRotation);
      const p1 = nativeToFrame(im.bbox[2], im.bbox[3], page.view, page.baseRotation);
      return { id: im.id, kind: im.kind, box: { x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]) } };
    });
  }

  async line(page: PageState, obj: TextEditObject): Promise<Line | null> {
    if (page.src === null) return null;
    return buildLine((await this.analysis(page.src)).records, obj.parts);
  }

  /** Escala horizontal que hace que el texto ocupe el ancho del original. */
  async fit(page: PageState, obj: TextEditObject) {
    const line = await this.line(page, obj);
    if (!line) return 1;
    await this.registry.ensure(line.chars.filter((c) => c.rec).map((c) => ({ family: obj.fontOverride ?? substituteFamily(c.rec!.font), bold: c.rec!.font.bold, italic: c.rec!.font.italic })));
    return fitScale(line, obj.text, { scaleX: 1, sizeScale: obj.sizeScale, color: obj.color, fontOverride: obj.fontOverride, align: obj.align }, this.registry.resolver);
  }

  /** PDF de una sola página con las ediciones de texto aplicadas (vista previa = exportación). */
  async preview(doc: EditDoc, pageId: string) {
    const reports: ContentReport[] = [];
    const bytes = await applyEdits(this.base, doc, this.loaders, {
      pageIds: [pageId],
      types: ["textEdit", "zoneErase", "imageEdit"],
      srcDoc: await this.doc,
      onTextReport: (r) => reports.push(r),
    });
    return { bytes, reports };
  }

  /** Exportación completa reutilizando el documento ya cargado (y descifrado). */
  async export(doc: EditDoc) {
    return applyEdits(this.base, doc, this.loaders, { srcDoc: await this.doc });
  }
}
