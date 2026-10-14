import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_DIR } from "@/lib/db/sqlite-local";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: p } = await params;
  const filePath = path.join(STORAGE_DIR, ...p);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(await req.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: p } = await params;
  const filePath = path.join(STORAGE_DIR, ...p);
  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".json": "application/json",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
  };

  const contentType = mimeMap[ext] || "application/octet-stream";
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileBuffer.length.toString(),
    },
  });
}
