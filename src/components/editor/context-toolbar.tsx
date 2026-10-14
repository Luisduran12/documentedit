"use client";

import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  Type,
  Palette,
  Sliders,
  Crop,
  Layers,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { EditObject, TextObject, ImageObject } from "@/lib/editor/types";

interface ContextToolbarProps {
  selectedObject: EditObject | null;
  onUpdate: (patch: Partial<EditObject>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ContextToolbar({
  selectedObject,
  onUpdate,
  onDuplicate,
  onDelete,
}: ContextToolbarProps) {
  if (!selectedObject) return null;

  const isText = selectedObject.type === "text";
  const isImage = selectedObject.type === "image";

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-xl text-xs backdrop-blur-sm">
      {isText && (
        <>
          {/* Tamaño de texto */}
          <div className="flex items-center gap-1 px-2 border-r border-neutral-200 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-400">Tamaño</span>
            <input
              type="number"
              min="6"
              max="120"
              value={(selectedObject as TextObject).style.size}
              onChange={(e) =>
                onUpdate({
                  style: {
                    ...(selectedObject as TextObject).style,
                    size: Number(e.target.value),
                  },
                } as any)
              }
              className="w-12 px-1.5 py-0.5 border border-neutral-200 dark:border-neutral-700 rounded text-center text-xs bg-transparent"
            />
          </div>

          {/* Color */}
          <div className="flex items-center gap-1 px-1.5 border-r border-neutral-200 dark:border-neutral-800">
            <Palette className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="color"
              value={(selectedObject as TextObject).style.color}
              onChange={(e) =>
                onUpdate({
                  style: {
                    ...(selectedObject as TextObject).style,
                    color: e.target.value,
                  },
                } as any)
              }
              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>

          {/* Formato negrita / cursiva */}
          <div className="flex items-center gap-0.5 border-r border-neutral-200 dark:border-neutral-800 pr-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  style: {
                    ...(selectedObject as TextObject).style,
                    font: {
                      ...(selectedObject as TextObject).style.font,
                      bold: !(selectedObject as TextObject).style.font.bold,
                    },
                  },
                } as any)
              }
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                (selectedObject as TextObject).style.font.bold ? "bg-neutral-200 dark:bg-neutral-700 font-bold" : ""
              }`}
              title="Negrita"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  style: {
                    ...(selectedObject as TextObject).style,
                    font: {
                      ...(selectedObject as TextObject).style.font,
                      italic: !(selectedObject as TextObject).style.font.italic,
                    },
                  },
                } as any)
              }
              className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                (selectedObject as TextObject).style.font.italic ? "bg-neutral-200 dark:bg-neutral-700 italic" : ""
              }`}
              title="Cursiva"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Alineación */}
          <div className="flex items-center gap-0.5 border-r border-neutral-200 dark:border-neutral-800 pr-1.5">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() =>
                  onUpdate({
                    style: {
                      ...(selectedObject as TextObject).style,
                      align,
                    },
                  } as any)
                }
                className={`p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  (selectedObject as TextObject).style.align === align ? "bg-neutral-200 dark:bg-neutral-700" : ""
                }`}
                title={`Alinear a la ${align}`}
              >
                {align === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                {align === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                {align === "right" && <AlignRight className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}

      {isImage && (
        <div className="flex items-center gap-2 px-2 border-r border-neutral-200 dark:border-neutral-800">
          <span className="text-[11px] text-neutral-400">Opacidad</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={(selectedObject as ImageObject).opacity}
            onChange={(e) => onUpdate({ opacity: Number(e.target.value) } as any)}
            className="w-20 accent-sky-500"
          />
        </div>
      )}

      {/* Acciones comunes: Duplicar y Eliminar */}
      <div className="flex items-center gap-1 pl-1">
        <button
          type="button"
          onClick={onDuplicate}
          className="p-1.5 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900"
          title="Duplicar elemento"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          title="Eliminar elemento"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
