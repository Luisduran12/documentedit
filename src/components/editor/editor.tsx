"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eraser,
  Highlighter,
  ImagePlus,
  Layers,
  Loader2,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  QrCode,
  Redo2,
  Signature as SignatureIcon,
  SlidersHorizontal,
  TextCursorInput,
  Type,
  Undo2,
  X,
  History,
  PaintBucket,
  ScanQrCode,
  Save,
  Check,
  CloudOff,
  Sparkles,
  Columns,
  Bot,
  FileSpreadsheet,
  FileCode,
  RotateCw,
  FileText,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { ShareCreator } from "@/components/shares/share-creator";
import type { ShareItem } from "@/components/shares/types";
import { api } from "@/lib/api-client";
import { applyEdits } from "@/lib/editor/apply";
import { customCatalog as toCatalog, fetchFontBytes, type CustomFontInfo } from "@/lib/editor/font-runtime";
import { frameSize, normalizeRotation } from "@/lib/editor/geometry";
import { addObject, deleteSelection, duplicateSelection, moveSelection, removeObject, uid, updateObject, useEditorStore, type Tool } from "@/lib/editor/store";
import { effectiveDpi, isSupportedImage, LOW_DPI, prepareImage } from "./image-input";
import { buildZip, pdfFileName, pngExportNames, renderPagesToPng } from "@/lib/export-files";
import { ShareQrPicker } from "./share-qr-picker";
import { clientToFrame } from "./page-view";
import { pinchResize, pinchState } from "./gestures";
import type { ContentReport } from "@/lib/editor/pdf/text-edits";
import { TextEngine } from "./text-engine";
import type { EditDoc, EditObject, PageState } from "@/lib/editor/types";
import { openPdfTask } from "@/lib/pdf/pdfjs";
import { downloadBlob, qrPngBytes } from "@/lib/qr";
import { uploadToR2 } from "@/lib/upload-client";
import { clampZoom, EditorContext, type CanvasEntry, type EditorCtx } from "./editor-context";
import { Inspector } from "./inspector";
import { PageView } from "./page-view";
import { SignaturePad, type Signature } from "./signature-pad";
import { Thumbnails } from "./thumbnails";
import { useAutosave } from "./use-autosave";
import { VersionsModal } from "./versions-modal";
import { formatDateTime } from "@/lib/dates";
import type { DocumentItem } from "@/components/documents/types";
import { OCRDialog } from "./ocr/ocr-dialog";
import { OCRReviewPanel } from "./ocr/ocr-review-panel";
import { DiffViewerDialog } from "./ocr/diff-viewer-dialog";
import { ConvertDialog } from "./convert/convert-dialog";
import { OrganizeDialog } from "./organize/organize-dialog";
import { AIAssistantDrawer } from "./ai/ai-assistant-drawer";
import { ContextToolbar } from "./context-toolbar";
import { OCRClient } from "@/lib/ocr/ocr-client";
import type { OCRDocumentResult, OCRMode, AIAnalysisResult, OCRWord } from "@/lib/ocr/types";

function makeLoaders(customFonts: ReturnType<typeof toCatalog>) {
  return {
    loadFontBytes: fetchFontBytes,
    loadAsset: async (key: string) => new Uint8Array(await (await fetch(`/api/assets?key=${encodeURIComponent(key)}`)).arrayBuffer()),
    qrPng: (url: string) => qrPngBytes(url, 1024),
    customFonts,
  };
}

type DocMeta = { id: string; name: string; version: number; updatedAt: string; pageCount: number | null; hasDraft: boolean; draftUpdatedAt: string | null };

const EMPTY: EditDoc = { pages: [], objects: [] };

async function fetchWithProgress(url: string, onProgress: (pct: number | null) => void) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("No se pudo descargar el PDF");
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total ? Math.round((received / total) * 100) : null);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function Editor({ documentId }: { documentId: string }) {
  const toast = useToast();
  const store = useEditorStore(EMPTY);
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const baseBytes = useRef<Uint8Array | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const [tool, setToolState] = useState<Tool>("select");
  const [zoom, setZoomState] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [guides, setGuides] = useState<{ pageId: string; xs: number[]; ys: number[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPageId, setCurrentPageId] = useState("");
  const [customFonts, setCustomFonts] = useState<CustomFontInfo[]>([]);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [replacePending, setReplacePending] = useState<{ file: File | Blob; target: EditObject } | null>(null);
  const [qrPickerOpen, setQrPickerOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [pngOpen, setPngOpen] = useState(false);
  const [pngDpi, setPngDpi] = useState<150 | 200 | 300>(200);
  const [pngPages, setPngPages] = useState<"current" | "all">("current");
  const [saving, setSaving] = useState(false);
  const [latest, setLatest] = useState<{ isLatest: boolean; latestId: string } | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ token: string; pageCount: number; latest: DocumentItem } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrMetadata, setOcrMetadata] = useState<OCRDocumentResult | undefined>(undefined);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [originalSnapshotUrl, setOriginalSnapshotUrl] = useState<string | undefined>(undefined);
  const [editedSnapshotUrl, setEditedSnapshotUrl] = useState<string | undefined>(undefined);
  const router = useRouter();

  const canvases = useRef(new Map<string, CanvasEntry>());
  const [engine, setEngine] = useState<TextEngine | null>(null);
  const [textReports, setTextReportsState] = useState<Record<string, { report: ContentReport; text: string }>>({});
  const setTextReports = useCallback((reports: ContentReport[], texts: Record<string, string>) => {
    setTextReportsState((cur) => {
      const next = { ...cur };
      for (const r of reports) next[r.id] = { report: r, text: texts[r.id] ?? "" };
      return next;
    });
  }, []);
  const activeInkId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const customCatalog = useMemo(() => toCatalog(customFonts), [customFonts]);

  const reloadFonts = useCallback(async () => {
    const d = await api<{ fonts: CustomFontInfo[] }>("/api/fonts").catch(() => ({ fonts: [] }));
    setCustomFonts(d.fonts);
  }, []);

  // ── Carga del documento ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    let task: Awaited<ReturnType<typeof openPdfTask>> | null = null;
    (async () => {
      try {
        const [{ document, url }] = await Promise.all([
          api<{ document: DocMeta; url: string; isLatest: boolean; latestId: string }>(`/api/documents/${documentId}`).then((r) => {
            if (alive) setLatest({ isLatest: r.isLatest, latestId: r.latestId });
            return r;
          }),
          api<{ fonts: CustomFontInfo[] }>("/api/fonts").then((d) => alive && setCustomFonts(d.fonts)).catch(() => {}),
        ]);
        if (!alive) return;
        setMeta(document);
        const bytes = await fetchWithProgress(url, (p) => alive && setLoadPct(p));
        baseBytes.current = bytes;
        // Motor de texto: carga (y descifra si hace falta) el PDF con pdf-lib en segundo plano.
        if (alive) setEngine(new TextEngine(bytes, makeLoaders([])));
        task = await openPdfTask(bytes.slice()); // pdf.js transfiere el buffer al worker: se le pasa una copia
        const doc = await task.promise;
        if (!alive) return;
        const pages: PageState[] = [];
        for (let i = 0; i < doc.numPages; i++) {
          const p = await doc.getPage(i + 1);
          pages.push({ id: `p${i}`, src: i, baseRotation: normalizeRotation(p.rotate), rotation: 0, view: p.view as PageState["view"] });
        }
        // Retomar el borrador (si existe) guardado desde este u otro dispositivo.
        let initial: EditDoc = { pages, objects: [] };
        if (document.hasDraft) {
          const { draft } = await api<{ draft: (EditDoc & { savedAt: string }) | null }>(`/api/documents/${documentId}/draft`).catch(() => ({ draft: null }));
          if (draft && draft.pages.every((p) => p.src === null || p.src < doc.numPages)) {
            initial = { pages: draft.pages, objects: draft.objects };
            if (alive) setRestoredAt(draft.savedAt);
          }
        }
        if (!alive) return;
        store.reset(initial);
        setCurrentPageId(pages[0]?.id ?? "");
        setPdf(doc);
        setLoadPct(null);

        // Ajustar al ancho disponible.
        const avail = (scrollRef.current?.clientWidth ?? 800) - 48;
        // Ajustar a la página más ancha (documentos con páginas verticales y horizontales).
        const widest = Math.max(...pages.map((p) => frameSize(p.view, p.baseRotation).w));
        if (pages.length) setZoomState(clampZoom(Math.min(1.25, avail / widest)));
        scrollRef.current?.scrollTo({ top: 0 });

        // ¿PDF escaneado? Si las primeras páginas no tienen texto, avisar.
        let hasText = false;
        for (let i = 1; i <= Math.min(3, doc.numPages) && !hasText; i++) {
          const tc = await (await doc.getPage(i)).getTextContent();
          hasText = tc.items.some((it) => "str" in it && it.str.trim().length > 0);
        }
        if (alive) setScanned(!hasText);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "No se pudo abrir el documento");
      }
    })();
    return () => {
      alive = false;
      task?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    activeInkId.current = null;
    setEditingId(null);
    if (t !== "select") setSelectedId(null);
  }, [setSelectedId]);

  const setZoom = useCallback((z: number | ((z: number) => number)) => setZoomState((cur) => clampZoom(typeof z === "function" ? z(cur) : z)), []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id === null) setSheetOpen(false);
  }, [setSelectedId]);

  const addAndSelect = useCallback(
    (obj: EditObject) => {
      store.change(addObject(store.doc, obj));
      setSelectedId(obj.id);
    },
    [store, setSelectedId],
  );

  const scrollToPage = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    scrollRef.current?.querySelector(`[data-page-id="${pageId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const currentPage = store.doc.pages.find((p) => p.id === currentPageId) ?? store.doc.pages[0];

  /** Coloca un objeto centrado en un punto de una página. */
  const placeAt = useCallback(
    (make: (box: { x: number; y: number; w: number; h: number; pageId: string }) => EditObject, w: number, aspect: number, at: { pageId: string; x: number; y: number }) => {
      const page = store.doc.pages.find((p) => p.id === at.pageId);
      if (!page) return;
      const f = frameSize(page.view, page.baseRotation);
      const width = Math.min(w, f.w * 0.8);
      const h = width / aspect;
      addAndSelect(make({ x: at.x - width / 2, y: at.y - h / 2, w: width, h, pageId: at.pageId }));
      setToolState("select");
    },
    [store.doc.pages, addAndSelect],
  );

  /** Coloca un objeto centrado en la página actual con el ancho indicado (pt). */
  const placeCentered = useCallback(
    (make: (box: { x: number; y: number; w: number; h: number; pageId: string }) => EditObject, w: number, aspect: number) => {
      if (!currentPage) return;
      const f = frameSize(currentPage.view, currentPage.baseRotation);
      const width = Math.min(w, f.w * 0.8);
      const h = width / aspect;
      addAndSelect(make({ x: (f.w - width) / 2, y: (f.h - h) / 2, w: width, h, pageId: currentPage.id }));
      setToolState("select");
    },
    [currentPage, addAndSelect],
  );

  // ── Acciones ───────────────────────────────────────────────────────────────
  /** Sube una imagen preparada (PNG/JPG sin recomprimir) como recurso del documento. */
  async function uploadImage(input: File | Blob) {
    const prep = await prepareImage(input);
    const token = await uploadToR2(prep.file, "asset", prep.file.name);
    const { key, mime } = await api<{ key: string; mime: "image/png" | "image/jpeg" }>("/api/assets", { method: "POST", json: { token } });
    return { key, mime, px: prep.px, isQr: prep.isQr };
  }

  function warnLowRes(px: { w: number }, widthPt: number) {
    const dpi = effectiveDpi(px.w, widthPt);
    if (dpi && dpi < LOW_DPI) toast.error(`La imagen tiene baja resolución para su tamaño (${Math.round(dpi)} ppp). Puede verse borrosa al imprimir.`);
  }

  /** Añade imágenes (pegadas, soltadas o elegidas). Si hay una imagen/QR seleccionada, ofrece reemplazarla. */
  async function addImages(files: (File | Blob)[], at?: { pageId: string; x: number; y: number }) {
    const imgs = files.filter(isSupportedImage);
    if (imgs.length === 0) return;
    const sel = store.doc.objects.find((o) => o.id === selectedId);
    if (imgs.length === 1 && !at && sel && (sel.type === "image" || sel.type === "qr" || sel.type === "imageEdit")) {
      setReplacePending({ file: imgs[0], target: sel });
      return;
    }
    for (const f of imgs) {
      try {
        const up = await uploadImage(f);
        const aspect = up.px.w / up.px.h;
        const width = up.isQr ? 110 : 200;
        const make = (b: { x: number; y: number; w: number; h: number; pageId: string }) =>
          ({ type: "image", id: uid(), ...b, assetKey: up.key, mime: up.mime, opacity: 1, px: up.px, pixelated: up.isQr || undefined }) as EditObject;
        if (at) placeAt(make, width, aspect, at);
        else placeCentered(make, width, aspect);
        warnLowRes(up.px, width);
        if (up.isQr) toast.ok("QR detectado: se insertó en modo nítido para que siga siendo escaneable.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo añadir la imagen");
      }
    }
  }

  /** Reemplazar en el mismo lugar: hereda posición, tamaño y rotación. */
  async function replaceWith(file: File | Blob, target: EditObject, fit: "contain" | "cover") {
    setReplacePending(null);
    try {
      const up = await uploadImage(file);
      const box = target.type === "imageEdit" ? { x: target.x, y: target.y, w: target.w, h: target.h } : { x: target.x, y: target.y, w: target.w, h: target.h };
      const img = { type: "image", id: uid(), pageId: target.pageId, ...box, rotation: target.rotation, assetKey: up.key, mime: up.mime, opacity: 1, px: up.px, fit, pixelated: up.isQr || undefined } as EditObject;
      let doc = store.doc;
      if (target.type === "imageEdit") doc = updateObject(doc, target.id, { removed: true });
      else doc = removeObject(doc, target.id);
      store.change(addObject(doc, img));
      setSelectedId(img.id);
      warnLowRes(up.px, box.w);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reemplazar la imagen");
    }
  }

  function insertSignature(sig: Signature) {
    setSignOpen(false);
    placeCentered((b) => ({ type: "ink", id: uid(), ...b, strokes: sig.strokes, color: "#1d3b8f", width: 1.5 }), 160, sig.aspect);
  }

  function insertQr(share: ShareItem) {
    setQrOpen(false);
    placeCentered((b) => ({ type: "qr", id: uid(), ...b, url: share.url, shareId: share.id }), 110, 1);
    toast.ok("QR insertado. Muévelo o cambia su tamaño donde lo necesites.");
  }

  const autosave = useAutosave(documentId, store.doc, store.dirtyVersion, Boolean(latest?.isLatest && pdf));

  function buildPdf() {
    // Reutiliza el documento ya cargado (y descifrado) por el motor de texto.
    if (engine) return engine.export(store.doc);
    return applyEdits(baseBytes.current!, store.doc, makeLoaders(customCatalog));
  }

  /** Guardar = nueva versión en R2. Si otro dispositivo guardó antes, se avisa en lugar de pisar. */
  async function saveVersion(retry?: { token: string; pageCount: number }) {
    if (!baseBytes.current || !meta) return;
    setSaving(true);
    try {
      let token = retry?.token;
      const pageCount = retry?.pageCount ?? store.doc.pages.length;
      if (!token) {
        const bytes = await buildPdf();
        token = await uploadToR2(new Blob([bytes.slice().buffer], { type: "application/pdf" }), "pdf", meta.name);
      }
      const res = await fetch(`/api/documents/${documentId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, expectedUpdatedAt: meta.updatedAt, pageCount, mode: retry ? "onLatest" : "normal" }),
      });
      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        setConflict({ token, pageCount, latest: data.latest });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      autosave.markClean();
      setConflict(null);
      toast.ok(`Versión v${data.document.version} guardada`);
      router.replace(`/editor/${data.document.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function discardDraft() {
    if (!pdf) return;
    await api(`/api/documents/${documentId}/draft`, { method: "DELETE" }).catch(() => {});
    const pages: PageState[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const p = await pdf.getPage(i + 1);
      pages.push({ id: `p${i}`, src: i, baseRotation: normalizeRotation(p.rotate), rotation: 0, view: p.view as PageState["view"] });
    }
    store.reset({ pages, objects: [] });
    autosave.markClean();
    setRestoredAt(null);
    toast.ok("Borrador descartado");
  }

  /** Exportar PDF: mismo nombre que el archivo subido; sin cifrado ni restricciones. No guarda nada en el servidor. */
  async function exportPdf() {
    if (!baseBytes.current || !meta) return;
    setExportMenu(false);
    setExporting(true);
    try {
      const bytes = await buildPdf();
      downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), pdfFileName(meta.name));
    } catch (e) {
      toast.error(e instanceof Error ? `No se pudo exportar: ${e.message}` : "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  /** Exportar PNG: render del PDF final (con todas las ediciones) a la resolución elegida. */
  async function exportPng() {
    if (!baseBytes.current || !meta) return;
    setPngOpen(false);
    setExporting(true);
    let task: Awaited<ReturnType<typeof openPdfTask>> | null = null;
    try {
      const bytes = await buildPdf();
      task = await openPdfTask(bytes);
      const doc = await task.promise;
      const currentIndex = Math.max(0, store.doc.pages.findIndex((p) => p.id === currentPageId));
      const pages = pngPages === "current" ? [currentIndex + 1] : Array.from({ length: doc.numPages }, (_, i) => i + 1);
      const names = pngExportNames(meta.name, pages);
      const pngs = await renderPagesToPng(
        (n) => doc.getPage(n),
        pages,
        pngDpi,
        (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
        (c) => new Promise<Uint8Array>((res, rej) => c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("No se pudo crear el PNG"))), "image/png")),
      );
      if (names.single) downloadBlob(new Blob([pngs[0].slice().buffer], { type: "image/png" }), names.single);
      else downloadBlob(new Blob([buildZip(pngs.map((data, i) => ({ name: names.entries[i], data }))).slice().buffer], { type: "application/zip" }), names.zip!);
    } catch (e) {
      toast.error(e instanceof Error ? `No se pudo exportar: ${e.message}` : "No se pudo exportar");
    } finally {
      task?.destroy();
      setExporting(false);
    }
  }

  async function handleRunOCR(config: {
    mode: OCRMode;
    language: string;
    deskew: boolean;
    enhanceContrast: boolean;
    phonePhotoMode: boolean;
    scope: "all" | "current";
  }) {
    if (!baseBytes.current || !meta) return;
    const currentIndex = Math.max(0, store.doc.pages.findIndex((p) => p.id === currentPageId));
    const pages = config.scope === "current" ? [currentIndex + 1] : undefined;

    // Snapshot para comparación diff
    const canvas = canvases.current.get(currentPageId);
    if (canvas?.canvas) {
      setOriginalSnapshotUrl(canvas.canvas.toDataURL("image/png"));
    }

    try {
      const { pdfBytes, metadata } = await OCRClient.processOcr(baseBytes.current, {
        mode: config.mode,
        language: config.language,
        deskew: config.deskew,
        enhanceContrast: config.enhanceContrast,
        phonePhotoMode: config.phonePhotoMode,
        pages,
        fileName: meta.name,
      });

      baseBytes.current = pdfBytes;
      setOcrMetadata(metadata);
      if (metadata) setReviewOpen(true);

      const task = await openPdfTask(pdfBytes.slice());
      const newDoc = await task.promise;
      setPdf(newDoc);
      setEngine(new TextEngine(pdfBytes, makeLoaders(customCatalog)));
      setScanned(false);
      toast.ok(`OCR completado (${config.mode.toUpperCase()})`);
    } catch (e: any) {
      toast.error(e?.message || "Error procesando OCR");
      throw e;
    }
  }

  async function handleExportFormat(format: "docx" | "xlsx" | "txt" | "png" | "jpg", dpi: number) {
    if (!baseBytes.current || !meta) return;
    if (format === "png") {
      setPngOpen(true);
      return;
    }
    setExporting(true);
    try {
      const { data, downloadName } = await OCRClient.convertDocument(
        baseBytes.current,
        format,
        dpi,
        meta.name
      );
      downloadBlob(data, downloadName);
      toast.ok(`Documento convertido a ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Error al exportar documento");
    } finally {
      setExporting(false);
    }
  }

  async function handleApplyOrganize(operation: "rotate" | "watermark" | "header_footer", params: any) {
    if (!baseBytes.current || !meta) return;
    const currentIndex = Math.max(0, store.doc.pages.findIndex((p) => p.id === currentPageId));
    if (operation === "rotate") {
      params.pages = [currentIndex + 1];
    }
    try {
      const newBytes = await OCRClient.organizeOperation(
        baseBytes.current,
        operation,
        params,
        meta.name
      );
      baseBytes.current = newBytes;
      const task = await openPdfTask(newBytes.slice());
      const newDoc = await task.promise;
      setPdf(newDoc);
      setEngine(new TextEngine(newBytes, makeLoaders(customCatalog)));
      toast.ok("Operación aplicada al documento");
    } catch (e: any) {
      toast.error(e?.message || "Error en operación de página");
      throw e;
    }
  }

  async function handleOpenAI() {
    setAiOpen(true);
    if (!aiResult && baseBytes.current && meta) {
      setAiLoading(true);
      try {
        const res = await OCRClient.analyzeWithAI(baseBytes.current, meta.name);
        setAiResult(res);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo conectar al Asistente de IA");
      } finally {
        setAiLoading(false);
      }
    }
  }

  // Cerrar el menú de exportación al hacer clic fuera
  useEffect(() => {
    if (!exportMenu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[role="menu"], [aria-label="Exportar"]')) setExportMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [exportMenu]);

  // ── Pegar imágenes (Cmd/Ctrl+V) ────────────────────────────────────────────
  const addImagesRef = useRef(addImages);
  useEffect(() => {
    addImagesRef.current = addImages;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, [contenteditable=true], dialog")) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isSupportedImage);
      if (!files.length) return;
      e.preventDefault();
      addImagesRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function onCanvasDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files).filter(isSupportedImage);
    if (!files.length) return;
    e.preventDefault();
    const pageEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-page-id]");
    const page = pageEl && store.doc.pages.find((p) => p.id === pageEl.dataset.pageId);
    if (pageEl && page) {
      const [x, y] = clientToFrame(e.clientX, e.clientY, pageEl, page, zoom);
      addImages(files, { pageId: page.id, x, y });
    } else addImages(files);
  }

  // ── Atajos de teclado ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setZoom((z) => z * 1.2);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        setZoom((z) => z / 1.2);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        store.change(deleteSelection(store.doc, selectedIds));
        setSelectedId(null);
      } else if (mod && e.key.toLowerCase() === "d" && selectedIds.length) {
        e.preventDefault();
        const { doc, ids } = duplicateSelection(store.doc, selectedIds);
        store.change(doc);
        setSelectedIds(ids);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setToolState("select");
      } else if (selectedIds.length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.change(moveSelection(store.doc, selectedIds, dx, dy));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, selectedIds, setZoom, setSelectedId]);

  const storeRef = useRef(store);
  const selectedIdsRef = useRef(selectedIds);
  const ctxRef = useRef<EditorCtx | null>(null);
  useEffect(() => {
    storeRef.current = store;
    selectedIdsRef.current = selectedIds;
  });

  // ── Zoom con pinza (táctil) y Ctrl+rueda ──────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pts = new Map<number, [number, number]>();
    let start: { dist: number; zoom: number } | null = null;
    let zoomNow = zoom;
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    };
    // Pellizco: si los dos dedos están sobre el objeto seleccionado, se redimensiona; si no, zoom.
    let resizeId: string | null = null;
    let resizeBase: EditDoc | null = null;
    const objAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-obj-id]")?.dataset.objId ?? null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        start = { dist: dist(), zoom: zoomNow };
        const [a, b] = [...pts.values()];
        const ia = objAt(a[0], a[1]);
        if (ia && ia === objAt(b[0], b[1]) && selectedIdsRef.current.includes(ia)) {
          resizeId = ia;
          resizeBase = storeRef.current.doc;
          pinchState.active = true;
          storeRef.current.gestureStart();
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size !== 2 || !start) return;
      if (resizeId && resizeBase) pinchResize(ctxRef.current!, resizeId, dist() / start.dist, resizeBase);
      else setZoom(start.zoom * (dist() / start.dist));
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) {
        start = null;
        if (resizeId) {
          storeRef.current.gestureEnd();
          pinchState.active = false;
        }
        resizeId = null;
        resizeBase = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => z * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    zoomNow = zoom;
    el.addEventListener("pointerdown", down, { capture: true });
    el.addEventListener("pointermove", move, { capture: true });
    el.addEventListener("pointerup", up, { capture: true });
    el.addEventListener("pointercancel", up, { capture: true });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down, { capture: true });
      el.removeEventListener("pointermove", move, { capture: true });
      el.removeEventListener("pointerup", up, { capture: true });
      el.removeEventListener("pointercancel", up, { capture: true });
      el.removeEventListener("wheel", wheel);
    };
  }, [zoom, setZoom]);

  // Solo desarrollo: expone el JSON de ediciones para pruebas automatizadas.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __dpDoc: EditDoc }).__dpDoc = store.doc;
  }, [store.doc]);

  const ctx: EditorCtx = {
    documentId,
    pdf,
    store,
    tool,
    setTool,
    zoom,
    setZoom,
    selectedId,
    select,
    selectedIds,
    setSelection: setSelectedIds,
    guides,
    setGuides,
    editingId,
    setEditingId,
    currentPageId,
    setCurrentPageId,
    customFonts,
    customCatalog,
    reloadFonts,
    canvases,
    engine,
    textReports,
    setTextReports,
    activeInkId,
    setActiveInk: (id) => {
      activeInkId.current = id;
    },
    addAndSelect,
    scrollToPage,
  };

  useEffect(() => {
    ctxRef.current = ctx;
  });

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-danger-fg" />
        <p className="text-sm text-fg-2">{loadError}</p>
        <Link href="/documentos" className="btn btn-secondary h-11">
          <ArrowLeft className="h-4 w-4" /> Volver a Documentos
        </Link>
      </div>
    );
  }

  const tools: { id: Tool | "image" | "signature"; label: string; icon: ReactNode }[] = [
    { id: "select", label: "Seleccionar", icon: <MousePointer2 className="h-5 w-5" /> },
    { id: "editText", label: "Editar texto", icon: <TextCursorInput className="h-5 w-5" /> },
    { id: "addText", label: "Añadir texto", icon: <Type className="h-5 w-5" /> },
    { id: "image", label: "Imagen", icon: <ImagePlus className="h-5 w-5" /> },
    { id: "highlight", label: "Resaltar", icon: <Highlighter className="h-5 w-5" /> },
    { id: "draw", label: "Dibujar", icon: <PenLine className="h-5 w-5" /> },
    { id: "signature", label: "Firma", icon: <SignatureIcon className="h-5 w-5" /> },
    { id: "cover", label: "Tapar con color", icon: <PaintBucket className="h-5 w-5" /> },
    { id: "erase", label: "Borrar zona (imágenes, QR y trazos)", icon: <Eraser className="h-5 w-5" /> },
  ];

  const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-subtle hover:text-fg disabled:opacity-35";

  return (
    <EditorContext value={ctx}>
      {/* Hoja estática en public/: el empaquetador de CSS descarta estos @font-face. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fonts/fonts.css" precedence="default" />
      <div className="relative flex h-full flex-col">
        {/* Barra superior */}
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 md:px-3">
          <Link href="/documentos" className={iconBtn} aria-label="Volver a Documentos" title="Volver a Documentos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button type="button" className={`${iconBtn} lg:hidden`} aria-label="Páginas" title="Páginas" onClick={() => setPagesOpen(true)}>
            <Layers className="h-5 w-5" />
          </button>
          <div className="mr-auto min-w-0 px-1">
            <p className="truncate text-sm font-medium">{meta?.name ?? "Cargando…"}</p>
            {meta && (
              <p className="flex items-center gap-1.5 font-mono text-mono-timer text-fg-muted" aria-live="polite">
                v{meta.version}
                {autosave.status.state === "saving" && <span>· guardando borrador…</span>}
                {autosave.status.state === "saved" && (
                  <span className="flex items-center gap-1 text-success-fg">
                    <Check className="h-3 w-3" /> borrador guardado
                  </span>
                )}
                {autosave.status.state === "error" && (
                  <span className="flex items-center gap-1 text-danger-fg">
                    <CloudOff className="h-3 w-3" /> sin conexión
                  </span>
                )}
              </p>
            )}
          </div>
          <button type="button" className={iconBtn} aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)" disabled={!store.canUndo} onClick={store.undo}>
            <Undo2 className="h-5 w-5" />
          </button>
          <button type="button" className={iconBtn} aria-label="Rehacer (Ctrl+Y)" title="Rehacer (Ctrl+Y)" disabled={!store.canRedo} onClick={store.redo}>
            <Redo2 className="h-5 w-5" />
          </button>
          <div className="hidden items-center sm:flex">
            <button type="button" className={iconBtn} aria-label="Alejar" onClick={() => setZoom((z) => z / 1.2)}>
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" className="h-11 w-14 rounded-lg font-mono text-mono-data text-fg-2 hover:bg-subtle" title="Restablecer zoom (Ctrl+0)" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className={iconBtn} aria-label="Acercar" onClick={() => setZoom((z) => z * 1.2)}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className={`btn h-10 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 transition-all ${
              scanned
                ? "bg-amber-600 text-white hover:bg-amber-500 shadow-sm animate-pulse"
                : "btn-secondary text-sky-600 dark:text-sky-400"
            }`}
            onClick={() => setOcrOpen(true)}
            disabled={!pdf}
            title="Reconocimiento Óptico de Caracteres (OCR)"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden md:inline">OCR</span>
            {scanned && <span className="w-2 h-2 rounded-full bg-white ml-0.5" />}
          </button>

          <button
            type="button"
            className={`${iconBtn} hidden sm:flex`}
            aria-label="Comparar antes / después"
            title="Comparar antes / después"
            disabled={!pdf}
            onClick={() => {
              const canvas = canvases.current.get(currentPageId);
              if (canvas?.canvas) {
                setEditedSnapshotUrl(canvas.canvas.toDataURL("image/png"));
              }
              setDiffOpen(true);
            }}
          >
            <Columns className="h-5 w-5" />
          </button>

          <button
            type="button"
            className={`${iconBtn} hidden sm:flex`}
            aria-label="Organizar páginas, marcas de agua y numeración"
            title="Organizar páginas, marcas de agua y numeración"
            disabled={!pdf}
            onClick={() => setOrganizeOpen(true)}
          >
            <RotateCw className="h-5 w-5" />
          </button>

          <button
            type="button"
            className="btn btn-secondary h-10 px-2.5 sm:px-3 text-xs font-medium text-indigo-600 dark:text-indigo-400"
            aria-label="Asistente Documental IA"
            title="Resumen, entidades y sugerencias IA"
            disabled={!pdf}
            onClick={handleOpenAI}
          >
            <Bot className="h-4 w-4" />
            <span className="hidden lg:inline">IA</span>
          </button>

          <button type="button" className={`${iconBtn} hidden xl:flex`} aria-label="Insertar un QR de la app" title="Insertar un QR ya creado en Imágenes y QR" onClick={() => setQrPickerOpen(true)} disabled={!pdf}>
            <ScanQrCode className="h-5 w-5" />
          </button>
          <button type="button" className="btn btn-secondary h-10 px-2.5 sm:px-3.5 hidden 2xl:flex" onClick={() => setQrOpen(true)} disabled={!pdf}>
            <QrCode className="h-4 w-4 text-accent-fg" />
            <span>QR</span>
          </button>
          <button type="button" className={`${iconBtn} hidden sm:flex`} aria-label="Historial de versiones" title="Historial de versiones" disabled={!latest} onClick={() => setHistoryOpen(true)}>
            <History className="h-5 w-5" />
          </button>
          <button type="button" className="btn btn-secondary h-10 px-2.5 sm:px-3.5" onClick={() => saveVersion()} disabled={!pdf || saving} aria-label="Guardar versión" title="Guardar como nueva versión">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden md:inline">Guardar</span>
          </button>
          <div className="relative">
            <button
              type="button"
              className="btn btn-primary h-10 px-2.5 sm:px-3.5"
              onClick={() => setExportMenu((v) => !v)}
              disabled={!pdf || exporting}
              aria-label="Exportar"
              aria-haspopup="menu"
              aria-expanded={exportMenu}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden md:inline">Exportar</span>
            </button>
            {exportMenu && (
              <div role="menu" className="panel absolute right-0 z-40 mt-1 w-64 rounded-2xl p-1.5 shadow-2xl">
                <button role="menuitem" type="button" className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle" onClick={exportPdf}>
                  <span className="font-medium">PDF</span>
                  <span className="text-xs text-fg-muted">Mismo nombre, sin cifrado ni restricciones</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    setExportMenu(false);
                    handleExportFormat("docx", 200);
                  }}
                >
                  <span className="font-medium flex items-center gap-1.5 text-blue-500">
                    <FileText className="w-3.5 h-3.5" /> Microsoft Word (.docx)
                  </span>
                  <span className="text-xs text-fg-muted">Conserva títulos, párrafos y tablas</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    setExportMenu(false);
                    handleExportFormat("xlsx", 200);
                  }}
                >
                  <span className="font-medium flex items-center gap-1.5 text-emerald-500">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Microsoft Excel (.xlsx)
                  </span>
                  <span className="text-xs text-fg-muted">Extrae tablas estructuradas</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    setExportMenu(false);
                    handleExportFormat("txt", 200);
                  }}
                >
                  <span className="font-medium flex items-center gap-1.5 text-neutral-400">
                    <FileCode className="w-3.5 h-3.5" /> Texto Plano (.txt)
                  </span>
                  <span className="text-xs text-fg-muted">Texto plano extraído</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    setExportMenu(false);
                    setPngOpen(true);
                  }}
                >
                  <span className="font-medium">PNG…</span>
                  <span className="text-xs text-fg-muted">Imagen por página (ZIP si son varias)</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm hover:bg-subtle border-t border-white/[0.06] mt-1 pt-1.5"
                  onClick={() => {
                    setExportMenu(false);
                    setConvertOpen(true);
                  }}
                >
                  <span className="font-medium text-sky-500">Más opciones de conversión…</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {latest && !latest.isLatest && (
          <div role="status" className="flex flex-wrap items-center gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent-fg">
            <History className="h-4 w-4 shrink-0" />
            <p className="flex-1">Estás viendo una versión anterior. Los cambios no se autoguardan; si guardas, se creará una versión nueva sobre la vigente.</p>
            <Link href={`/editor/${latest.latestId}`} className="font-semibold underline">Abrir la versión vigente</Link>
          </div>
        )}

        {restoredAt && (
          <div role="status" className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary-fg">
            <Check className="h-4 w-4 shrink-0" />
            <p className="flex-1">Se retomó tu borrador ({formatDateTime(restoredAt)}). Pulsa «Guardar» para crear una versión con estos cambios.</p>
            <button type="button" className="font-semibold underline" onClick={discardDraft}>Descartar borrador</button>
            <button type="button" aria-label="Ocultar aviso" onClick={() => setRestoredAt(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {scanned && (
          <div role="status" className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>
                <strong>Este PDF no tiene texto seleccionable</strong> (parece escaneado). Puedes aplicar el motor OCR para convertirlo en texto seleccionable y editable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOcrOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-sm transition-all shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ejecutar OCR
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 relative">
          <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] bg-surface lg:block" aria-label="Miniaturas de páginas">
            {pdf && <Thumbnails />}
          </aside>

          {/* Lienzo */}
          <div
            ref={scrollRef}
            className="relative min-w-0 flex-1 overflow-auto bg-canvas"
            style={{ touchAction: "pan-x pan-y" }}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
            }}
            onDrop={onCanvasDrop}
          >
            {/* Barra flotante contextual sobre la selección */}
            {selectedId && (
              <ContextToolbar
                selectedObject={store.doc.objects.find((o) => o.id === selectedId) || null}
                onUpdate={(patch) => store.change(updateObject(store.doc, selectedId, patch))}
                onDuplicate={() => {
                  const res = duplicateSelection(store.doc, [selectedId]);
                  store.change(res.doc);
                  setSelectedIds(res.ids);
                }}
                onDelete={() => store.change(deleteSelection(store.doc, [selectedId]))}
              />
            )}

            {!pdf ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-fg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-primary-fg" />
                {loadPct !== null ? `Descargando PDF… ${loadPct}%` : "Preparando páginas…"}
              </div>
            ) : (
              <div className="mx-auto flex w-max min-w-full flex-col items-center gap-6 px-4 pt-6 pb-36">
                {store.doc.pages.map((p, i) => (
                  <PageView key={p.id} page={p} index={i} />
                ))}
              </div>
            )}
          </div>

          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/[0.06] bg-surface lg:block" aria-label="Propiedades">
            {reviewOpen && ocrMetadata ? (
              <div className="flex flex-col h-full">
                <div className="p-2 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Revisión OCR
                  </span>
                  <button
                    type="button"
                    onClick={() => setReviewOpen(false)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    Ver propiedades
                  </button>
                </div>
                <OCRReviewPanel
                  metadata={ocrMetadata}
                  currentPage={Math.max(1, store.doc.pages.findIndex((p) => p.id === currentPageId) + 1)}
                  onApplyCorrection={(orig, nuevo, word) => {
                    toast.ok(`Corrección aplicada: "${orig}" → "${nuevo}"`);
                  }}
                />
              </div>
            ) : (
              pdf && (
                <>
                  {ocrMetadata && (
                    <div className="p-2 border-b border-white/[0.06] flex justify-end">
                      <button
                        type="button"
                        onClick={() => setReviewOpen(true)}
                        className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Revisión OCR ({ocrMetadata.mode})
                      </button>
                    </div>
                  )}
                  <Inspector />
                </>
              )
            )}
          </aside>
        </div>

        {/* Barra flotante de herramientas */}
        {pdf && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-2 lg:right-80 lg:left-60">
            <div role="toolbar" aria-label="Herramientas" className="glass pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5">
              {tools.map((t, i) => {
                const active = t.id === tool;
                return (
                  <span key={t.id} className="flex items-center">
                    {(i === 3 || i === 6) && <span className="mx-1 h-3 w-px bg-white/15" aria-hidden />}
                    <button
                      type="button"
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={active}
                      onClick={() => {
                        if (t.id === "image") imageInput.current?.click();
                        else if (t.id === "signature") setSignOpen(true);
                        else setTool(t.id);
                      }}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                        active ? "bg-accent text-white" : "text-fg-2 hover:bg-subtle hover:text-fg"
                      }`}
                    >
                      {t.icon}
                    </button>
                  </span>
                );
              })}
              <span className="mx-1 h-3 w-px bg-white/15 lg:hidden" aria-hidden />
              <button
                type="button"
                title="Propiedades"
                aria-label="Propiedades"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((v) => !v)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl lg:hidden ${sheetOpen || selectedId ? "text-primary-fg" : "text-fg-2"} hover:bg-subtle`}
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) addImages(files);
          }}
        />

        {/* Móvil/tableta: miniaturas en cajón lateral */}
        {pagesOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Páginas">
            <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={() => setPagesOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-2xl">
              <div className="flex justify-end p-1">
                <button type="button" className={iconBtn} aria-label="Cerrar páginas" onClick={() => setPagesOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1">{pdf && <Thumbnails onNavigate={() => setPagesOpen(false)} />}</div>
            </div>
          </div>
        )}

        {/* Móvil/tableta: propiedades en hoja inferior */}
        {pdf && sheetOpen && (
          <div className="glass absolute inset-x-0 bottom-0 z-30 max-h-[65%] overflow-y-auto rounded-t-2xl border-t border-white/10 lg:hidden" aria-label="Propiedades">
            <div className="sticky top-0 flex items-center justify-between bg-surface/90 px-4 pt-2 backdrop-blur">
              <span className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden />
              <button type="button" className={`${iconBtn} absolute right-1`} aria-label="Cerrar propiedades" onClick={() => setSheetOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Inspector />
          </div>
        )}

        <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="QR de imagen temporal" size="lg">
          {qrOpen && <ShareCreator onInsert={insertQr} />}
        </Modal>
        <Modal
          open={conflict !== null}
          onClose={() => setConflict(null)}
          title="Hay una versión más reciente"
          footer={
            <>
              <button type="button" className="btn btn-secondary h-11" onClick={() => setConflict(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary h-11" disabled={saving} onClick={() => conflict && saveVersion({ token: conflict.token, pageCount: conflict.pageCount })}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar como nueva versión
              </button>
            </>
          }
        >
          {conflict && (
            <p className="text-sm leading-relaxed text-fg-2">
              Otro dispositivo guardó la <strong className="text-fg">v{conflict.latest.version}</strong> el {formatDateTime(conflict.latest.createdAt)} mientras editabas.
              No se pisará nada: tus cambios se guardarán como <strong className="text-fg">v{conflict.latest.version + 1}</strong> y la otra versión quedará en el historial.
            </p>
          )}
        </Modal>
        {latest && <VersionsModal open={historyOpen} onClose={() => setHistoryOpen(false)} documentId={documentId} latestId={latest.latestId} />}
        <Modal
          open={replacePending !== null}
          onClose={() => setReplacePending(null)}
          title="¿Reemplazar la imagen seleccionada?"
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary h-11"
                onClick={() => {
                  const f = replacePending!.file;
                  setReplacePending(null);
                  setSelectedId(null);
                  addImages([f]);
                }}
              >
                Añadir como nueva
              </button>
              <button type="button" className="btn btn-secondary h-11" onClick={() => replaceWith(replacePending!.file, replacePending!.target, "cover")}>
                Reemplazar (rellenar)
              </button>
              <button type="button" className="btn btn-primary h-11" onClick={() => replaceWith(replacePending!.file, replacePending!.target, "contain")}>
                Reemplazar (ajustar)
              </button>
            </>
          }
        >
          <p className="text-sm text-fg-2">
            La nueva imagen ocupará el mismo lugar, tamaño y rotación. «Ajustar» la muestra completa dentro del recuadro; «Rellenar» cubre todo el recuadro recortando lo que sobre.
          </p>
        </Modal>
        <Modal
          open={pngOpen}
          onClose={() => setPngOpen(false)}
          title="Exportar como PNG"
          footer={
            <>
              <button type="button" className="btn btn-secondary h-11" onClick={() => setPngOpen(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary h-11" onClick={exportPng}>
                <Download className="h-4 w-4" /> Exportar
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <fieldset>
              <legend className="label">Calidad</legend>
              <div className="flex gap-2">
                {([150, 200, 300] as const).map((d) => (
                  <button key={d} type="button" aria-pressed={pngDpi === d} onClick={() => setPngDpi(d)} className={`min-h-11 flex-1 rounded-xl border text-sm ${pngDpi === d ? "border-primary-strong bg-primary/20" : "border-border bg-subtle text-fg-2"}`}>
                    {d} ppp
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Páginas</legend>
              <div className="flex gap-2">
                {(["current", "all"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={pngPages === v} onClick={() => setPngPages(v)} className={`min-h-11 flex-1 rounded-xl border text-sm ${pngPages === v ? "border-primary-strong bg-primary/20" : "border-border bg-subtle text-fg-2"}`}>
                    {v === "current" ? "Página actual" : `Todas (${store.doc.pages.length})`}
                  </button>
                ))}
              </div>
            </fieldset>
            {meta && (
              <p className="font-mono text-mono-timer text-fg-muted">
                {pngPages === "current" || store.doc.pages.length === 1 ? pngExportNames(meta.name, [1]).single : `${pngExportNames(meta.name, [1, 2]).zip} (nombre-p1.png, nombre-p2.png…)`}
              </p>
            )}
          </div>
        </Modal>
        <ShareQrPicker
          open={qrPickerOpen}
          onClose={() => setQrPickerOpen(false)}
          onPick={(share) => {
            setQrPickerOpen(false);
            insertQr(share);
          }}
        />
        <SignaturePad open={signOpen} onClose={() => setSignOpen(false)} onInsert={insertSignature} />

        {/* Modales Avanzados de OCR, Conversión, Organización y Asistente IA */}
        <OCRDialog
          open={ocrOpen}
          onClose={() => setOcrOpen(false)}
          currentPage={Math.max(1, store.doc.pages.findIndex((p) => p.id === currentPageId) + 1)}
          totalPages={store.doc.pages.length}
          scannedPagesCount={scanned ? store.doc.pages.length : 0}
          onRunOCR={handleRunOCR}
        />
        <DiffViewerDialog
          open={diffOpen}
          onClose={() => setDiffOpen(false)}
          originalPageUrl={originalSnapshotUrl}
          editedPageUrl={editedSnapshotUrl}
          pageNumber={Math.max(1, store.doc.pages.findIndex((p) => p.id === currentPageId) + 1)}
        />
        <ConvertDialog
          open={convertOpen}
          onClose={() => setConvertOpen(false)}
          onExport={handleExportFormat}
        />
        <OrganizeDialog
          open={organizeOpen}
          onClose={() => setOrganizeOpen(false)}
          currentPage={Math.max(1, store.doc.pages.findIndex((p) => p.id === currentPageId) + 1)}
          totalPages={store.doc.pages.length}
          onApplyOperation={handleApplyOrganize}
        />
        <AIAssistantDrawer
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          result={aiResult}
          loading={aiLoading}
        />
      </div>
    </EditorContext>
  );
}

