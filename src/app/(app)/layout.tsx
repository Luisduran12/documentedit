import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // AppShell lee la ruta actual (usePathname): en rutas dinámicas debe ir dentro de <Suspense>.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
