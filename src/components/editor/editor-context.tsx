"use client";

import { createContext, useContext, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CatalogFont } from "@/lib/editor/fonts";
import type { CustomFontInfo } from "@/lib/editor/font-runtime";
import type { useEditorStore, Tool } from "@/lib/editor/store";
import type { ContentReport } from "@/lib/editor/pdf/text-edits";
import type { TextEngine } from "./text-engine";
import type { EditObject } from "@/lib/editor/types";

export type CanvasEntry = { canvas: HTMLCanvasElement; scale: number };

export type EditorCtx = {
  documentId: string;
  pdf: PDFDocumentProxy | null;
  store: ReturnType<typeof useEditorStore>;
  tool: Tool;
  setTool: (t: Tool) => void;
  zoom: number;
  setZoom: (z: number | ((z: number) => number)) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Selección múltiple (el último es el principal, el que muestra el inspector). */
  selectedIds: string[];
  setSelection: (ids: string[]) => void;
  /** Guías de alineación visibles durante un arrastre. */
  guides: { pageId: string; xs: number[]; ys: number[] } | null;
  setGuides: (g: { pageId: string; xs: number[]; ys: number[] } | null) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  currentPageId: string;
  setCurrentPageId: (id: string) => void;
  customFonts: CustomFontInfo[];
  customCatalog: CatalogFont[];
  reloadFonts: () => Promise<void>;
  /** Canvas renderizado de cada página (para muestrear colores). */
  canvases: RefObject<Map<string, CanvasEntry>>;
  /** Motor de edición de texto (análisis del PDF original y vista previa idéntica a la exportación). */
  engine: TextEngine | null;
  /** Último informe de vista previa de cada edición de texto (y el texto al que corresponde). */
  textReports: Record<string, { report: ContentReport; text: string }>;
  setTextReports: (reports: ContentReport[], texts: Record<string, string>) => void;
  /** Trazo de dibujo en curso: los trazos sucesivos se agregan al mismo objeto. */
  activeInkId: RefObject<string | null>;
  setActiveInk: (id: string | null) => void;
  addAndSelect: (obj: EditObject) => void;
  scrollToPage: (pageId: string) => void;
};

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor fuera del editor");
  return ctx;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
