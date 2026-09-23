import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  const apiSecret = process.env.BACKEND_API_SECRET;

  if (!backendUrl || !apiSecret) {
    return NextResponse.json(
      { error: "Server is not configured. Set BACKEND_URL and BACKEND_API_SECRET." },
      { status: 500 },
    );
  }

  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const forwardForm = new FormData();
  for (const [key, value] of incomingForm.entries()) {
    forwardForm.append(key, value);
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/convert`, {
      method: "POST",
      headers: { "x-api-key": apiSecret },
      body: forwardForm,
      signal: AbortSignal.timeout(280_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the conversion backend. Is it running?" },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    const contentType = backendRes.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await backendRes.json();
      return NextResponse.json(data, { status: backendRes.status });
    }
    return NextResponse.json({ error: "Conversion failed." }, { status: backendRes.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", backendRes.headers.get("content-type") ?? "audio/mpeg");
  const disposition = backendRes.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);

  return new Response(backendRes.body, { status: 200, headers });
}
