import { auth } from "@/auth";
import { GENERATION_RESERVE, reserveGenerationCredits, refundGenerationCredits, settleGenerationCredits } from "@/lib/credits";

const instructions = {
  section: "You create a single polished section for a Solana community site. Return only JSON with title (short), body (max 65 words), cta (short), and type (the supplied section type). No markdown.",
  brand: "You are a visual brand director. Return only JSON with primary (six-digit hex), secondary (six-digit hex), background (six-digit hex), tagline (max 8 words), font (choose from Georgia, Arial, Trebuchet MS, Courier New), and motif (one of orbit, pixel, star). Avoid trademarks.",
  agent: "You are a helpful community assistant. Answer only using the project brief and pasted knowledge provided below. If the facts are missing, explicitly say you do not know. Do not claim trading guarantees or invent token facts. Respond in under 120 words.",
} as const;

type Kind = keyof typeof instructions;
const validHex = /^#[0-9a-f]{6}$/i;
let cachedModel = "";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { kind?: Kind; prompt?: string; context?: string; sectionType?: string };
  const kind = body.kind;
  if (!kind || !(kind in instructions) || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: "Choose a tool and enter a request." }, { status: 400 });
  }
  const prompt = body.prompt.slice(0, 1500);
  const context = typeof body.context === "string" ? body.context.slice(0, 10000) : "";
  const personalKey = request.headers.get("x-openrouter-key")?.trim() || "";
  const session = await auth();
  const owner = personalKey ? "" : session?.user?.xUserId || "";
  if (!owner && !personalKey) return Response.json({ error: "Connect X to use AI tools, or add your personal AI key.", code: "AUTH_REQUIRED" }, { status: 401 });
  const reserved = owner ? await reserveGenerationCredits(owner, GENERATION_RESERVE) : null;
  if (owner && !reserved) return Response.json({ error: "Not enough AI tokens.", code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  const refund = async () => { if (owner && reserved) await refundGenerationCredits(owner, reserved.reserved); };
  const key = personalKey || process.env.AI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) { await refund(); return Response.json({ error: "The AI provider is not configured." }, { status: 503 }); }
  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    let model = process.env.AI_MODEL?.trim() || "";
    if (!model || model.startsWith("~") || model.startsWith("routers/")) {
      if (!cachedModel) {
        const catalog = await fetch(baseUrl + "/models", { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(8000) });
        if (!catalog.ok) throw new Error("AI models are temporarily unavailable.");
        const available = await catalog.json() as { data?: { id?: string }[] };
        const ids = available.data?.map(item => item.id).filter((id): id is string => !!id) || [];
        cachedModel = ids.find(id => /gpt-4\.1-mini|gpt-4o-mini|gemini-2\.5-flash/i.test(id)) || ids[0] || "";
      }
      model = cachedModel;
    }
    if (!model) throw new Error("No AI model is available.");
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-Title": "Vibekit Tools" },
      body: JSON.stringify({ model, max_tokens: 650, messages: [
        { role: "system", content: instructions[kind] },
        { role: "user", content: "Section type: " + String(body.sectionType || "general").slice(0, 30) + "\nProject context: " + context + "\nRequest: " + prompt },
      ] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("The AI provider could not complete this request.");
    const payload = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
    const output = payload.choices?.[0]?.message?.content?.trim() || "";
    if (!output) throw new Error("The AI provider returned an empty response.");
    let result: unknown = output;
    if (kind !== "agent") {
      const parsed = JSON.parse(output.replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "")) as Record<string, unknown>;
      if (kind === "brand") {
        for (const field of ["primary", "secondary", "background"]) if (!validHex.test(String(parsed[field] || ""))) throw new Error("The brand colors were invalid. Try again.");
      } else if (!parsed.title || !parsed.body) throw new Error("The generated section was incomplete. Try again.");
      result = parsed;
    }
    let creditsRemaining: string | undefined;
    if (owner && reserved) {
      const tokens = Math.max(1, Math.floor(payload.usage?.total_tokens || (prompt.length + context.length + output.length) / 4));
      creditsRemaining = (await settleGenerationCredits(owner, reserved.reserved, BigInt(tokens))).toString();
    }
    return Response.json({ result, creditsRemaining });
  } catch (error) {
    await refund();
    return Response.json({ error: error instanceof Error ? error.message : "AI request failed." }, { status: 502 });
  }
}
