"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  RotateCw,
  Stamp,
  Heading,
  FileDigit,
  Trash2,
  Copy,
  Plus,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface OrganizeDialogProps {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  totalPages: number;
  onApplyOperation: (operation: "rotate" | "watermark" | "header_footer", params: any) => Promise<void>;
}

export function OrganizeDialog({
  open,
  onClose,
  currentPage,
  totalPages,
  onApplyOperation,
}: OrganizeDialogProps) {
  const [activeTab, setActiveTab] = useState<"watermark" | "header_footer" | "rotate">("watermark");
  const [watermarkText, setWatermarkText] = useState("CONFIDENCIAL");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [numberPages, setNumberPages] = useState(true);
  const [rotateAngle, setRotateAngle] = useState(90);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (activeTab === "watermark") {
        await onApplyOperation("watermark", {
          text: watermarkText,
          opacity: watermarkOpacity,
          fontSize: 48,
        });
      } else if (activeTab === "header_footer") {
        await onApplyOperation("header_footer", {
          headerText,
          footerText,
          numberPages,
        });
      } else if (activeTab === "rotate") {
        await onApplyOperation("rotate", {
          pages: [currentPage],
          angle: rotateAngle,
        });
      }
      onClose();
    } catch (err: any) {
      alert(`Error aplicando cambios: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !loading && onClose()} title="Herramientas de Organización y Páginas" size="lg">
      <div className="space-y-5">
        {/* Pestañas de herramientas */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab("watermark")}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "watermark"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            <Stamp className="w-4 h-4" />
            Marca de Agua
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("header_footer")}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "header_footer"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            <Heading className="w-4 h-4" />
            Encabezado y Numeración
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rotate")}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "rotate"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            <RotateCw className="w-4 h-4" />
            Rotación
          </button>
        </div>

        {/* Contenido según pestaña */}
        {activeTab === "watermark" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                Texto de la Marca de Agua
              </label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Ej. CONFIDENCIAL, BORRADOR, COPIA"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Opacidad / Transparencia:</span>
                <span className="font-mono">{Math.round(watermarkOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>
          </div>
        )}

        {activeTab === "header_footer" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                Texto del Encabezado (Arriba a la izquierda)
              </label>
              <input
                type="text"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Ej. Documento Confidencial - DocuPilot"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                Texto del Pie de Página
              </label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Ej. Todos los derechos reservados"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={numberPages}
                onChange={(e) => setNumberPages(e.target.checked)}
                className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
              />
              <FileDigit className="w-4 h-4 text-sky-500" />
              <span>Incluir numeración automática («Página X de {totalPages}»)</span>
            </label>
          </div>
        )}

        {activeTab === "rotate" && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Rotar la página actual (Pág. {currentPage}) de forma permanente en el documento:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setRotateAngle(deg)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                    rotateAngle === deg
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 font-semibold"
                      : "border-neutral-200 dark:border-neutral-800 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  +{deg}° Horario
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
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
                Aplicando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Aplicar al Documento
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
