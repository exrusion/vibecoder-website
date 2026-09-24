import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { GENERATION_RESERVE, refundGenerationCredits, reserveGenerationCredits, settleGenerationCredits } from "@/lib/credits";

type SiteSpec = {
  name: string;
  ticker: string;
  headline: string;
  subline: string;
  accent: string;
  theme: "light" | "dark";
  contractAddress?: string;
  imageUrl?: string;
  description?: string;
  website?: string;
  twitter?: string;
  marketCap?: number;
  liquidity?: number;
  priceUsd?: string;
  volume24h?: number;
  pairAddress?: string;
  dexScreenerUrl?: string;
};

type TokenMetadata = Pick<SiteSpec, "name" | "ticker" | "contractAddress" | "imageUrl" | "description" | "website" | "twitter" | "marketCap" | "liquidity" | "priceUsd" | "volume24h" | "pairAddress" | "dexScreenerUrl">;

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function findTokenAddress(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const candidate = value.trim().split(/\s+/).find((part) => SOLANA_ADDRESS.test(part.replace(/[),.;]+$/, "")));
    if (candidate) return candidate.replace(/[),.;]+$/, "");
  }
  return "";
}

function normalizeAssetUrl(value: unknown) {
  const url = String(value || "");
  const ipfsMatch = url.match(/^https?:\/\/ipfs\.io\/ipfs\/(.+)$/i);
  return ipfsMatch ? `https://ipfs.filebase.io/ipfs/${ipfsMatch[1]}` : url;
}

async function resolveToken(address: string): Promise<TokenMetadata | null> {
  if (!SOLANA_ADDRESS.test(address)) return null;
  const [pumpResult, dexResult, jupiterResult] = await Promise.allSettled([
    fetch(`https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(address)}`, { next: { revalidate: 60 } }),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`, { next: { revalidate: 60 } }),
    fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(address)}`, { next: { revalidate: 60 } }),
  ]);

  const pump = pumpResult.status === "fulfilled" && pumpResult.value.ok
    ? await pumpResult.value.json() as Record<string, unknown>
    : {};
  const dexPayload = dexResult.status === "fulfilled" && dexResult.value.ok
    ? await dexResult.value.json() as { pairs?: Array<Record<string, unknown>> }
    : {};
  const jupiterPayload = jupiterResult.status === "fulfilled" && jupiterResult.value.ok
    ? await jupiterResult.value.json() as Array<Record<string, unknown>>
    : [];
  const jupiter = jupiterPayload.find((token) => token.id === address) ?? {};
  const pairs = (dexPayload.pairs ?? []).filter((pair) => pair.chainId === "solana");
  const pair = pairs.sort((a, b) => Number((b.liquidity as { usd?: number } | undefined)?.usd ?? 0) - Number((a.liquidity as { usd?: number } | undefined)?.usd ?? 0))[0];
  const baseToken = pair?.baseToken as { name?: string; symbol?: string } | undefined;
  const info = pair?.info as { imageUrl?: string; websites?: Array<{ url?: string }>; socials?: Array<{ platform?: string; handle?: string }> } | undefined;
  const name = String(pump.name || jupiter.name || baseToken?.name || "").trim();
  const symbol = String(pump.symbol || jupiter.symbol || baseToken?.symbol || "").trim();
  if (!name && !symbol) return null;
  const twitterSocial = info?.socials?.find((item) => item.platform === "twitter")?.handle;

  return {
    name: name || symbol,
    ticker: symbol ? `$${symbol.replace(/^\$/, "")}` : `$${name.slice(0, 8).toUpperCase()}`,
    contractAddress: address,
    imageUrl: normalizeAssetUrl(pump.image_uri || jupiter.icon || info?.imageUrl) || undefined,
    description: String(pump.description || "") || undefined,
    website: String(pump.website || info?.websites?.[0]?.url || "") || undefined,
    twitter: String(pump.twitter || (twitterSocial ? `https://x.com/${twitterSocial.replace(/^@/, "")}` : "")) || undefined,
    marketCap: Number(pair?.marketCap ?? pump.usd_market_cap ?? jupiter.mcap ?? 0) || undefined,
    liquidity: Number((pair?.liquidity as { usd?: number } | undefined)?.usd ?? jupiter.liquidity ?? 0) || undefined,
    priceUsd: String(pair?.priceUsd || jupiter.usdPrice || "") || undefined,
    volume24h: Number((pair?.volume as { h24?: number } | undefined)?.h24 ?? 0) || undefined,
    pairAddress: String(pair?.pairAddress || "") || undefined,
    dexScreenerUrl: String(pair?.url || "") || undefined,
  };
}

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
  const personalKey = request.headers.get("x-openrouter-key")?.trim();
  let creditOwner = "";
  let reserved = BigInt(0);
  let reservationSettled = false;
  if (!personalKey) {
    const session = await auth();
    creditOwner = session?.user?.xUserId || "";
    if (!creditOwner) return NextResponse.json({ error: "Connect X to unlock your 10M free AI tokens.", code: "AUTH_REQUIRED" }, { status: 401 });
    const reservation = await reserveGenerationCredits(creditOwner, GENERATION_RESERVE);
    if (!reservation) return NextResponse.json({ error: "You need more AI tokens. Eligible holders receive 30M every day.", code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    reserved = reservation.reserved;
  }
  const refund = async () => {
    if (creditOwner && reserved && !reservationSettled) {
      await refundGenerationCredits(creditOwner, reserved);
      reservationSettled = true;
    }
  };
  const tokenMetadata = await resolveToken(findTokenAddress(body.tokenAddress, body.importValue, body.prompt));
  const fallback: SiteSpec = { ...localSpec(body.prompt), ...tokenMetadata };
  const key = personalKey || process.env.AI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    await refund();
    return NextResponse.json({ site: fallback, engine: "local" });
  }

  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");

  try {
    const model = await resolveModel(baseUrl, key);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Vibekit" },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [
          { role: "system", content: "You are the design director for Vibekit, a Solana community site builder. Return only valid JSON with these keys: name, ticker, headline, subline, accent, theme. Keep the headline under 8 words, the subline under 20 words, accent as a six-digit hex color, and theme as light or dark. When verified token metadata is supplied, copy its name and ticker exactly." },
          { role: "user", content: `Website request: ${body.prompt}\nToken address: ${typeof body.tokenAddress === "string" ? body.tokenAddress : "none"}\nImported project: ${typeof body.importValue === "string" ? body.importValue : "none"}\nVerified token metadata: ${tokenMetadata ? JSON.stringify(tokenMetadata) : "none"}` },
        ],
      }),
    });
    if (!response.ok) {
      await refund();
      return NextResponse.json({ site: fallback, engine: "local", providerError: true });
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      await refund();
      return NextResponse.json({ site: fallback, engine: "local" });
    }
    const generated = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as SiteSpec;
    const site = { ...generated, ...tokenMetadata };
    let creditsRemaining: string | undefined;
    if (creditOwner && reserved) {
      const estimated = Math.max(1, Math.ceil((body.prompt.length + content.length) / 4));
      const actual = BigInt(Math.max(1, Math.floor(payload.usage?.total_tokens || estimated)));
      creditsRemaining = (await settleGenerationCredits(creditOwner, reserved, actual)).toString();
      reservationSettled = true;
    }
    return NextResponse.json({ site, engine: "relay", creditsRemaining });
  } catch {
    await refund();
    return NextResponse.json({ site: fallback, engine: "local", providerError: true });
  }
}
