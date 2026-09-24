import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refundGenerationCredits, reserveGenerationCredits, settleGenerationCredits } from "@/lib/credits";
import { ensureTokenImage } from "@/lib/site-branding";

const CODE_RESERVE = BigInt(24_000);
const MAX_HTML_LENGTH = 75_000;

type SiteRequest = {
  prompt?: unknown;
  mode?: unknown;
  project?: unknown;
  html?: unknown;
  history?: unknown;
};

function extractDocument(value: string) {
  const withoutFence = value.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.search(/<!doctype\s+html|<html\b/i);
  const end = withoutFence.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start || !/<body\b/i.test(withoutFence) || !/<style\b/i.test(withoutFence)) return "";
  return withoutFence.slice(start, end + 7);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as SiteRequest;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  const mode = body.mode === "edit" ? "edit" : "create";
  const previousHtml = typeof body.html === "string" ? body.html.trim().slice(0, MAX_HTML_LENGTH) : "";
  const projectFacts = body.project && typeof body.project === "object" && !Array.isArray(body.project)
    ? body.project as { name?: unknown; imageUrl?: unknown; contractAddress?: unknown } : {};
  const project = JSON.stringify(projectFacts).slice(0, 12_000);
  const history = Array.isArray(body.history) ? body.history.slice(-8).filter((message): message is { role: string; text: string } =>
    message && typeof message === "object" && (message.role === "user" || message.role === "assistant") && typeof message.text === "string"
  ).map(message => `${message.role}: ${message.text.slice(0, 500)}`).join("\n") : "";
  if (prompt.length < 3) return NextResponse.json({ error: "Describe the website or change you want." }, { status: 400 });
  if (mode === "edit" && !previousHtml && project === "{}") return NextResponse.json({ error: "Open a project before editing it." }, { status: 400 });

  const personalKey = request.headers.get("x-openrouter-key")?.trim();
  const session = personalKey ? null : await auth();
  const owner = personalKey ? "" : session?.user?.xUserId || "";
  if (!personalKey && !owner) return NextResponse.json({ error: "Connect X to use the AI builder, or add your own AI key.", code: "AUTH_REQUIRED" }, { status: 401 });
  const reservation = owner ? await reserveGenerationCredits(owner, CODE_RESERVE) : null;
  if (owner && !reservation) return NextResponse.json({ error: "You need more AI tokens to generate this website.", code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  let settled = false;
  const refund = async () => { if (owner && reservation && !settled) { settled = true; await refundGenerationCredits(owner, reservation.reserved); } };
  const key = personalKey || process.env.AI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) { await refund(); return NextResponse.json({ error: "The AI provider is not configured." }, { status: 503 }); }
  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");

  try {
    let model = process.env.AI_MODEL?.trim() || "";
    if (!model || model.startsWith("~") || model.startsWith("routers/")) {
      const catalog = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (!catalog.ok) throw new Error("The AI model catalogue is unavailable.");
      const available = await catalog.json() as { data?: Array<{ id?: string }> };
      const ids = available.data?.map(item => item.id).filter((id): id is string => Boolean(id)) || [];
      model = ids.find(id => /claude.*sonnet|gpt-4\.1(?!-mini)|gemini.*pro|qwen.*coder/i.test(id)) || ids.find(id => /gpt-4\.1-mini|gemini.*flash/i.test(id)) || ids[0] || "";
    }
    if (!model) throw new Error("No AI model is available.");
    const instructions = `You are Vibekit's expert website-building agent. Produce a COMPLETE, runnable, responsive standalone HTML document with <!doctype html>, <html>, <head>, embedded <style>, <body>, and optional embedded <script>. Return HTML only, no markdown. After </html>, append exactly one HTML comment: <!-- VIBEKIT_REPLY: a natural, specific one-sentence reply about what you actually did; VIBEKIT_ACTION: edit -->. The user's request is the design brief: actually implement it, including the page background, layout, typography, components, animations, and interactions they request. Do not merely change an accent color when asked to change a background. Use elegant design, responsive breakpoints, legible contrast, accessible labels, and functional internal navigation. No external JavaScript frameworks, CDNs, or CSS dependencies; embedded CSS and vanilla JS only. Preserve verified token name, ticker, contract, image, socials and market links exactly when supplied. Never invent a contract, token price, holder count, market cap, or team members. If a real Solana token address exists, add a DexScreener chart iframe at https://dexscreener.com/solana/ADDRESS?embed=1&theme=dark (replace ADDRESS with the supplied address). Otherwise show an honest chart waiting state. Never include secrets or authentication credentials. For edits: use the existing HTML as the starting point, preserve content and features not mentioned in the request, and revise the HTML/CSS/JS to visibly implement the requested change. Interpret obvious typos. When asked a question rather than a change, leave the HTML exactly as it is, answer the question in the reply comment, and use VIBEKIT_ACTION: answer. Make a cohesive site, not a generic repeated template.`;
    const userContent = mode === "edit"
      ? `User message: ${prompt}\nRecent conversation:\n${history || "None"}\nProject facts: ${project}\nExisting website source (may be an older React template or a complete HTML document; preserve its content and features while creating the requested full HTML document):\n${previousHtml}`
      : `Build request: ${prompt}\nProject and verified token facts: ${project}`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Vibekit Site Builder" },
      body: JSON.stringify({ model, max_tokens: 6500, messages: [{ role: "system", content: instructions }, { role: "user", content: userContent }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`The AI provider could not generate the site (${response.status}).`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
    const output = payload.choices?.[0]?.message?.content || "";
    const generatedHtml = extractDocument(output);
    const html = ensureTokenImage(generatedHtml,
      typeof projectFacts.imageUrl === "string" ? projectFacts.imageUrl : undefined,
      typeof projectFacts.name === "string" ? projectFacts.name : undefined,
      typeof projectFacts.contractAddress === "string" ? projectFacts.contractAddress : undefined);
    if (!html || html.length > MAX_HTML_LENGTH) throw new Error("The AI returned incomplete website code. Please try again.");
    const comment = output.match(/<!--\s*VIBEKIT_REPLY:\s*([\s\S]*?)\s*-->/i)?.[1] || "";
    const reply = comment.split(/;\s*VIBEKIT_ACTION:/i)[0]?.trim().slice(0, 300) || "I updated the website. Check the preview and tell me what to refine.";
    const answerOnly = /VIBEKIT_ACTION:\s*answer/i.test(comment);
    if (mode === "edit" && html === previousHtml && !answerOnly) throw new Error("The AI did not change the website. Please be more specific.");
    let creditsRemaining: string | undefined;
    if (owner && reservation) {
      const estimated = Math.ceil((instructions.length + userContent.length + html.length) / 4);
      const actual = BigInt(Math.max(1, Math.floor(payload.usage?.total_tokens || estimated)));
      creditsRemaining = (await settleGenerationCredits(owner, reservation.reserved, actual)).toString();
      settled = true;
    }
    return NextResponse.json({ html, reply, changed: !answerOnly, creditsRemaining });
  } catch (error) {
    await refund();
    return NextResponse.json({ error: error instanceof Error ? error.message : "The AI could not build this site." }, { status: 502 });
  }
}
