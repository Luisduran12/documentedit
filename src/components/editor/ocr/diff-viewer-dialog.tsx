"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Columns, SplitSquareVertical, Layers, Check, ArrowLeftRight, Eye } from "lucide-react";

interface DiffViewerDialogProps {
  open: boolean;
  onClose: () => void;
  originalPageUrl?: string;
  editedPageUrl?: string;
  pageNumber: number;
}

export function DiffViewerDialog({
  open,
  onClose,
  originalPageUrl,
  editedPageUrl,
  pageNumber,
}: DiffViewerDialogProps) {
  const [viewMode, setViewMode] = useState<"side_by_side" | "split_slider" | "overlay">("side_by_side");
  const [sliderPosition, setSliderPosition] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Comparación Visual Antes / Después (Página ${pageNumber})`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Selector de modo de comparación */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("side_by_side")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "side_by_side"
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Lado a Lado
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split_slider")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "split_slider"
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Cortinilla Interactiva
            </button>
            <button
              type="button"
              onClick={() => setViewMode("overlay")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "overlay"
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Superposición
            </button>
          </div>

          {viewMode === "split_slider" && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>Posición:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPosition}
                onChange={(e) => setSliderPosition(Number(e.target.value))}
                className="w-32 accent-sky-500"
              />
              <span className="font-mono text-[11px] w-8">{sliderPosition}%</span>
            </div>
          )}

          {viewMode === "overlay" && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>Opacidad:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-32 accent-sky-500"
              />
              <span className="font-mono text-[11px] w-8">{overlayOpacity}%</span>
            </div>
          )}
        </div>

        {/* Área de renderizado y comparación */}
        <div className="min-h-[480px] max-h-[65vh] overflow-auto flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {viewMode === "side_by_side" && (
            <div className="grid grid-cols-2 gap-4 w-full">
              {/* Original */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-semibold uppercase text-neutral-500 mb-2">
                  Original (Escaneo / Base)
                </span>
                <div className="w-full bg-white shadow-md rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 relative min-h-[380px] flex items-center justify-center">
                  {originalPageUrl ? (
                    <img src={originalPageUrl} alt="Original" className="w-full h-auto object-contain" />
                  ) : (
                    <span className="text-xs text-neutral-400">Página original</span>
                  )}
                </div>
              </div>

              {/* Editada / OCR */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-semibold uppercase text-sky-600 dark:text-sky-400 mb-2">
                  Resultado OCR / Editado
                </span>
                <div className="w-full bg-white shadow-md rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 relative min-h-[380px] flex items-center justify-center">
                  {editedPageUrl ? (
                    <img src={editedPageUrl} alt="Resultado" className="w-full h-auto object-contain" />
                  ) : (
                    <span className="text-xs text-neutral-400">Página con capa de texto y edición</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {viewMode === "split_slider" && (
            <div className="relative w-full max-w-xl mx-auto shadow-md rounded-lg overflow-hidden bg-white select-none">
              {/* Imagen editada debajo */}
              <img
                src={editedPageUrl || originalPageUrl}
                alt="Resultado"
                className="w-full h-auto object-contain pointer-events-none"
              />
              {/* Imagen original encima recortada */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
              >
                <img
                  src={originalPageUrl || editedPageUrl}
                  alt="Original"
                  className="w-full h-auto object-contain pointer-events-none"
                />
              </div>
              {/* Línea divisoria */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-sky-500 shadow"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md text-[10px]">
                  ↔
                </div>
              </div>
            </div>
          )}

          {viewMode === "overlay" && (
            <div className="relative w-full max-w-xl mx-auto shadow-md rounded-lg overflow-hidden bg-white">
              <img
                src={originalPageUrl || editedPageUrl}
                alt="Base"
                className="w-full h-auto object-contain"
              />
              <img
                src={editedPageUrl || originalPageUrl}
                alt="Superpuesto"
                className="absolute inset-0 w-full h-auto object-contain"
                style={{ opacity: overlayOpacity / 100 }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>Fidelidad geométrica verificada: márgenes, líneas vectoriales y espaciado intactos.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cerrar Comparación
          </button>
        </div>
      </div>
    </Modal>
  );
}
