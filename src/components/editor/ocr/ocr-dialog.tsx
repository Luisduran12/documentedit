"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  Sparkles,
  FileText,
  Edit3,
  Layers,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Camera,
  RotateCw,
  SunMedium,
  Loader2,
} from "lucide-react";
import type { OCRMode } from "@/lib/ocr/types";

interface OCRDialogProps {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  totalPages: number;
  scannedPagesCount?: number;
  onRunOCR: (config: {
    mode: OCRMode;
    language: string;
    deskew: boolean;
    enhanceContrast: boolean;
    phonePhotoMode: boolean;
    scope: "all" | "current";
  }) => Promise<void>;
}

export function OCRDialog({
  open,
  onClose,
  currentPage,
  totalPages,
  scannedPagesCount = 0,
  onRunOCR,
}: OCRDialogProps) {
  const [mode, setMode] = useState<OCRMode>("mode_a");
  const [language, setLanguage] = useState("spa");
  const [deskew, setDeskew] = useState(true);
  const [enhanceContrast, setEnhanceContrast] = useState(true);
  const [phonePhotoMode, setPhonePhotoMode] = useState(false);
  const [scope, setScope] = useState<"all" | "current">("all");
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setProgressMsg("Iniciando análisis óptico del documento...");
    try {
      setTimeout(() => setProgressMsg("Preprocesando imágenes y corrigiendo inclinación..."), 1200);
      setTimeout(() => setProgressMsg("Extrayendo texto y coordenadas con Tesseract..."), 2600);
      setTimeout(() => setProgressMsg("Compilando capas y preservando diseño original..."), 4500);

      await onRunOCR({
        mode,
        language,
        deskew,
        enhanceContrast,
        phonePhotoMode,
        scope,
      });
      onClose();
    } catch (err: any) {
      alert(`Error en el procesamiento OCR: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setProgressMsg("");
    }
  };

  return (
    <Modal open={open} onClose={() => !loading && onClose()} title="Reconocimiento Óptico de Caracteres (OCR)" size="lg">
      <div className="space-y-6">
        {scannedPagesCount > 0 && (
          <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>
              Se detectaron <strong>{scannedPagesCount}</strong> página(s) escaneada(s) sin texto seleccionable.
              Aplica OCR para habilitar edición y búsqueda.
            </span>
          </div>
        )}

        {/* Selección de modo OCR */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 block">
            Selecciona el Modo de OCR
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* MODO A */}
            <button
              type="button"
              onClick={() => setMode("mode_a")}
              className={`flex flex-col p-4 rounded-xl border text-left transition-all relative ${
                mode === "mode_a"
                  ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                {mode === "mode_a" && <CheckCircle2 className="w-4 h-4 text-sky-500" />}
              </div>
              <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Modo A: Fiel al Original</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                Mantiene intacta la apariencia visual de la página e inserta una capa invisible para seleccionar, copiar y buscar texto.
              </p>
            </button>

            {/* MODO B */}
            <button
              type="button"
              onClick={() => setMode("mode_b")}
              className={`flex flex-col p-4 rounded-xl border text-left transition-all relative ${
                mode === "mode_b"
                  ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                {mode === "mode_b" && <CheckCircle2 className="w-4 h-4 text-violet-500" />}
              </div>
              <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Modo B: OCR Editable</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                Extrae bloques, líneas y palabras con coordenadas precisas para reemplazar y editar texto directamente sobre la página.
              </p>
            </button>

            {/* MODO C */}
            <button
              type="button"
              onClick={() => setMode("mode_c")}
              className={`flex flex-col p-4 rounded-xl border text-left transition-all relative ${
                mode === "mode_c"
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                {mode === "mode_c" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </div>
              <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Modo C: Reconstrucción</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                Reconstruye jerárquicamente títulos, párrafos, tablas y columnas para reorganizar el documento y exportar a DOCX/XLSX.
              </p>
            </button>
          </div>
        </div>

        {/* Opciones de preprocesamiento y mejoras de imagen */}
        <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5" />
            Mejoras y Preprocesamiento de Imagen (OpenCV)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deskew}
                onChange={(e) => setDeskew(e.target.checked)}
                className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
              />
              <RotateCw className="w-3.5 h-3.5 text-neutral-400" />
              Enderezar (Deskew)
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enhanceContrast}
                onChange={(e) => setEnhanceContrast(e.target.checked)}
                className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
              />
              <SunMedium className="w-3.5 h-3.5 text-neutral-400" />
              Contraste CLAHE
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={phonePhotoMode}
                onChange={(e) => setPhonePhotoMode(e.target.checked)}
                className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
              />
              <Camera className="w-3.5 h-3.5 text-neutral-400" />
              Modo Foto de Celular
            </label>
          </div>
        </div>

        {/* Idioma y alcance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
              Idioma Principal
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-neutral-800 dark:text-neutral-200"
            >
              <option value="spa">Español (con acentos y signos ¿¡)</option>
              <option value="eng">Inglés (English)</option>
              <option value="auto">Bilingüe / Automático (spa + eng)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
              Páginas a Procesar
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  scope === "all"
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                Todas ({totalPages})
              </button>
              <button
                type="button"
                onClick={() => setScope("current")}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  scope === "current"
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                Página Actual ({currentPage})
              </button>
            </div>
          </div>
        </div>

        {/* Estado de carga / progreso */}
        {loading && (
          <div className="p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 rounded-xl space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
              <span>{progressMsg}</span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-sky-500 h-full animate-pulse rounded-full w-3/4 transition-all duration-500" />
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Ejecutar OCR
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
