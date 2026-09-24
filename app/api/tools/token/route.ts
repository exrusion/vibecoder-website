const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Pair = {
  chainId?: string; pairAddress?: string; url?: string; priceUsd?: string;
  marketCap?: number; fdv?: number; liquidity?: { usd?: number };
  volume?: { h24?: number }; priceChange?: { h24?: number };
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  info?: { imageUrl?: string; websites?: { url?: string }[]; socials?: { platform?: string; handle?: string }[] };
};

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() || "";
  if (!SOLANA_ADDRESS.test(address)) return Response.json({ error: "Enter a valid Solana token address." }, { status: 400 });
  try {
    const response = await fetch("https://api.dexscreener.com/token-pairs/v1/solana/" + encodeURIComponent(address), {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("DexScreener is temporarily unavailable.");
    const pairs = (await response.json() as Pair[])
      .filter(pair => pair.chainId === "solana" && pair.baseToken?.address === address)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const pair = pairs[0];
    if (!pair) return Response.json({ error: "No direct Solana market found for this token yet." }, { status: 404 });
    const token = pair.baseToken;
    const social = pair.info?.socials?.find(item => item.platform === "twitter")?.handle;
    return Response.json({
      address, name: token?.name || "", symbol: token?.symbol || "", imageUrl: pair.info?.imageUrl || "",
      priceUsd: pair.priceUsd || "", marketCap: pair.marketCap ?? pair.fdv ?? null,
      liquidity: pair.liquidity?.usd ?? null, volume24h: pair.volume?.h24 ?? null,
      priceChange24h: pair.priceChange?.h24 ?? null, pairAddress: pair.pairAddress || "",
      chartUrl: pair.url || "", website: pair.info?.websites?.[0]?.url || "",
      twitter: social ? "https://x.com/" + social.replace(/^@/, "") : "",
      buyUrl: "https://jup.ag/swap/SOL-" + address,
      pairCount: pairs.length, holders: null, holderDataAvailable: false,
      source: "DexScreener",
    }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Token lookup failed." }, { status: 502 });
  }
}
