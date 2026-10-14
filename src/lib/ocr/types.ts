export type OCRMode = "mode_a" | "mode_b" | "mode_c";

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x0, y0, x1, y1] in PDF pt
  font_size: number;
  is_low_confidence: boolean;
}

export interface OCRLine {
  text: string;
  bbox: [number, number, number, number];
  words: OCRWord[];
  line_height: number;
}

export interface OCRBlock {
  id: string;
  type: "paragraph" | "heading" | "table" | "header" | "footer" | "list";
  bbox: [number, number, number, number];
  text: string;
  lines: OCRLine[];
  confidence: number;
}

export interface OCRPageResult {
  page_number: number;
  width: number;
  height: number;
  is_scanned: boolean;
  average_confidence: number;
  low_confidence_count: number;
  blocks: OCRBlock[];
  text_content: string;
}

export interface OCRDocumentResult {
  total_pages: number;
  language: string;
  mode: OCRMode;
  pages: OCRPageResult[];
  processing_time_ms: number;
}

export interface PreprocessOptions {
  deskew: boolean;
  enhance_contrast: boolean;
  phone_photo_mode: boolean;
  denoise?: boolean;
  binarize?: boolean;
}

export interface AnalysisSummary {
  total_pages: number;
  scanned_pages: number;
  native_pages: number;
  recommended_mode: string;
  pages: {
    page_number: number;
    is_scanned: boolean;
    width: number;
    height: number;
    rotation: number;
    font_count: number;
    images_count: number;
    text_char_count: number;
  }[];
}

export interface AIAnalysisResult {
  summary: string;
  key_points: string[];
  entities: {
    dates?: string[];
    amounts?: string[];
    emails?: string[];
    phones?: string[];
    tax_ids?: string[];
  };
  ocr_corrections: {
    original: string;
    suggestion: string;
    reason: string;
    context: string;
  }[];
  tables: string[][][];
}
