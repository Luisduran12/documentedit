"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Download,
  Loader2,
  CheckCircle2,
  Settings2,
} from "lucide-react";

interface ConvertDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: "docx" | "xlsx" | "txt" | "png" | "jpg", dpi: number) => Promise<void>;
}

export function ConvertDialog({ open, onClose, onExport }: ConvertDialogProps) {
  const [format, setFormat] = useState<"docx" | "xlsx" | "txt" | "png" | "jpg">("docx");
  const [dpi, setDpi] = useState<number>(200);
  const [loading, setLoading] = useState(false);

  const formats = [
    {
      id: "docx",
      label: "Microsoft Word (.docx)",
      desc: "Conserva párrafos, títulos, listas y estructura de tablas.",
      icon: FileText,
      color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    },
    {
      id: "xlsx",
      label: "Microsoft Excel (.xlsx)",
      desc: "Extrae tablas en hojas de cálculo con celdas y encabezados.",
      icon: FileSpreadsheet,
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      id: "txt",
      label: "Texto Plano (.txt)",
      desc: "Extrae texto UTF-8 limpio con jerarquía de páginas.",
      icon: FileCode,
      color: "text-neutral-500 bg-neutral-500/10 border-neutral-500/20",
    },
    {
      id: "png",
      label: "Imágenes PNG de alta fidelidad",
      desc: "Renderiza cada página como imagen raster sin pérdida de nitidez.",
      icon: ImageIcon,
      color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    },
  ];

  const handleExecute = async () => {
    setLoading(true);
    try {
      await onExport(format, dpi);
      onClose();
    } catch (err: any) {
      alert(`Error al exportar documento: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !loading && onClose()} title="Convertir y Exportar Documento" size="lg">
      <div className="space-y-6">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 block">
            Selecciona el Formato de Salida
          </label>
          <div className="space-y-2">
            {formats.map((f) => {
              const Icon = f.icon;
              const isSelected = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id as any)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 shadow-sm"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${f.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{f.label}</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{f.desc}</p>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Opciones de resolución para imágenes */}
        {(format === "png" || format === "jpg") && (
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Resolución de renderizado:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDpi(150)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  dpi === 150
                    ? "bg-sky-600 text-white border-transparent"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600"
                }`}
              >
                150 DPI (Estándar)
              </button>
              <button
                type="button"
                onClick={() => setDpi(300)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  dpi === 300
                    ? "bg-sky-600 text-white border-transparent"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600"
                }`}
              >
                300 DPI (Alta Calidad)
              </button>
            </div>
          </div>
        )}

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
            onClick={handleExecute}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando documento...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Descargar Archivo
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
