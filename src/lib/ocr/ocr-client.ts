import type { AnalysisSummary, OCRDocumentResult, OCRMode, PreprocessOptions, AIAnalysisResult } from "./types";

function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as any], { type });
}

export class OCRClient {
  private static baseUrl = "/api/py";

  /**
   * Analiza si el PDF contiene páginas escaneadas o texto nativo.
   */
  static async analyzeDocument(pdfBytes: Uint8Array, fileName = "documento.pdf"): Promise<AnalysisSummary> {
    const formData = new FormData();
    const blob = toBlob(pdfBytes, "application/pdf");
    formData.append("file", blob, fileName);

    const res = await fetch(`${this.baseUrl}/ocr/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Error al analizar documento (${res.status}): ${await res.text()}`);
    }

    return await res.json();
  }

  /**
   * Ejecuta el OCR en el documento según el modo seleccionado (Modo A, B o C).
   * Retorna el nuevo PDF en Uint8Array y los metadatos estructurados.
   */
  static async processOcr(
    pdfBytes: Uint8Array,
    options: {
      mode: OCRMode;
      language?: string;
      deskew?: boolean;
      enhanceContrast?: boolean;
      phonePhotoMode?: boolean;
      pages?: number[];
      fileName?: string;
    }
  ): Promise<{ pdfBytes: Uint8Array; metadata?: OCRDocumentResult }> {
    const formData = new FormData();
    const blob = toBlob(pdfBytes, "application/pdf");
    formData.append("file", blob, options.fileName || "documento.pdf");
    formData.append("mode", options.mode);
    formData.append("language", options.language || "spa");
    formData.append("deskew", String(options.deskew !== false));
    formData.append("enhance_contrast", String(options.enhanceContrast !== false));
    formData.append("phone_photo_mode", String(Boolean(options.phonePhotoMode)));

    if (options.pages && options.pages.length > 0) {
      formData.append("pages_json", JSON.stringify(options.pages));
    }

    const res = await fetch(`${this.baseUrl}/ocr/process`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error en el motor OCR (${res.status}): ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const resultBytes = new Uint8Array(arrayBuffer);

    // Opcionalmente obtener metadata detallada
    let metadata: OCRDocumentResult | undefined;
    try {
      const metaRes = await fetch(`${this.baseUrl}/ocr/metadata`, {
        method: "POST",
        body: formData,
      });
      if (metaRes.ok) {
        metadata = await metaRes.json();
      }
    } catch {
      // Ignorar fallo secundario de metadata
    }

    return { pdfBytes: resultBytes, metadata };
  }

  /**
   * Preprocesa una imagen (deskew, sombras, contraste).
   */
  static async preprocessImage(
    imageBytes: Uint8Array,
    options: PreprocessOptions
  ): Promise<{ imageBytes: Uint8Array; info: any }> {
    const formData = new FormData();
    const blob = toBlob(imageBytes, "image/png");
    formData.append("file", blob, "page.png");
    formData.append("deskew", String(options.deskew));
    formData.append("enhance_contrast", String(options.enhance_contrast));
    formData.append("phone_photo_mode", String(options.phone_photo_mode));
    formData.append("denoise", String(Boolean(options.denoise)));
    formData.append("binarize", String(Boolean(options.binarize)));

    const res = await fetch(`${this.baseUrl}/ocr/preprocess-image`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Error en preprocesamiento (${res.status}): ${await res.text()}`);
    }

    const infoHeader = res.headers.get("X-Preprocess-Info");
    const info = infoHeader ? JSON.parse(infoHeader) : {};
    const arrayBuffer = await res.arrayBuffer();
    return { imageBytes: new Uint8Array(arrayBuffer), info };
  }

  /**
   * Convierte el PDF a DOCX, XLSX, TXT o imágenes.
   */
  static async convertDocument(
    pdfBytes: Uint8Array,
    targetFormat: "docx" | "xlsx" | "txt" | "png" | "jpg",
    dpi = 200,
    fileName = "documento.pdf"
  ): Promise<{ data: Blob; downloadName: string }> {
    const formData = new FormData();
    const blob = toBlob(pdfBytes, "application/pdf");
    formData.append("file", blob, fileName);
    formData.append("target_format", targetFormat);
    formData.append("dpi", String(dpi));

    const res = await fetch(`${this.baseUrl}/convert/export`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Error en conversión (${res.status}): ${await res.text()}`);
    }

    const resBlob = await res.blob();
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return { data: resBlob, downloadName: `${baseName}.${targetFormat}` };
  }

  /**
   * Aplica operaciones de organización: rotación, marcas de agua, encabezados/numeración.
   */
  static async organizeOperation(
    pdfBytes: Uint8Array,
    operation: "rotate" | "watermark" | "header_footer",
    params: Record<string, any>,
    fileName = "documento.pdf"
  ): Promise<Uint8Array> {
    const formData = new FormData();
    const blob = toBlob(pdfBytes, "application/pdf");
    formData.append("file", blob, fileName);

    let endpoint = "";
    if (operation === "rotate") {
      endpoint = `${this.baseUrl}/organize/rotate`;
      formData.append("pages_json", JSON.stringify(params.pages || []));
      formData.append("angle", String(params.angle || 90));
    } else if (operation === "watermark") {
      endpoint = `${this.baseUrl}/organize/watermark`;
      formData.append("text", params.text || "CONFIDENCIAL");
      formData.append("opacity", String(params.opacity ?? 0.25));
      formData.append("font_size", String(params.fontSize ?? 48));
    } else if (operation === "header_footer") {
      endpoint = `${this.baseUrl}/organize/header-footer`;
      if (params.headerText) formData.append("header_text", params.headerText);
      if (params.footerText) formData.append("footer_text", params.footerText);
      formData.append("number_pages", String(params.numberPages !== false));
    }

    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Error en organización (${res.status}): ${await res.text()}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Analiza el documento con el Asistente de IA local y privado.
   */
  static async analyzeWithAI(pdfBytes: Uint8Array, fileName = "documento.pdf"): Promise<AIAnalysisResult> {
    const formData = new FormData();
    const blob = toBlob(pdfBytes, "application/pdf");
    formData.append("file", blob, fileName);

    const res = await fetch(`${this.baseUrl}/ai/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Error en el asistente de IA (${res.status}): ${await res.text()}`);
    }

    return await res.json();
  }
}
