"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** fetch JSON contra las APIs propias. Ante 401 manda al login (la sesión fue revocada o venció). */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito (sesión/descarga)
    window.location.assign(`/login?next=${next}`);
    throw new ApiError("Sesión vencida", 401);
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Error ${res.status}`, res.status);
  return data as T;
}
