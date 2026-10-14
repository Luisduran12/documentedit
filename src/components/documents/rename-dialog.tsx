"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";

export function RenameDialog({ initial, onClose, onSave }: { initial: string | null; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (!name) return;
    setBusy(true);
    await onSave(name).finally(() => setBusy(false));
  }

  return (
    <Modal open={initial !== null} onClose={onClose} title="Renombrar documento">
      <form id="rename-form" onSubmit={submit}>
        <label htmlFor="doc-name" className="label">Nombre</label>
        <input id="doc-name" name="name" defaultValue={initial ?? ""} maxLength={255} required autoFocus className="input h-11" />
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary h-11">Cancelar</button>
        <button type="submit" form="rename-form" disabled={busy} className="btn btn-primary h-11">Guardar</button>
      </div>
    </Modal>
  );
}
