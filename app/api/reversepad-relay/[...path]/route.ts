import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
const TOKEN_HASH = "11795eb4543f0cb1979365116820fe871fe1cddcfc0d130925778074c186de67";

function authorized(request: NextRequest) {
  const token = request.headers.get("x-reversepad-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const digest = createHash("sha256").update(token).digest("hex");
  return digest === TOKEN_HASH;
}

async function proxy(request: NextRequest, path: string[]) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const route = path.join("/");
  if (!["models", "chat/completions"].includes(route)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (route === "models" && request.method !== "GET") return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  if (route === "chat/completions" && request.method !== "POST") return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  const key = process.env.OPENROUTER_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Relay is not configured" }, { status: 503 });
  const base = (process.env.AI_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const upstream = await fetch(`${base}/${route}`, {
    method: request.method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "http-referer": "https://reversepad-production.up.railway.app",
      "x-title": "ReversePad",
    },
    body: request.method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}

type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}
