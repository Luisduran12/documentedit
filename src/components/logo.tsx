import { useId } from "react";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // id único por instancia: si una copia queda dentro de un contenedor oculto, las demás no pierden el degradado.
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path d="M10 8h8l5 5v11a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" fill="#fff" fillOpacity=".95" />
      <path d="M18 8v4a1 1 0 0 0 1 1h4" fill="none" stroke="#7c3aed" strokeWidth="1.5" />
      <path d="M12.5 17.5h7M12.5 20.5h4.5" stroke="#7c3aed" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="flex flex-col leading-none">
        <span className="font-display text-[1.05rem] font-semibold tracking-tight text-fg">DocuPilot</span>
        <span className="font-mono text-[0.6875rem] font-semibold tracking-wide text-primary-fg">STUDIO</span>
      </div>
    </div>
  );
}
