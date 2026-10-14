"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, MonitorSmartphone, Settings, User } from "lucide-react";
import { api } from "@/lib/api-client";
import { ToastProvider } from "@/components/ui/toast";
import { Logo, LogoMark } from "@/components/logo";
import { NAV_ITEMS } from "@/components/nav";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // El editor usa todo el alto disponible y gestiona su propio scroll.
  const fullBleed = pathname.startsWith("/editor/");

  return (
    <ToastProvider>
    <div className="min-h-dvh bg-canvas">
      <a href="#contenido" className="sr-only z-[70] rounded-lg bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Saltar al contenido
      </a>
      {/* Escritorio: sidebar completa */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-surface lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/documentos" aria-label="Inicio">
            <Logo />
          </Link>
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary text-white" : "text-fg-2 hover:bg-subtle hover:text-fg"
                }`}
              >
                <item.icon className="h-[18px] w-[18px]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Tableta: riel de iconos */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r border-white/[0.06] bg-surface md:flex lg:hidden">
        <div className="flex h-14 items-center">
          <Link href="/documentos" aria-label="Inicio">
            <LogoMark />
          </Link>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1 py-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  active ? "bg-primary text-white" : "text-fg-2 hover:bg-subtle hover:text-fg"
                }`}
              >
                <item.icon className="h-5 w-5" aria-hidden />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="md:pl-16 lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-white/[0.06] bg-canvas/80 px-4 backdrop-blur-xl md:px-6">
          <div className="md:hidden">
            <Link href="/documentos" aria-label="Inicio">
              <Logo />
            </Link>
          </div>
          <div className="hidden min-w-0 flex-1 md:block" />
          <UserMenu />
        </header>

        <main
          id="contenido"
          tabIndex={-1}
          className={
            fullBleed
              ? "h-[calc(100dvh-3.5rem-4rem)] md:h-[calc(100dvh-3.5rem)]"
              : "mx-auto w-full max-w-6xl px-4 pt-6 pb-28 md:px-6 md:pb-10"
          }
        >
          {children}
        </main>
      </div>

      {/* Móvil: barra inferior */}
      <nav
        aria-label="Principal"
        className="glass fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium ${
                active ? "text-primary-fg" : "text-fg-muted"
              }`}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
    </ToastProvider>
  );
}

const OWNER_NAME = process.env.NEXT_PUBLIC_OWNER_NAME ?? "";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = initialsOf(OWNER_NAME);

  async function signOut(all: boolean) {
    await api(all ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito (sesión/descarga)
    window.location.assign("/login");
  }

  const item = "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-fg-2 hover:bg-subtle hover:text-fg";

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de usuario"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-strong to-accent font-display text-sm font-semibold text-white"
      >
        {initials || <User className="h-5 w-5" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 mt-2 w-64 rounded-2xl p-2 shadow-2xl">
          {OWNER_NAME && <p className="truncate px-3 py-2 text-sm text-fg-muted">{OWNER_NAME}</p>}
          <Link role="menuitem" href="/configuracion" onClick={() => setOpen(false)} className={item}>
            <Settings className="h-4 w-4" aria-hidden /> Configuración
          </Link>
          <button role="menuitem" type="button" onClick={() => signOut(false)} className={item}>
            <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
          </button>
          <button role="menuitem" type="button" onClick={() => signOut(true)} className={item}>
            <MonitorSmartphone className="h-4 w-4" aria-hidden /> Cerrar sesión en todos los dispositivos
          </button>
        </div>
      )}
    </div>
  );
}
