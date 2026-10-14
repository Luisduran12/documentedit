"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/shares/ttl";

/** Hora actual que se actualiza periódicamente. Es null hasta montar (no se lee el reloj durante el prerender). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

export function Countdown({ to, className = "" }: { to: string; className?: string }) {
  const now = useNow();
  return (
    <span className={`font-mono text-mono-timer font-semibold tabular-nums ${className}`} aria-live="off">
      {now === null ? "—" : formatCountdown(new Date(to).getTime() - now)}
    </span>
  );
}
