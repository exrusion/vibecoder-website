import { NextResponse } from "next/server";

type SiteSpec = {
  name: string;
  ticker: string;
  headline: string;
  subline: string;
  accent: string;
  theme: "light" | "dark";
};

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
  const key = request.headers.get("x-openrouter-key")?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return NextResponse.json({ site: fallback, engine: "local" });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "VibeCoder" },
      body: JSON.stringify({
        model: "~openai/gpt-latest",
        messages: [
          { role: "system", content: "You are the design director for VibeCoder, a Solana community site builder. Return a concise site identity. Keep the headline under 9 words, the subline under 18 words, and use a valid six-digit hex color." },
          { role: "user", content: `Website request: ${body.prompt}\nToken address: ${typeof body.tokenAddress === "string" ? body.tokenAddress : "none"}\nImported project: ${typeof body.importValue === "string" ? body.importValue : "none"}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "vibecoder_site", strict: true, schema: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, headline: { type: "string" }, subline: { type: "string" }, accent: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, theme: { type: "string", enum: ["light", "dark"] } }, required: ["name", "ticker", "headline", "subline", "accent", "theme"], additionalProperties: false } } },
      }),
    });
    if (!response.ok) return NextResponse.json({ site: fallback, engine: "local", providerError: true });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ site: fallback, engine: "local" });
    const site = JSON.parse(content) as SiteSpec;
    return NextResponse.json({ site, engine: "openrouter" });
  } catch {
    return NextResponse.json({ site: fallback, engine: "local", providerError: true });
  }
}
