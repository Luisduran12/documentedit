"use client";

import { useState } from "react";
import {
  Sparkles,
  X,
  FileText,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  ShieldCheck,
  Check,
  Table as TableIcon,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Copy,
} from "lucide-react";
import type { AIAnalysisResult } from "@/lib/ocr/types";

interface AIAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  result?: AIAnalysisResult | null;
  loading: boolean;
  onApplyCorrection?: (original: string, suggestion: string) => void;
}

export function AIAssistantDrawer({
  open,
  onClose,
  result,
  loading,
  onApplyCorrection,
}: AIAssistantDrawerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 max-w-[90vw] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Asistente Documental IA</h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Privado y local (cero fugas de datos)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-neutral-800 dark:text-neutral-200">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-xs text-neutral-500">Analizando documento, extrayendo datos y estructurando tablas...</p>
          </div>
        ) : !result ? (
          <div className="py-16 text-center text-xs text-neutral-400 space-y-2">
            <Sparkles className="w-8 h-8 mx-auto opacity-30 text-indigo-500" />
            <p>Haz clic en "Analizar con IA" para resumir y extraer información del PDF.</p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  Resumen Ejecutivo
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(result.summary, "summary")}
                  className="text-[11px] text-neutral-400 hover:text-neutral-600 flex items-center gap-1"
                >
                  {copiedKey === "summary" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === "summary" ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                {result.summary}
              </p>
            </div>

            {/* Puntos Clave */}
            {result.key_points && result.key_points.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 block flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  Puntos Clave
                </span>
                <ul className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                  {result.key_points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Entidades Extraídas */}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5 block">
                Entidades y Datos Detectados
              </span>
              <div className="space-y-2">
                {result.entities.amounts && result.entities.amounts.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-start gap-2.5 text-xs">
                    <DollarSign className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold block text-[11px] text-neutral-500">Importes / Moneda</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.entities.amounts.map((amt, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                            {amt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {result.entities.dates && result.entities.dates.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-start gap-2.5 text-xs">
                    <Calendar className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold block text-[11px] text-neutral-500">Fechas Relevantes</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.entities.dates.map((dt, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                            {dt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {result.entities.tax_ids && result.entities.tax_ids.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-start gap-2.5 text-xs">
                    <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold block text-[11px] text-neutral-500">NIT / Identificaciones</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.entities.tax_ids.map((id, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-mono text-[11px]">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {result.entities.emails && result.entities.emails.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-start gap-2.5 text-xs">
                    <Mail className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold block text-[11px] text-neutral-500">Correos Electrónicos</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.entities.emails.map((em, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                            {em}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sugerencias de Corrección OCR */}
            {result.ocr_corrections && result.ocr_corrections.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5 block flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  Sugerencias de Corrección OCR ({result.ocr_corrections.length})
                </span>
                <div className="space-y-2">
                  {result.ocr_corrections.map((corr, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-rose-200 dark:border-rose-950/40 bg-rose-50/30 dark:bg-rose-950/20 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="line-through text-rose-500 font-mono">{corr.original}</span>
                          <span className="text-neutral-400">→</span>
                          <span className="font-bold text-emerald-600 font-mono">{corr.suggestion}</span>
                        </div>
                        {onApplyCorrection && (
                          <button
                            type="button"
                            onClick={() => onApplyCorrection(corr.original, corr.suggestion)}
                            className="px-2 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-[11px] font-medium hover:bg-neutral-50"
                          >
                            Aplicar
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500">{corr.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
