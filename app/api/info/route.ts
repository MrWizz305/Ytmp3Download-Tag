import { NextRequest, NextResponse } from "next/server";
import { isValidYoutubeUrl } from "@/lib/youtube";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  const apiSecret = process.env.BACKEND_API_SECRET;

  if (!backendUrl || !apiSecret) {
    return NextResponse.json(
      { error: "Server is not configured. Set BACKEND_URL and BACKEND_API_SECRET." },
      { status: 500 },
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Paste a YouTube URL first." }, { status: 400 });
  }

  if (!isValidYoutubeUrl(body.url)) {
    return NextResponse.json(
      { error: "That doesn't look like a valid YouTube URL." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${backendUrl}/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiSecret,
      },
      body: JSON.stringify({ url: body.url }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the conversion backend. Is it running?" },
      { status: 502 },
    );
  }
}
