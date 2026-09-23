import { NextResponse } from "next/server";

type SiteSpec = {
  name: string;
  ticker: string;
  headline: string;
  subline: string;
  accent: string;
  theme: "light" | "dark";
};

let discoveredModel: string | undefined;

async function resolveModel(baseUrl: string, key: string) {
  const configured = process.env.AI_MODEL?.trim();
  if (configured && !configured.startsWith("~") && !configured.startsWith("routers/")) return configured;
  if (discoveredModel) return discoveredModel;

  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error("Unable to load the relay model catalogue.");

  const payload = await response.json() as { data?: Array<{ id?: string }> };
  const ids = payload.data?.map((item) => item.id).filter((id): id is string => Boolean(id)) ?? [];
  if (!ids.length) throw new Error("The relay returned an empty model catalogue.");

  const preference = [
    /gpt-4\.1-mini/i,
    /gpt-4o-mini/i,
    /gemini-2\.5-flash/i,
    /claude-3[.-]5-haiku/i,
    /qwen.*coder/i,
    /llama.*instruct/i,
  ];
  discoveredModel = preference.flatMap((pattern) => ids.filter((id) => pattern.test(id)))[0] ?? ids[0];
  return discoveredModel;
}

function localSpec(prompt: string): SiteSpec {
  const value = prompt.toLowerCase();
  const frog = value.includes("frog");
  const cat = value.includes("cat") || value.includes("meow");
  const dog = value.includes("dog") || value.includes("shiba");
  const dashboard = value.includes("dashboard") || value.includes("analytics");
  const name = frog ? "Frog House" : cat ? "Meow Club" : dog ? "Neon Dog" : dashboard ? "Token Atlas" : "Orbit Club";
  const ticker = frog ? "$FROG" : cat ? "$MEOW" : dog ? "$NDOG" : dashboard ? "$ATLAS" : "$ORBIT";
  const accent = value.includes("green") || frog ? "#98d66f" : value.includes("orange") ? "#ffad5c" : value.includes("red") ? "#ff6b5d" : value.includes("blue") ? "#78b4ff" : "#b9a7ff";
  return { name, ticker, headline: dashboard ? "See the whole community move." : "A small token with a big orbit.", subline: "Made by people who still believe the internet should be fun.", accent, theme: value.includes("dark") || value.includes("cyber") ? "dark" : "light" };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { prompt?: unknown; tokenAddress?: unknown; importValue?: unknown };
  if (typeof body.prompt !== "string" || body.prompt.trim().length < 3) return NextResponse.json({ error: "A website prompt is required." }, { status: 400 });
  const fallback = localSpec(body.prompt);
  const key = request.headers.get("x-openrouter-key")?.trim() || process.env.AI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return NextResponse.json({ site: fallback, engine: "local" });

  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");

  try {
    const model = await resolveModel(baseUrl, key);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "VibeCoder" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are the design director for VibeCoder, a Solana community site builder. Return only valid JSON with these keys: name, ticker, headline, subline, accent, theme. Keep the headline under 9 words, the subline under 18 words, accent as a six-digit hex color, and theme as light or dark." },
          { role: "user", content: `Website request: ${body.prompt}\nToken address: ${typeof body.tokenAddress === "string" ? body.tokenAddress : "none"}\nImported project: ${typeof body.importValue === "string" ? body.importValue : "none"}` },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ site: fallback, engine: "local", providerError: true });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ site: fallback, engine: "local" });
    const site = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as SiteSpec;
    return NextResponse.json({ site, engine: "relay" });
  } catch {
    return NextResponse.json({ site: fallback, engine: "local", providerError: true });
  }
}
