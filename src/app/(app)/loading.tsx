/** Esqueleto instantáneo mientras se resuelve la ruta: evita la pantalla en blanco al navegar. */
export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Cargando">
      <div className="mb-6 h-8 w-48 rounded-lg bg-subtle" />
      <div className="panel divide-y divide-white/[0.06] rounded-2xl">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-lg bg-subtle" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded bg-subtle" />
              <div className="h-3 w-1/4 rounded bg-subtle" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
