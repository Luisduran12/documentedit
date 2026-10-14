import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="panel rounded-2xl p-6">
          <h1 className="font-display text-xl font-semibold">Iniciar sesión</h1>
          <p className="mt-1 mb-6 text-sm text-fg-muted">Acceso privado de administrador.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
