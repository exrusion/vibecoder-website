"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Bot, Brush, Check, Copy, Download, Gamepad2, Globe2, Image as ImageIcon, LockKeyhole, Megaphone, Plus, Search, ShieldCheck, Sparkles, Trophy, WandSparkles } from "lucide-react";
import { toast } from "sonner";

export type SiteSection = { id: string; type: string; title: string; body: string; cta: string };
export type ToolProject = {
  name: string; ticker: string; accent: string; contractAddress?: string; imageUrl?: string;
  priceUsd?: string; marketCap?: number; liquidity?: number; volume24h?: number;
  pairAddress?: string; dexScreenerUrl?: string; website?: string; twitter?: string;
  sections?: SiteSection[]; socialFeed?: string; game?: "clicker" | "memory";
  gateUrl?: string; raidUrl?: string; agentKnowledge?: string;
  brand?: { primary: string; secondary: string; background: string; tagline: string; font: string; motif: string };
};
type TokenResult = { address: string; name: string; symbol: string; imageUrl: string; priceUsd: string; marketCap: number | null; liquidity: number | null; volume24h: number | null; priceChange24h: number | null; pairAddress: string; chartUrl: string; website: string; twitter: string; buyUrl: string; pairCount: number; holders: null };
type Brand = NonNullable<ToolProject["brand"]>;
type ToolId = "token" | "brand" | "section" | "gate" | "raid" | "agent" | "game" | "meme" | "social";

const tools = [
  { id: "token", name: "Token Intelligence", icon: Search, subtitle: "Live market data, chart and buy link" },
  { id: "brand", name: "AI Brand Kit", icon: Brush, subtitle: "Logo, banner, favicon and palette" },
  { id: "section", name: "Section Generator", icon: WandSparkles, subtitle: "Add polished sections to your site" },
  { id: "gate", name: "Holder Gate", icon: LockKeyhole, subtitle: "Verified wallet-only content" },
  { id: "raid", name: "Community Raid Board", icon: Trophy, subtitle: "Tasks, proof review and leaderboard" },
  { id: "agent", name: "AI Community Agent", icon: Bot, subtitle: "Answer from your supplied knowledge" },
  { id: "game", name: "Mini-Game Generator", icon: Gamepad2, subtitle: "Playable community games" },
  { id: "meme", name: "Meme Studio", icon: ImageIcon, subtitle: "Upload a mascot and export memes" },
  { id: "social", name: "Live Social Feed", icon: Megaphone, subtitle: "Embed the official X timeline" },
] as const;
const sectionTypes = ["Hero", "About", "Tokenomics", "Roadmap", "Team", "FAQ", "Community", "Buy"];
const palette: Brand = { primary: "#8068e9", secondary: "#8ed6c6", background: "#17151e", tagline: "A better corner of Solana", font: "Georgia", motif: "orbit" };
const safeText = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || "");
const fmt = (amount: number | null | undefined) => amount == null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(amount);
const validXHandle = (value: string) => (value.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/)?.[1] || value.replace(/^@/, "").match(/^[A-Za-z0-9_]{1,15}$/)?.[0] || "");

function brandSvg(project: ToolProject, brand: Brand, kind: "logo" | "banner" | "favicon" | "social") {
  const wide = kind === "banner";
  const size = wide ? [1500, 500] : kind === "favicon" ? [256, 256] : [1000, 1000];
  const [width, height] = size;
  const center = wide ? 255 : width / 2;
  const title = safeText(project.name.slice(0, 32));
  const tagline = safeText(brand.tagline.slice(0, 60));
  const initial = safeText(project.name.trim().charAt(0).toUpperCase() || "V");
  const motif = brand.motif === "pixel"
    ? '<rect x="-115" y="-115" width="230" height="230" rx="28" fill="' + brand.primary + '"/><rect x="78" y="-80" width="77" height="77" fill="' + brand.secondary + '"/>'
    : brand.motif === "star"
      ? '<path d="M0-158 42-45 154 0 42 45 0 158-42 45-154 0-42-45Z" fill="' + brand.primary + '"/>'
      : '<circle r="138" fill="' + brand.primary + '"/><ellipse rx="210" ry="75" fill="none" stroke="' + brand.secondary + '" stroke-width="16" transform="rotate(-28)"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><rect width="100%" height="100%" fill="' + brand.background + '"/><circle cx="' + (width * .88) + '" cy="' + (height * .12) + '" r="' + (height * .28) + '" fill="' + brand.primary + '" opacity=".12"/><g transform="translate(' + center + ' ' + (wide ? 250 : kind === "favicon" ? 128 : 405) + ')">' + motif + '<text x="0" y="42" fill="#fff" text-anchor="middle" font-family="' + safeText(brand.font) + '" font-size="' + (kind === "favicon" ? 118 : 138) + '" font-weight="700">' + initial + '</text></g>' + (kind === "favicon" ? "" : '<text x="' + (wide ? 490 : 500) + '" y="' + (wide ? 238 : 730) + '" text-anchor="' + (wide ? "start" : "middle") + '" fill="#fff" font-family="' + safeText(brand.font) + '" font-size="' + (wide ? 84 : 84) + '">' + title + '</text><text x="' + (wide ? 494 : 500) + '" y="' + (wide ? 303 : 798) + '" text-anchor="' + (wide ? "start" : "middle") + '" fill="' + brand.secondary + '" font-family="Arial" font-size="' + (wide ? 29 : 27) + '">' + tagline + '</text>') + '</svg>';
}
function exportSvg(project: ToolProject, brand: Brand, kind: "logo" | "banner" | "favicon" | "social") {
  const blob = new Blob([brandSvg(project, brand, kind)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + kind + ".svg"; link.click();
  URL.revokeObjectURL(url);
}
function downloadMeme(source: string, top: string, bottom: string) {
  const image = new window.Image();
  image.onload = () => {
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1080;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = "#17151e"; context.fillRect(0, 0, 1080, 1080);
    const scale = Math.max(1080 / image.width, 1080 / image.height);
    context.drawImage(image, (1080 - image.width * scale) / 2, (1080 - image.height * scale) / 2, image.width * scale, image.height * scale);
    context.font = "bold 76px Impact, Arial Black, sans-serif"; context.textAlign = "center"; context.fillStyle = "#fff"; context.strokeStyle = "#111"; context.lineWidth = 9; context.lineJoin = "round";
    [top, bottom].forEach((line, index) => {
      const words = line.trim().toUpperCase().split(/\s+/); const rows: string[] = []; let current = "";
      for (const word of words) { const next = current ? current + " " + word : word; if (context.measureText(next).width > 940 && current) { rows.push(current); current = word; } else current = next; }
      if (current) rows.push(current);
      rows.forEach((row, i) => { const y = index ? 1050 - (rows.length - 1 - i) * 84 : 90 + i * 84; context.strokeText(row, 540, y, 990); context.fillText(row, 540, y, 990); });
    });
    canvas.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "vibecoder-meme.png"; link.click(); URL.revokeObjectURL(url); }, "image/png");
  };
  image.src = source;
}

export default function ToolsWorkbench({ project, onChange, apiKey, onCreditBalance }: {
  project: ToolProject; onChange: (patch: Partial<ToolProject>) => void; apiKey: string; onCreditBalance: (balance: string) => void;
}) {
  const [active, setActive] = useState<ToolId>("token");
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState(project.contractAddress || "");
  const [token, setToken] = useState<TokenResult | null>(null);
  const [brief, setBrief] = useState("");
  const [brand, setBrand] = useState<Brand>(project.brand || palette);
  const [sectionType, setSectionType] = useState("Hero");
  const [sectionRequest, setSectionRequest] = useState("");
  const [gateName, setGateName] = useState(project.name + " holder room");
  const [gateMinimum, setGateMinimum] = useState("1000000");
  const [gateContent, setGateContent] = useState("");
  const [gateType, setGateType] = useState("announcement");
  const [raidName, setRaidName] = useState(project.name + " community raids");
  const [raidTasks, setRaidTasks] = useState([{ label: "Follow our X", url: project.twitter || "", points: 10 }]);
  const [knowledge, setKnowledge] = useState(project.agentKnowledge || "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [game, setGame] = useState<"clicker" | "memory">(project.game || "clicker");
  const [score, setScore] = useState(0);
  const [cards, setCards] = useState<number[]>(() => [0, 1, 2, 3, 0, 1, 2, 3].map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(item => item.value));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [memeImage, setMemeImage] = useState("");
  const [memeTop, setMemeTop] = useState("WHEN THE CHART");
  const [memeBottom, setMemeBottom] = useState("FINALLY GOES UP");
  const [xHandle, setXHandle] = useState(validXHandle(project.socialFeed || project.twitter || ""));
  const memeFileRef = useRef<HTMLInputElement>(null);

  const restartMemory = () => {
    setCards([0, 1, 2, 3, 0, 1, 2, 3].map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(item => item.value));
    setMatched([]); setFlipped([]); setScore(0);
  };
  const ai = async (kind: "brand" | "section" | "agent", prompt: string, context: string) => {
    setBusy(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.trim()) headers["x-openrouter-key"] = apiKey.trim();
      const response = await fetch("/api/tools/ai", { method: "POST", headers, body: JSON.stringify({ kind, prompt, context, sectionType }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI request failed.");
      if (payload.creditsRemaining) onCreditBalance(payload.creditsRemaining);
      return payload.result;
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI request failed."); return null; }
    finally { setBusy(false); }
  };
  const inspectToken = async () => {
    setBusy(true); setToken(null);
    try {
      const response = await fetch("/api/tools/token?address=" + encodeURIComponent(address.trim()));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setToken(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Lookup failed."); }
    finally { setBusy(false); }
  };
  const makeBrand = async () => {
    const result = await ai("brand", brief || "Create a playful distinct Solana brand kit for " + project.name, project.name + " " + project.ticker);
    if (result) { const next = result as Brand; setBrand(next); onChange({ accent: next.primary, brand: next }); toast.success("Brand kit added to project"); }
  };
  const addSection = async () => {
    const result = await ai("section", sectionRequest || "Create a distinctive " + sectionType + " section", project.name + " " + project.ticker + " " + (project.contractAddress || ""));
    if (result) {
      const spec = result as { title: string; body: string; cta?: string };
      onChange({ sections: [...(project.sections || []), { id: crypto.randomUUID(), type: sectionType, title: String(spec.title).slice(0, 120), body: String(spec.body).slice(0, 800), cta: String(spec.cta || "").slice(0, 60) }] });
      toast.success(sectionType + " added to the site");
    }
  };
  const createGate = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/tools/gate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: gateName, mint: address || project.contractAddress, minimum: gateMinimum, content: gateContent, contentType: gateType }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      onChange({ gateUrl: data.url }); toast.success("Private holder link created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create gate."); }
    finally { setBusy(false); }
  };
  const createRaid = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/tools/raids", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: raidName, tasks: raidTasks }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      onChange({ raidUrl: data.url }); toast.success("Raid board created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create raid board."); }
    finally { setBusy(false); }
  };
  const pickMeme = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8_000_000) { toast.error("Choose an image smaller than 8 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setMemeImage(String(reader.result || "")); reader.readAsDataURL(file);
  };
  const flipCard = (index: number) => {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    const next = [...flipped, index]; setFlipped(next);
    if (next.length === 2) {
      if (cards[next[0]] === cards[next[1]]) { setMatched(current => [...current, ...next]); setFlipped([]); setScore(value => value + 10); }
      else window.setTimeout(() => setFlipped([]), 700);
    }
  };
  const copyLink = (path: string) => { void navigator.clipboard.writeText(window.location.origin + path).then(() => toast.success("Link copied")); };
  const socialHandle = validXHandle(xHandle);

  return <section className="tools-view"><div className="tools-intro"><span><Sparkles /> THE CREATOR TOOLBOX</span><h1>More than a site.<br /><em>A whole community.</em></h1><p>Power up <strong>{project.name}</strong> with live data, content, gated access and playable experiences.</p></div>
    <div className="tools-layout"><nav className="tools-list" aria-label="Creator tools">{tools.map(tool => <button key={tool.id} className={active === tool.id ? "selected" : ""} onClick={() => setActive(tool.id)}><span><tool.icon /></span><div><strong>{tool.name}</strong><small>{tool.subtitle}</small></div><ArrowRight /></button>)}</nav>
    <div className="tool-detail">
      {active === "token" && <><div className="tool-title"><Search /><div><h2>Token Intelligence</h2><p>Pull verified pair data from DexScreener and add it to your site.</p></div></div><label>Solana contract address</label><div className="tool-input-action"><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Paste a Solana CA" /><button onClick={inspectToken} disabled={busy}>{busy ? "Looking up…" : "Inspect token"}</button></div>{token && <div className="token-result"><div className="token-result-head">{token.imageUrl && <img src={token.imageUrl} alt="" />}<div><h3>{token.name} <span>{"$"}{token.symbol}</span></h3><small>{token.address}</small></div></div><div className="token-metrics"><div><small>Price</small><strong>{"$"}{token.priceUsd || "—"}</strong></div><div><small>Market cap</small><strong>{"$"}{fmt(token.marketCap)}</strong></div><div><small>Liquidity</small><strong>{"$"}{fmt(token.liquidity)}</strong></div><div><small>24h volume</small><strong>{"$"}{fmt(token.volume24h)}</strong></div></div><p className="tool-note">Holder count is not provided by DexScreener, so it is not shown as a live metric.</p><a href={token.chartUrl} target="_blank" rel="noopener noreferrer">Live chart <ArrowUpRight /></a><a href={token.buyUrl} target="_blank" rel="noopener noreferrer">Buy on Jupiter <ArrowUpRight /></a><button onClick={() => { onChange({ name: token.name, ticker: "$" + token.symbol, contractAddress: token.address, imageUrl: token.imageUrl, priceUsd: token.priceUsd, marketCap: token.marketCap || undefined, liquidity: token.liquidity || undefined, volume24h: token.volume24h || undefined, pairAddress: token.pairAddress, dexScreenerUrl: token.chartUrl, twitter: token.twitter, website: token.website }); toast.success("Live token data added to preview"); }}>Add token to site <ArrowRight /></button></div>}</>}
      {active === "brand" && <><div className="tool-title"><Brush /><div><h2>AI Brand Kit</h2><p>Generate brand direction, then export ready-to-use SVG assets.</p></div></div><label>Brand direction</label><textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="Pixel-art Solana mascot, playful but premium…" /><button className="tool-primary" onClick={makeBrand} disabled={busy}>{busy ? "Generating…" : "Generate brand kit"} <Sparkles /></button><div className="brand-preview" style={{ background: brand.background }}><div dangerouslySetInnerHTML={{ __html: brandSvg(project, brand, "banner") }} /></div><div className="swatches">{[brand.primary, brand.secondary, brand.background].map(color => <button key={color} onClick={() => void navigator.clipboard.writeText(color).then(() => toast.success("Color copied"))}><i style={{ background: color }} />{color}</button>)}</div><div className="tool-action-grid">{(["logo","banner","favicon","social"] as const).map(kind => <button key={kind} onClick={() => exportSvg(project, brand, kind)}><Download /> {kind} SVG</button>)}</div><p className="tool-note">AI generates the visual direction; exportable vector art is composed from that palette and motif.</p></>}
      {active === "section" && <><div className="tool-title"><WandSparkles /><div><h2>Section Generator</h2><p>Generate a section and immediately see it in the project preview.</p></div></div><label>Section type</label><div className="tool-chip-row">{sectionTypes.map(type => <button key={type} className={sectionType === type ? "chosen" : ""} onClick={() => setSectionType(type)}>{type}</button>)}</div><label>What should it say?</label><textarea value={sectionRequest} onChange={e => setSectionRequest(e.target.value)} placeholder="Talk about our weekly community tournaments and holder perks…" /><button className="tool-primary" onClick={addSection} disabled={busy}>{busy ? "Writing…" : "Generate & add " + sectionType} <ArrowRight /></button><div className="tool-list-preview">{project.sections?.map(section => <article key={section.id}><small>{section.type}</small><strong>{section.title}</strong><span>{section.body}</span><button onClick={() => onChange({ sections: project.sections?.filter(item => item.id !== section.id) })}>Remove</button></article>)}</div></>}
      {active === "gate" && <><div className="tool-title"><LockKeyhole /><div><h2>Holder Gate</h2><p>Create a shareable private page checked against a signed Solana wallet.</p></div></div><label>Gate title</label><input value={gateName} onChange={e => setGateName(e.target.value)} /><label>Token mint / CA</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Your token's mint address" /><label>Minimum token balance</label><input value={gateMinimum} onChange={e => setGateMinimum(e.target.value)} inputMode="decimal" /><label>Unlock experience</label><select value={gateType} onChange={e => setGateType(e.target.value)}><option value="announcement">Private announcement</option><option value="download">Text download</option><option value="game">Game access message</option></select><label>Private content</label><textarea value={gateContent} onChange={e => setGateContent(e.target.value)} placeholder="This stays on the server and appears only after wallet verification." /><button className="tool-primary" onClick={createGate} disabled={busy}>{busy ? "Saving…" : "Create verified gate"} <ShieldCheck /></button>{project.gateUrl && <div className="tool-live-link"><Check /><span>{project.gateUrl}</span><button onClick={() => copyLink(project.gateUrl || "")}><Copy /></button><a href={project.gateUrl} target="_blank" rel="noopener noreferrer"><ArrowUpRight /></a></div>}<p className="tool-note">Unlock requires a Phantom signature and a live RPC balance check. Game gating currently unlocks a message; full game hosting requires the public-site publisher.</p></>}
      {active === "raid" && <><div className="tool-title"><Trophy /><div><h2>Community Raid Board</h2><p>Members submit proof; creators approve it before points enter the leaderboard.</p></div></div><label>Board name</label><input value={raidName} onChange={e => setRaidName(e.target.value)} />{raidTasks.map((task, index) => <div className="raid-task-editor" key={index}><input value={task.label} placeholder="Task, e.g. repost our launch" onChange={e => setRaidTasks(items => items.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} /><input value={task.url} placeholder="https://x.com/... or https://t.me/..." onChange={e => setRaidTasks(items => items.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} /><input value={task.points} type="number" min="1" max="1000" aria-label="Task points" onChange={e => setRaidTasks(items => items.map((item, i) => i === index ? { ...item, points: Number(e.target.value) } : item))} /></div>)}<button className="tool-outline" onClick={() => setRaidTasks(items => [...items, { label: "", url: "", points: 10 }])}><Plus /> Add task</button><button className="tool-primary" onClick={createRaid} disabled={busy}>{busy ? "Saving…" : "Create raid board"} <ArrowRight /></button>{project.raidUrl && <div className="tool-live-link"><Check /><span>{project.raidUrl}</span><button onClick={() => copyLink(project.raidUrl || "")}><Copy /></button><a href={project.raidUrl} target="_blank" rel="noopener noreferrer"><ArrowUpRight /></a></div>}<p className="tool-note">X and Telegram actions are not automatically verified. The creator must review proof links before awarding points.</p></>}
      {active === "agent" && <><div className="tool-title"><Bot /><div><h2>AI Community Agent</h2><p>Ground answers in your project details and pasted knowledge.</p></div></div><label>Project knowledge</label><textarea value={knowledge} onChange={e => setKnowledge(e.target.value)} placeholder="Paste website copy, docs, FAQs, X announcements or token details here…" /><button className="tool-outline" onClick={() => { onChange({ agentKnowledge: knowledge }); toast.success("Knowledge saved in this project"); }}>Save knowledge</button><label>Test a visitor question</label><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What does this project do?" /><button className="tool-primary" disabled={busy || !question.trim()} onClick={async () => { const result = await ai("agent", question, "Project: " + project.name + "\\nToken: " + project.ticker + "\\nKnowledge: " + knowledge); if (result) setAnswer(String(result)); }}>{busy ? "Thinking…" : "Ask agent"} <ArrowRight /></button>{answer && <div className="agent-answer"><Bot /> <p>{answer}</p></div>}<p className="tool-note">The agent uses pasted material; it does not automatically crawl a website or X account. Site-visitor deployment needs a published-site endpoint.</p></>}
      {active === "game" && <><div className="tool-title"><Gamepad2 /><div><h2>Mini-Game Generator</h2><p>Choose a playable game for your site. Scores stay in this browser session.</p></div></div><div className="tool-chip-row"><button className={game === "clicker" ? "chosen" : ""} onClick={() => { setGame("clicker"); setScore(0); }}>Clicker</button><button className={game === "memory" ? "chosen" : ""} onClick={() => { setGame("memory"); restartMemory(); }}>Memory match</button></div><div className="game-preview"><span>{project.ticker} ARCADE</span><h3>{game === "clicker" ? "Tap to the moon" : "Find the matching pairs"}</h3><strong>{score} points</strong>{game === "clicker" ? <button className="game-tap" onClick={() => setScore(value => value + 1)}>{project.imageUrl ? <img src={project.imageUrl} alt="" /> : project.name.charAt(0)}</button> : <div className="game-cards">{cards.map((value, index) => <button key={index} onClick={() => flipCard(index)}>{flipped.includes(index) || matched.includes(index) ? ["✦","☾","◇","⚡"][value] : "?"}</button>)}</div>}</div><button className="tool-primary" onClick={() => { onChange({ game }); toast.success(game + " added to the site preview"); }}>Add {game} to site <ArrowRight /></button><p className="tool-note">Scores are local to each browser; a cross-user leaderboard needs published-site identity and storage.</p></>}
      {active === "meme" && <><div className="tool-title"><ImageIcon /><div><h2>Meme Studio</h2><p>Turn your mascot image into a shareable square meme.</p></div></div><input ref={memeFileRef} type="file" accept="image/*" hidden onChange={pickMeme} /><button className="tool-outline" onClick={() => memeFileRef.current?.click()}><ImageIcon /> Upload mascot image</button><label>Top caption</label><input value={memeTop} onChange={e => setMemeTop(e.target.value)} maxLength={90} /><label>Bottom caption</label><input value={memeBottom} onChange={e => setMemeBottom(e.target.value)} maxLength={90} /><div className="meme-preview" style={memeImage ? { backgroundImage: "url(" + memeImage + ")" } : {}}><b>{memeTop}</b>{!memeImage && <span>UPLOAD A MASCOT TO PREVIEW</span>}<b>{memeBottom}</b></div><button className="tool-primary" disabled={!memeImage} onClick={() => downloadMeme(memeImage, memeTop, memeBottom)}>Export PNG <Download /></button><p className="tool-note">Your image stays in your browser; this studio overlays text and exports a real 1080px PNG. AI image generation is not connected yet.</p></>}
      {active === "social" && <><div className="tool-title"><Megaphone /><div><h2>Live Social Feed</h2><p>Add X&apos;s official embedded timeline to your community site.</p></div></div><label>X handle or profile link</label><div className="tool-input-action"><input value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="@yourproject" /><button disabled={!socialHandle} onClick={() => { onChange({ socialFeed: socialHandle }); toast.success("X timeline added to site"); }}>Add feed</button></div>{project.socialFeed && <div className="social-preview"><Globe2 /><strong>@{project.socialFeed}</strong><span>Official X timeline will load in your site preview when allowed by X and the visitor&apos;s browser.</span><a href={"https://x.com/" + project.socialFeed} target="_blank" rel="noopener noreferrer">View profile <ArrowUpRight /></a></div>}<p className="tool-note">This is an X embed, not scraped content. Availability depends on X&apos;s widget service and visitors&apos; privacy settings.</p></>}
    </div></div>
  </section>;
}
