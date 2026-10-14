"use client";

import { useState } from "react";
import {
  Check,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle,
  Eye,
  Edit2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { OCRDocumentResult, OCRPageResult, OCRWord } from "@/lib/ocr/types";

interface OCRReviewPanelProps {
  metadata?: OCRDocumentResult;
  currentPage: number;
  onSelectWord?: (word: OCRWord) => void;
  onApplyCorrection?: (originalText: string, newText: string, word: OCRWord) => void;
}

export function OCRReviewPanel({
  metadata,
  currentPage,
  onSelectWord,
  onApplyCorrection,
}: OCRReviewPanelProps) {
  const [filterLowConfidenceOnly, setFilterLowConfidenceOnly] = useState(true);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (!metadata || !metadata.pages || metadata.pages.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-neutral-400">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40 text-neutral-400" />
        No hay datos de OCR activos para revisar. Ejecuta el Reconocimiento Óptico de Caracteres para inspeccionar palabras y confianza.
      </div>
    );
  }

  const pageData = metadata.pages.find((p) => p.page_number === currentPage) || metadata.pages[0];
  const allWords: OCRWord[] = [];
  pageData.blocks.forEach((b) => {
    b.lines.forEach((l) => {
      l.words.forEach((w) => allWords.push(w));
    });
  });

  const displayedWords = filterLowConfidenceOnly
    ? allWords.filter((w) => w.is_low_confidence || w.confidence < 75)
    : allWords;

  const handleStartEdit = (word: OCRWord, idx: number) => {
    setEditingWordId(`${idx}_${word.text}`);
    setEditValue(word.text);
    onSelectWord?.(word);
  };

  const handleSaveEdit = (word: OCRWord) => {
    if (onApplyCorrection && editValue !== word.text) {
      onApplyCorrection(word.text, editValue, word);
      word.text = editValue;
      word.is_low_confidence = false;
      word.confidence = 100;
    }
    setEditingWordId(null);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200">
      {/* Cabecera */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <h3 className="font-semibold text-xs tracking-wide uppercase text-neutral-600 dark:text-neutral-400">
              Revisión OCR (Pág. {currentPage})
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
            {pageData.average_confidence}% conf. prom.
          </span>
        </div>

        {/* Filtros */}
        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-1.5 cursor-pointer text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={filterLowConfidenceOnly}
              onChange={(e) => setFilterLowConfidenceOnly(e.target.checked)}
              className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
            />
            <span>Solo baja confianza ({pageData.low_confidence_count})</span>
          </label>
          <span className="text-[11px] text-neutral-400">
            {displayedWords.length} palabra(s)
          </span>
        </div>
      </div>

      {/* Lista de palabras */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {displayedWords.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">
            <CheckCircle className="w-6 h-6 mx-auto mb-1 text-emerald-500 opacity-80" />
            ¡Excelente! No se detectaron palabras con baja confianza en esta página.
          </div>
        ) : (
          displayedWords.map((word, idx) => {
            const isEditing = editingWordId === `${idx}_${word.text}`;
            const isLow = word.is_low_confidence || word.confidence < 75;

            return (
              <div
                key={idx}
                className={`p-2 rounded-lg border text-xs transition-colors ${
                  isLow
                    ? "border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20"
                    : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 px-2 py-1 bg-white dark:bg-neutral-800 border border-sky-400 rounded text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(word);
                          if (e.key === "Escape") setEditingWordId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(word)}
                        className="p-1 rounded bg-sky-500 text-white hover:bg-sky-600"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="font-medium truncate text-neutral-900 dark:text-neutral-100">
                          {word.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            word.confidence >= 85
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                              : word.confidence >= 70
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                              : "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                          }`}
                        >
                          {Math.round(word.confidence)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(word, idx)}
                          className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                          title="Corregir palabra"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span>
                    Caja: [{Math.round(word.bbox[0])}, {Math.round(word.bbox[1])}] - {Math.round(word.bbox[2] - word.bbox[0])}x{Math.round(word.bbox[3] - word.bbox[1])} pt
                  </span>
                  <span>{word.font_size} pt</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
