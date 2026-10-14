"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Modal accesible basado en <dialog> nativo (foco, Escape y fondo inerte gratis). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className={`panel m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-hidden rounded-2xl p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm ${
        size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-md"
      }`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <h2 id="modal-title" className="font-display text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon -mr-2 h-10 w-10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
