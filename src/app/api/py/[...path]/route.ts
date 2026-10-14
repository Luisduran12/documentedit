import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetUrl = `${BACKEND_URL}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: "half",
    });

    const resHeaders = new Headers(res.headers);
    return new NextResponse(res.body, {
      status: res.status,
      headers: resHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Backend de procesamiento de PDF (FastAPI) no disponible en http://127.0.0.1:8000.",
        details: error?.message,
      },
      { status: 503 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
