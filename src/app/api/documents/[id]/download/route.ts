import { NextResponse } from "next/server";
import { z } from "zod";
import { getDocument } from "@/lib/documents/repo";
import { withSession } from "@/lib/http";
import { presignGet } from "@/lib/storage/r2";

type Ctx = { params: Promise<{ id: string }> };

/** Redirige a una URL firmada de descarga (5 min). Sin sesión, el proxy responde 401. */
export const GET = withSession<Ctx>(async (_req, { params }) => {
  const row = await getDocument(z.uuid().parse((await params).id));
  const name = /\.pdf$/i.test(row.name) ? row.name : `${row.name}.pdf`;
  const url = await presignGet(row.storageKey, { downloadName: name, contentType: "application/pdf" });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
});
