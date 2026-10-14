"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/documentos";
}

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { password } });
      window.location.assign(safeNext());
    } catch (err) {
      setLoading(false);
      setError(err instanceof ApiError ? err.message : "No se pudo conectar. Revisa tu conexión.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Campo de usuario oculto: ayuda a los gestores de contraseñas a guardar la credencial. */}
      <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
      <div>
        <label htmlFor="password" className="label">Contraseña</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            className="input h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-fg-muted hover:text-fg"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="rounded-lg bg-surface-raised/60 p-2.5 text-xs text-fg-muted border border-border/40">
        <span className="font-semibold text-fg">Modo local activo:</span> Contraseña de acceso por defecto: <code className="bg-canvas px-1.5 py-0.5 rounded text-primary-fg font-mono">admin12345678</code>
      </div>
      <button type="submit" disabled={loading} className="btn btn-primary mt-2 h-11">
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Entrar
      </button>
    </form>
  );
}
