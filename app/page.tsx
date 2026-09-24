"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUp, BarChart3, Check, ChevronRight, Code2,
  Coins, Copy, Download, ExternalLink, Folder, Gamepad2, Gift, GitBranch, Globe2, History,
  Image as ImageIcon, LayoutGrid, Link2, LoaderCircle, Menu, Monitor,
  LogOut, MoreHorizontal, Palette, Plus, Rocket, Search, Settings, ShieldCheck, Smartphone,
  Sparkles, Undo2, Upload, Wallet, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { startXSignIn } from "@/lib/x-signin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import ToolsWorkbench, { type ToolProject } from "@/components/tools-workbench";
import Script from "next/script";
import Image from "next/image";

type MainView = "create" | "projects" | "gallery" | "tools";
type BuilderSource = "prompt" | "import" | "screenshot";
type PreviewMode = "preview" | "code";
type DeviceMode = "desktop" | "mobile";
type Project = ToolProject & { id: string; prompt: string; theme: "light" | "dark"; updated: string; published?: string; headline?: string; subline?: string; description?: string };
type ChatMessage = { role: "user" | "assistant"; text: string };
type CreditStatus = {
  authenticated: boolean;
  configured: boolean;
  user?: { username: string; displayName: string; avatarUrl: string; walletAddress: string | null; balance: string; lifetimeSpent: string; lastHolderClaim: string | null };
  grants?: { welcome: string; dailyHolder: string; holderThreshold: string };
  holder?: { configured: boolean; eligible: boolean; holding: string; threshold: string; granted: boolean; claimedToday: boolean };
};
type PhantomProvider = {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signMessage: (message: Uint8Array, encoding: "utf8") => Promise<{ signature: Uint8Array }>;
};
type ModelContextApi = {
  registerTool: (tool: {
    name: string;
    title?: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: unknown) => unknown | Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

const galleryItems = [
  { name: "Mochi Club", type: "Token home", description: "Soft launch page with chart, socials and a direct buy flow.", accent: "#8cc7ff", bg: "#f4f8ff", icon: "M" },
  { name: "Pixel Pals", type: "Community game", description: "A daily holder challenge with points and a live leaderboard.", accent: "#ef6d4f", bg: "#fff3ee", icon: "P" },
  { name: "Moon Bureau", type: "Token dashboard", description: "A clean market dashboard for holders, treasury and updates.", accent: "#ae95ff", bg: "#f4f0ff", icon: "◐" },
  { name: "Cactus Run", type: "Mini game", description: "An arcade landing page built for weekly community contests.", accent: "#8fcf68", bg: "#f3faec", icon: "✦" },
  { name: "Degen Radio", type: "Media hub", description: "A live community radio page with schedule and token access.", accent: "#ffc85b", bg: "#fff8e6", icon: "D" },
  { name: "Feral Finance", type: "Analytics", description: "Token metrics, holder activity and treasury in one view.", accent: "#7dd3c7", bg: "#edfbf8", icon: "F" },
];

const starterIdeas = [
  { title: "Token home", text: "Build a beautiful token website with a live chart, roadmap and buy button", icon: Globe2 },
  { title: "Community game", text: "Make a retro clicker game for our holders with a weekly leaderboard", icon: Gamepad2 },
  { title: "Holder dashboard", text: "Create a clean dashboard for token stats, treasury and community updates", icon: BarChart3 },
];

const initialProjects: Project[] = [
  { id: "mochi-club", name: "Mochi Club", prompt: "A playful token home with a live chart and roadmap", ticker: "$MOCHI", accent: "#98c8ff", theme: "light", updated: "18 min ago", published: "mochi.vibekit.io" },
  { id: "feral-dashboard", name: "Feral Dashboard", prompt: "A holder dashboard with treasury and community activity", ticker: "$FERAL", accent: "#9fd4a1", theme: "dark", updated: "Yesterday" },
];

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={small ? "brand-mark brand-mark-small" : "brand-mark"} aria-hidden="true"><Image src="/vibecoder-logo.png" alt="" width={44} height={44} priority={!small} /></span>;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/\$|[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 30);
}

function compactUsd(value?: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function compactCredits(value?: string) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function formatPrice(value?: string) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return "—";
  const maximumFractionDigits = price >= 1 ? 4 : price >= 0.01 ? 6 : 10;
  return `$${price.toLocaleString("en-US", { maximumFractionDigits })}`;
}

function dexChartUrl(project: Project) {
  const marketId = project.pairAddress || project.contractAddress;
  if (!marketId) return "";
  const theme = project.theme === "dark" ? "dark" : "light";
  return `https://dexscreener.com/solana/${encodeURIComponent(marketId)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=${theme}&theme=${theme}`;
}

function dexMarketUrl(project: Project) {
  const marketId = project.pairAddress || project.contractAddress;
  return project.dexScreenerUrl || (marketId ? `https://dexscreener.com/solana/${encodeURIComponent(marketId)}` : "");
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 5)}…${value.slice(-5)}` : "Not linked";
}

function inferProject(prompt: string, importValue = "") {
  const source = `${prompt} ${importValue}`.toLowerCase();
  let name = "Orbit Club";
  let ticker = "$ORBIT";
  let accent = "#b9a7ff";
  let theme: "light" | "dark" = source.includes("dark") || source.includes("cyber") ? "dark" : "light";
  if (source.includes("frog")) { name = "Frog House"; ticker = "$FROG"; accent = "#a7e96b"; }
  else if (source.includes("cat") || source.includes("meow")) { name = "Meow Club"; ticker = "$MEOW"; accent = "#ffc35a"; }
  else if (source.includes("dog") || source.includes("shiba")) { name = "Neon Dog"; ticker = "$NDOG"; accent = "#ff8b6b"; }
  else if (source.includes("moon")) { name = "Moon Bureau"; ticker = "$MOON"; accent = "#ae95ff"; }
  else if (source.includes("pepe")) { name = "Pepe Garden"; ticker = "$PEPE"; accent = "#8dd6cb"; }
  else if (source.includes("dashboard")) { name = "Token Atlas"; ticker = "$ATLAS"; accent = "#86b8ff"; }
  if (source.includes("red")) accent = "#ff6b5d";
  if (source.includes("blue")) accent = "#74adff";
  if (source.includes("green")) accent = "#98d66f";
  if (source.includes("orange")) accent = "#ffad5c";
  if (source.includes("purple")) accent = "#b9a7ff";
  if (source.includes("light")) theme = "light";
  return { name, ticker, accent, theme };
}

function projectCode(project: Project) {
  const chartUrl = dexChartUrl(project);
  return `import { WalletButton } from "@vibecoder/solana";

export default function ${project.name.replace(/\s/g, "")}() {
  return (
    <main data-theme="${project.theme}">
      <nav>
        <strong>${project.name}</strong>
        <WalletButton />
      </nav>

      <section className="hero">
        <span>${project.ticker} · Solana</span>
        <h1>${project.headline || "A small token with a big orbit."}</h1>
        <p>${project.subline || "Built by the community, for the community."}</p>
        <code>${project.contractAddress || "Add your token address"}</code>
        <a href="#buy">Buy ${project.ticker}</a>
      </section>

      ${chartUrl ? `<section id="market" className="market-chart">
        <div>
          <span>LIVE ON DEXSCREENER</span>
          <h2>${project.ticker} market</h2>
        </div>
        <iframe
          title="${project.name} live DexScreener chart"
          src="${chartUrl}"
          loading="lazy"
          allowFullScreen
        />
      </section>` : `<section id="market"><p>A live chart appears when the token has an active DexScreener pair.</p></section>`}
    </main>
  );
}`;
}

function SiteGame({ project }: { project: Project }) {
  const [score, setScore] = useState(0);
  const [target, setTarget] = useState(0);
  const [found, setFound] = useState<number[]>([]);
  return <section className="mini-feature mini-game-feature"><small>COMMUNITY ARCADE</small><h3>{project.game === "clicker" ? "Tap to the moon" : "Find the pairs"}</h3><p>{project.name} mini-game · {score} points</p>{project.game === "clicker" ? <button onClick={() => setScore(value => value + 1)}>{project.imageUrl ? <img src={project.imageUrl} alt="" /> : project.name.charAt(0)}</button> : <div className="mini-memory">{[0,1,0,1].map((value,index) => <button key={index} disabled={found.includes(index)} onClick={() => { if (target === value) { setFound(items => [...items,index]); setScore(points => points+10); setTarget(1-target); } }}>{found.includes(index) ? "✓" : "?"}</button>)}</div>}</section>;
}

function MiniSite({ project, mobile = false }: { project: Project; mobile?: boolean }) {
  return (
    <div className={`mini-site ${project.theme === "dark" ? "mini-site-dark" : ""} ${mobile ? "mini-site-mobile" : ""}`} style={{ "--site-accent": project.accent } as React.CSSProperties}>
      <nav className="mini-nav">
        <div className="mini-wordmark"><span className="mini-token-orb">{project.imageUrl ? <img src={project.imageUrl} alt="" /> : project.name.charAt(0)}</span><strong>{project.name}</strong></div>
        <div className="mini-links"><span>Story</span><span>Market</span><span>Community</span></div>
        <button>Buy {project.ticker}</button>
      </nav>
      <section className="mini-hero">
        <div className="mini-copy">
          <span className="mini-kicker">{project.ticker} · BUILT ON SOLANA</span>
          <h2>{project.headline || "A small token with a big orbit."}</h2>
          <p>{project.subline || project.description || "Made by people who still believe the internet should be fun."}</p>
          <div className="mini-actions"><button>Buy on Solana <ArrowRight /></button><a href="#market">View live chart</a></div>
          {project.contractAddress && <button className="contract-pill" onClick={() => navigator.clipboard?.writeText(project.contractAddress || "")}><span>CA</span><code>{shortAddress(project.contractAddress)}</code><Copy /></button>}
        </div>
        <div className="token-scene" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className={`token-coin ${project.imageUrl ? "token-coin-image" : ""}`}>{project.imageUrl ? <img src={project.imageUrl} alt="" /> : <span>{project.name.charAt(0)}</span>}</div><i className="spark spark-one" /><i className="spark spark-two" /></div>
      </section>
      <section className="mini-stats">
        <div><span>Price</span><strong>{formatPrice(project.priceUsd)}</strong></div><div><span>Market cap</span><strong>{compactUsd(project.marketCap)}</strong></div><div><span>Liquidity</span><strong>{compactUsd(project.liquidity)}</strong></div><div><span>24h volume</span><strong>{compactUsd(project.volume24h)}</strong></div>
      </section>
      <section className="mini-market" id="market">
        <div className="mini-market-heading">
          <div><span>LIVE MARKET</span><h3>{project.ticker} on DexScreener</h3></div>
          {dexMarketUrl(project) && <a href={dexMarketUrl(project)} target="_blank" rel="noreferrer">Open DexScreener <ExternalLink /></a>}
        </div>
        {(project.pairAddress || project.contractAddress) ? <div className="dex-chart-shell"><iframe title={`${project.name} live DexScreener chart`} src={dexChartUrl(project)} loading="lazy" allowFullScreen /></div> : <div className="dex-chart-empty"><BarChart3 /><strong>Chart waiting for a live pair</strong><span>DexScreener will appear here as soon as this token has an active Solana market.</span></div>}
        <div className="mini-market-foot"><span>Real-time chart by DexScreener</span><code>{(project.pairAddress || project.contractAddress) ? shortAddress(project.pairAddress || project.contractAddress) : "No pair detected"}</code></div>
      </section>
      <section className="mini-about">
        <div><span>01 / THE PROJECT</span><h3>{project.name} is live on Solana.</h3></div>
        <p>{project.description || `${project.name} is a community-led token with a clear home for its story, market data, and community links.`}</p>
      </section>
      {project.sections?.map(section => <section key={section.id} className="mini-feature"><small>{section.type.toUpperCase()}</small><h3>{section.title}</h3><p>{section.body}</p>{section.cta && <span>{section.cta} <ArrowRight /></span>}</section>)}
      {project.game && <SiteGame project={project} />}
      {(project.gateUrl || project.raidUrl) && <section className="mini-feature mini-feature-links"><small>COMMUNITY TOOLS</small><h3>There is more to join.</h3><div>{project.gateUrl && <a href={project.gateUrl} target="_blank" rel="noopener noreferrer">Holder room <ArrowRight /></a>}{project.raidUrl && <a href={project.raidUrl} target="_blank" rel="noopener noreferrer">Community raids <ArrowRight /></a>}</div></section>}
      {project.socialFeed && <section className="mini-feature mini-social"><small>LIVE FROM X</small><h3>From the community.</h3><a className="twitter-timeline" data-height="430" href={`https://x.com/${project.socialFeed}`}>Posts from @{project.socialFeed}</a><Script src="https://platform.twitter.com/widgets.js" strategy="afterInteractive" onLoad={() => { const widget = (window as Window & { twttr?: { widgets?: { load?: () => void } } }).twttr; widget?.widgets?.load?.(); }} /></section>}
      <section className="mini-community">
        <div><span>CONTRACT</span><strong>{project.contractAddress || "Connect a token to show its contract"}</strong></div>
        <div className="mini-community-links">{project.website && <a href={project.website}>Website <ExternalLink /></a>}{project.twitter && <a href={project.twitter}>X / Twitter <ExternalLink /></a>}<a href="#market">Live chart <ArrowRight /></a></div>
      </section>
      <footer className="mini-footer"><strong>{project.name}</strong><span>{project.ticker} · Built on Solana</span></footer>
    </div>
  );
}

function StarterPreview({ item }: { item: (typeof galleryItems)[number] }) {
  return <div className="starter-preview" style={{ background: item.bg, "--preview-accent": item.accent } as React.CSSProperties}>
    <div className="starter-top"><span>{item.icon}</span><i /><i /><i /></div><div className="starter-title">{item.name}</div><div className="starter-pill">{item.type}</div><div className="starter-shape"><span>{item.icon}</span></div><div className="starter-lines"><i /><i /><i /></div>
  </div>;
}

export default function Home() {
  const [mainView, setMainView] = useState<MainView>("create");
  const [source, setSource] = useState<BuilderSource>("prompt");
  const [prompt, setPrompt] = useState("");
  const [importValue, setImportValue] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [current, setCurrent] = useState<Project>(initialProjects[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [editPrompt, setEditPrompt] = useState("");
  const [version, setVersion] = useState(1);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const [xLoginBusy, setXLoginBusy] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [publishSlug, setPublishSlug] = useState("mochi");
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [galleryFilter, setGalleryFilter] = useState("Featured");
  const [code, setCode] = useState(projectCode(initialProjects[0]));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("vibekit-projects") || window.localStorage.getItem("vibecoder-projects");
    if (saved) {
      try {
        // Hydrate projects once from the browser-only workspace cache.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProjects(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem("vibekit-projects");
      }
    }
  }, []);
  useEffect(() => { window.localStorage.setItem("vibekit-projects", JSON.stringify(projects)); }, [projects]);

  const refreshCredits = async () => {
    try {
      const response = await fetch("/api/credits", { cache: "no-store" });
      if (response.ok) {
        const status = await response.json() as CreditStatus;
        setCreditStatus(status);
        if (status.user?.walletAddress) setWalletAddress(status.user.walletAddress);
      }
    } catch { /* The builder remains usable with a personal key when account services are unavailable. */ }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/credits", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<CreditStatus> : null)
      .then(status => { if (active && status) setCreditStatus(status); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const effectivePrompt = useMemo(() => {
    if (source === "import") return `Create a polished Solana project site from ${importValue || "this project"}`;
    if (source === "screenshot") return prompt || "Recreate this visual direction for a Solana token community";
    return prompt;
  }, [source, prompt, importValue]);
  const filteredGallery = useMemo(() => galleryItems.filter(item => {
    if (galleryFilter === "Featured") return true;
    if (galleryFilter === "Token sites") return item.type === "Token home";
    if (galleryFilter === "Games") return item.type.includes("game");
    if (galleryFilter === "Dashboards") return item.type === "Token dashboard" || item.type === "Analytics";
    return item.type === "Media hub";
  }), [galleryFilter]);

  const startBuild = async (override?: string) => {
    const request = override || effectivePrompt;
    if (!request.trim()) { toast.error(source === "import" ? "Paste a token address or website first." : "Tell Vibekit what you want to build."); return; }
    setIsBuilding(true);
    let inferred: Partial<Project> & ReturnType<typeof inferProject> = inferProject(request, importValue);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.trim()) headers["x-openrouter-key"] = apiKey.trim();
      const [response] = await Promise.all([
        fetch("/api/generate", { method: "POST", headers, body: JSON.stringify({ prompt: request, tokenAddress, importValue }) }),
        new Promise(resolve => window.setTimeout(resolve, 850)),
      ]);
      const data = await response.json().catch(() => ({})) as { site?: Partial<Project>; error?: string; code?: string; creditsRemaining?: string };
      if (!response.ok) {
        if (response.status === 401 || data.code === "AUTH_REQUIRED") setCreditsOpen(true);
        if (response.status === 402 || data.code === "INSUFFICIENT_CREDITS") setCreditsOpen(true);
        toast.error(data.error || "The site could not be generated.");
        setIsBuilding(false);
        return;
      }
      if (response.ok) {
        if (data.site) {
          inferred = { ...inferred, ...data.site };
        }
        if (data.creditsRemaining) setCreditStatus(status => status?.user ? { ...status, user: { ...status.user, balance: data.creditsRemaining || status.user.balance } } : status);
      }
    } catch { /* The local design engine remains available when an AI provider is not configured. */ }
    const next: Project = { ...inferred, id: `${slugify(inferred.name || "project")}-${Date.now()}`, name: inferred.name || "Untitled project", prompt: request, ticker: inferred.ticker || "$TOKEN", accent: inferred.accent || "#7c5cff", theme: inferred.theme || "dark", updated: "Just now" };
    window.setTimeout(() => {
      setCurrent(next); setCode(projectCode(next));
      setMessages([{ role: "user", text: request }, { role: "assistant", text: `I built ${next.name} with a responsive token home, live market section and community links.` }]);
      setProjects(items => [next, ...items]); setPublishSlug(slugify(next.name)); setVersion(1); setWorkspaceOpen(true); setIsBuilding(false); window.scrollTo({ top: 0, behavior: "smooth" });
    }, 180);
  };

  const handleScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setScreenshotName(file.name);
    const reader = new FileReader(); reader.onload = () => setScreenshotUrl(String(reader.result || "")); reader.readAsDataURL(file);
  };

  const applyEdit = () => {
    if (!editPrompt.trim()) return;
    const request = editPrompt.trim(); const lower = request.toLowerCase(); const next = { ...current, updated: "Just now" };
    if (lower.includes("dark")) next.theme = "dark"; if (lower.includes("light")) next.theme = "light";
    if (lower.includes("purple")) next.accent = "#b9a7ff"; if (lower.includes("green")) next.accent = "#98d66f"; if (lower.includes("blue")) next.accent = "#78b4ff"; if (lower.includes("orange")) next.accent = "#ffad5c"; if (lower.includes("red")) next.accent = "#ff6b5d";
    setMessages(items => [...items, { role: "user", text: request }, { role: "assistant", text: "Done. I updated the design and saved a new version." }]);
    setCurrent(next); setCode(projectCode(next)); setProjects(items => items.map(item => item.id === next.id ? next : item)); setVersion(value => value + 1); setEditPrompt(""); toast.success("Design updated");
  };

  const openProject = (project: Project) => {
    setCurrent(project); setCode(projectCode(project)); setMessages([{ role: "assistant", text: `${project.name} is ready. Tell me what you want to change.` }]); setPublishSlug(slugify(project.name)); setPublishedUrl(project.published || ""); setWorkspaceOpen(true); setMainView("create"); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const updateToolProject = (patch: Partial<ToolProject>) => {
    const next = { ...current, ...patch, updated: "Just now" };
    setCurrent(next); setProjects(items => items.map(item => item.id === next.id ? next : item));
    setCode(projectCode(next)); setVersion(value => value + 1);
  };
  const remix = (name: string, type: string) => { setMainView("create"); setWorkspaceOpen(false); setSource("prompt"); setPrompt(`Remix ${name} into a ${type.toLowerCase()} for my Solana token community`); window.scrollTo({ top: 0, behavior: "smooth" }); toast.success("Remix loaded into the builder"); };
  const publish = () => {
    if (!publishSlug.trim()) return; setPublishing(true);
    window.setTimeout(() => { const url = `${slugify(publishSlug)}.vibekit.io`; setPublishedUrl(url); setCurrent(project => ({ ...project, published: url })); setProjects(items => items.map(item => item.id === current.id ? { ...item, published: url } : item)); setPublishing(false); toast.success("Your site is live"); }, 900);
  };
  const copy = async (value: string) => { await navigator.clipboard?.writeText(value); toast.success("Copied"); };
  const downloadCode = () => { const blob = new Blob([code], { type: "text/plain" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${slugify(current.name)}-site.tsx`; link.click(); URL.revokeObjectURL(link.href); toast.success("Code exported"); };
  const connectX = () => {
    if (creditStatus?.configured === false) { setCreditsOpen(true); toast.info("X login is waiting for its two Railway credentials."); return; }
    setXLoginBusy(true);
    void startXSignIn("/").catch(() => {
      setXLoginBusy(false);
      toast.error("Could not start X login. Please try again.");
    });
  };
  const connectHolderWallet = async () => {
    const provider = (window as Window & { solana?: PhantomProvider }).solana;
    if (!provider?.isPhantom) { toast.error("Install Phantom to verify your holder wallet."); return; }
    setWalletBusy(true);
    try {
      const connection = await provider.connect();
      const wallet = connection.publicKey.toString();
      setWalletAddress(wallet);
      if (!creditStatus?.authenticated) {
        setCreditsOpen(true);
        toast.success("Wallet connected. Connect X to activate holder rewards.");
        return;
      }
      const challengeResponse = await fetch("/api/wallet/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) });
      const challenge = await challengeResponse.json() as { message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.message) throw new Error(challenge.error || "Could not create the wallet request.");
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const verifyResponse = await fetch("/api/wallet/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, signature: Array.from(signed.signature) }) });
      const verified = await verifyResponse.json() as { error?: string; holder?: { eligible?: boolean; granted?: boolean } };
      if (!verifyResponse.ok) throw new Error(verified.error || "Wallet verification failed.");
      await refreshCredits();
      toast.success(verified.holder?.granted ? "Wallet verified — 30M holder tokens added." : verified.holder?.eligible ? "Wallet verified. Today’s holder drop is already claimed." : "Wallet verified.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet verification failed.");
    } finally {
      setWalletBusy(false);
    }
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContextApi }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "start_site_build",
        title: "Build a Solana community site",
        description: "Start a new Vibekit website from a plain-language description and open the generated preview.",
        inputSchema: { type: "object", properties: { prompt: { type: "string", minLength: 3 } }, required: ["prompt"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const value = input as { prompt?: unknown };
          if (typeof value?.prompt !== "string" || value.prompt.trim().length < 3) throw new Error("A website prompt of at least three characters is required.");
          setMainView("create"); setSource("prompt"); setPrompt(value.prompt); startBuild(value.prompt);
          return { status: "building", prompt: value.prompt };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "open_remix_gallery",
        title: "Open the remix gallery",
        description: "Open Vibekit's community project gallery so a design can be selected and remixed.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute() { setWorkspaceOpen(false); setMainView("gallery"); return { view: "gallery", projects: galleryItems.length }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
    // The model-context integration is intentionally registered once per page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <aside className={`side-rail ${mobileNavOpen ? "side-rail-open" : ""}`}>
      <div className="brand-row"><BrandMark /><span>Vibekit</span><button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={mainView === "create" ? "active" : ""} onClick={() => { setMainView("create"); setWorkspaceOpen(false); setMobileNavOpen(false); }}><Plus /><span>Create</span></button>
        <button className={mainView === "projects" ? "active" : ""} onClick={() => { setMainView("projects"); setWorkspaceOpen(false); setMobileNavOpen(false); }}><Folder /><span>Projects</span><b>{projects.length}</b></button>
        <button className={mainView === "gallery" ? "active" : ""} onClick={() => { setMainView("gallery"); setWorkspaceOpen(false); setMobileNavOpen(false); }}><LayoutGrid /><span>Gallery</span></button>
        <button className={mainView === "tools" ? "active" : ""} onClick={() => { setMainView("tools"); setWorkspaceOpen(false); setMobileNavOpen(false); }}><WandSparkles /><span>Tools</span></button>
      </nav>
      <div className="rail-note"><p>BUILD ON SOLANA.<br />PUBLISH ANYWHERE.</p><span /><small>ONE PROMPT<br />TO A REAL SITE.</small></div>
      <div className="rail-bottom"><button onClick={() => setSettingsOpen(true)}><Settings /><span>Settings</span></button><div className="engine-state"><i /><span>Builder ready</span></div></div>
    </aside>

    <section className="main-frame">
      <header className="top-bar">
        <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu /></button>
        <p>{workspaceOpen ? current.name : mainView === "gallery" ? "Made with Vibekit" : mainView === "projects" ? "Your workspace" : mainView === "tools" ? "Creator tools" : "AI SITE BUILDER FOR SOLANA"}</p>
        <div className="top-actions"><button className="search-button" aria-label="Search"><Search /></button><div className="network-state"><i /> Mainnet</div><Button variant="outline" className="wallet-connect-button" onClick={connectHolderWallet} disabled={walletBusy}>{walletBusy ? <LoaderCircle className="spin" /> : <Wallet />} {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}</Button>{creditStatus?.authenticated ? <Button className="wallet-button credit-balance-button" onClick={() => setCreditsOpen(true)}><Coins /> {compactCredits(creditStatus.user?.balance)} tokens</Button> : <Button className="wallet-button" onClick={connectX} disabled={xLoginBusy}><span className="x-mark">𝕏</span> {xLoginBusy ? "Connecting…" : "Connect X"}</Button>}</div>
      </header>

      {workspaceOpen ? <section className="workspace">
        <header className="workspace-toolbar">
          <div className="workspace-title"><button onClick={() => setWorkspaceOpen(false)} aria-label="Back to builder"><ArrowLeft /></button><div><strong>{current.name}</strong><span><i /> Saved · v{version}</span></div></div>
          <div className="toolbar-center"><div className="mode-switch"><button className={previewMode === "preview" ? "active" : ""} onClick={() => setPreviewMode("preview")}><Monitor /> Preview</button><button className={previewMode === "code" ? "active" : ""} onClick={() => setPreviewMode("code")}><Code2 /> Code</button></div></div>
          <div className="workspace-actions"><Button variant="outline" onClick={() => { setMainView("tools"); setWorkspaceOpen(false); }}><WandSparkles /> Tools</Button><button className="icon-action" onClick={() => toast.info("The last change was kept in version history")} aria-label="Undo"><Undo2 /></button><button className="icon-action" onClick={() => setVersionsOpen(true)} aria-label="Version history"><History /></button><Button variant="outline" className="export-button" onClick={downloadCode}><Download /> Export</Button><Button className="publish-button" onClick={() => setPublishOpen(true)}><Rocket /> Publish</Button></div>
        </header>
        <div className="workspace-body">
          <aside className="chat-panel">
            <div className="chat-heading"><div><WandSparkles /><span>Vibekit AI</span></div><button aria-label="More options"><MoreHorizontal /></button></div>
            <div className="chat-messages"><div className="build-summary"><span>VERSION {version}</span><strong>{current.name}</strong><p>{current.prompt}</p></div>{messages.map((message,index) => <div key={`${message.role}-${index}`} className={`message message-${message.role}`}>{message.role === "assistant" && <BrandMark small />}<p>{message.text}</p></div>)}</div>
            <div className="quick-edits"><button onClick={() => setEditPrompt("Make it dark and more cinematic")}><Palette /> Darker</button><button onClick={() => setEditPrompt("Make the accent green")}><Sparkles /> New color</button><button onClick={() => setEditPrompt("Add a community game section")}><Gamepad2 /> Add game</button></div>
            <div className="edit-composer"><Textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applyEdit(); } }} placeholder="Ask for any change..." aria-label="Ask for a website edit" /><button onClick={applyEdit} aria-label="Apply edit" disabled={!editPrompt.trim()}><ArrowUp /></button></div>
          </aside>
          <section className="canvas-panel">
            <div className="canvas-top"><div className="browser-dots"><i /><i /><i /></div><div className="preview-url"><Globe2 /><span>{publishedUrl || `${slugify(current.name)}.preview.vibekit.io`}</span><button onClick={() => copy(publishedUrl || `${slugify(current.name)}.preview.vibekit.io`)} aria-label="Copy preview URL"><Copy /></button></div><div className="device-switch"><button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} aria-label="Desktop preview"><Monitor /></button><button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} aria-label="Mobile preview"><Smartphone /></button></div></div>
            <div className={`canvas-stage ${device === "mobile" ? "canvas-mobile" : ""}`}>{previewMode === "preview" ? <div className="site-frame"><MiniSite project={current} mobile={device === "mobile"} /></div> : <div className="code-editor"><div className="code-tabs"><span>app/page.tsx</span><button onClick={downloadCode}><Download /> Download</button></div><Textarea value={code} onChange={e => setCode(e.target.value)} spellCheck={false} aria-label="Editable website code" /></div>}</div>
          </section>
        </div>
      </section> : mainView === "create" ? <section className="create-view">
        <div className="create-heading"><span><Sparkles /> SOLANA, MEET YOUR SITE</span><h1>Build something<br /><em>worth joining.</em></h1><p>Describe it, import it, or show us the look. Vibekit turns your idea into a real site for your token community.</p></div>
        <button className="credit-banner" disabled={xLoginBusy} onClick={() => creditStatus?.authenticated ? setCreditsOpen(true) : connectX()}><span><Gift /></span><div><strong>10M AI tokens, free with X</strong><small>Connect once and start building immediately.</small></div><b>Holders get 30M daily <ArrowRight /></b></button>
        <div className="builder-card"><Tabs value={source} onValueChange={value => setSource(value as BuilderSource)}>
          <TabsList className="source-tabs" variant="line"><TabsTrigger value="prompt"><Sparkles /> Start with a prompt</TabsTrigger><TabsTrigger value="import"><Link2 /> Import a project</TabsTrigger><TabsTrigger value="screenshot"><ImageIcon /> Screenshot to site</TabsTrigger></TabsList>
          <TabsContent value="prompt" className="source-content"><Textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startBuild(); } }} placeholder="Make a playful website for a frog token with a live chart, a roadmap and a weekly community game..." aria-label="Describe the website to build" /></TabsContent>
          <TabsContent value="import" className="source-content import-content"><div className="field-label"><Link2 /> Token address or existing website</div><Input value={importValue} onChange={e => setImportValue(e.target.value)} placeholder="Paste a Solana token address or https://..." aria-label="Token address or existing website" /><p>We’ll use the project name, image, copy and links as a starting point.</p></TabsContent>
          <TabsContent value="screenshot" className="source-content screenshot-content"><input ref={fileRef} type="file" accept="image/*" onChange={handleScreenshot} hidden />{screenshotUrl ? <button className="uploaded-reference" onClick={() => fileRef.current?.click()}>
            {/* The image is a local data URL selected by the user, so Next Image cannot optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screenshotUrl} alt="Uploaded website reference" /><span><Check /> {screenshotName}<small>Click to replace</small></span></button> : <button className="upload-zone" onClick={() => fileRef.current?.click()}><Upload /><span>Drop a reference here or choose an image</span><small>PNG, JPG or WebP</small></button>}<Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Optional: tell us what to change" aria-label="Screenshot instructions" /></TabsContent>
          <div className="builder-footer"><div className="token-field"><span>SOL</span><Input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token address (optional)" aria-label="Optional token address" /></div><Button onClick={() => startBuild()} disabled={isBuilding} className="build-button">{isBuilding ? <><LoaderCircle className="spin" /> Building your site</> : <>Build my site <ArrowUp /></>}</Button></div>
        </Tabs></div>
        <div className="idea-grid">{starterIdeas.map(idea => <button key={idea.title} onClick={() => { setSource("prompt"); setPrompt(idea.text); }}><span><idea.icon /></span><div><strong>{idea.title}</strong><p>{idea.text}</p></div><ArrowRight /></button>)}</div>
        <div className="recent-strip"><div className="section-heading"><div><span>YOUR WORK</span><h2>Continue building</h2></div><button onClick={() => setMainView("projects")}>All projects <ArrowRight /></button></div><div className="recent-grid">{projects.slice(0,2).map(project => <button className="recent-project" key={project.id} onClick={() => openProject(project)}><div className="recent-visual" style={{ "--project-accent": project.accent } as React.CSSProperties}><span>{project.name.charAt(0)}</span><i /><i /></div><div><strong>{project.name}</strong><span>{project.updated}</span></div><ChevronRight /></button>)}</div></div>
      </section> : mainView === "tools" ? <ToolsWorkbench project={current} onChange={updateToolProject} apiKey={apiKey} onCreditBalance={balance => setCreditStatus(status => status?.user ? { ...status, user: { ...status.user, balance } } : status)} /> : mainView === "projects" ? <section className="library-view">
        <div className="library-heading"><span>YOUR WORKSPACE</span><h1>Every idea,<br /><em>still editable.</em></h1><Button onClick={() => { setMainView("create"); setWorkspaceOpen(false); }}><Plus /> New project</Button></div>
        <div className="project-table">{projects.map(project => <button key={project.id} className="project-row" onClick={() => openProject(project)}><div className="project-thumb" style={{ "--project-accent": project.accent } as React.CSSProperties}><span>{project.name.charAt(0)}</span></div><div className="project-info"><strong>{project.name}</strong><span>{project.prompt}</span></div><span className="project-status">{project.published ? <><i /> Live</> : "Draft"}</span><span className="project-updated">{project.updated}</span><ChevronRight /></button>)}</div>
      </section> : <section className="gallery-view">
        <div className="gallery-heading"><div><span>MADE BY THE COMMUNITY</span><h1>Find a good idea.<br /><em>Make it yours.</em></h1></div><p>Explore live community sites, games and tools. Remix any project with one prompt.</p></div>
        <div className="filter-row">{["Featured","Token sites","Games","Dashboards","Tools"].map(filter => <button key={filter} className={galleryFilter === filter ? "active" : ""} onClick={() => setGalleryFilter(filter)}>{filter}</button>)}</div>
        <div className="gallery-grid">{filteredGallery.map(item => <article key={item.name} className="gallery-card"><StarterPreview item={item} /><div className="gallery-card-copy"><div><span>{item.type}</span><h3>{item.name}</h3><p>{item.description}</p></div><Button variant="outline" onClick={() => remix(item.name,item.type)}><Sparkles /> Remix</Button></div></article>)}</div>
      </section>}
    </section>

    <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent className="publish-dialog"><DialogHeader><span className="dialog-icon"><Rocket /></span><DialogTitle>Give your site a home.</DialogTitle><DialogDescription>Publish this version now. You can keep editing after it goes live.</DialogDescription></DialogHeader>{publishedUrl ? <div className="published-card"><span><i /> LIVE</span><strong>{publishedUrl}</strong><div><Button variant="outline" onClick={() => copy(publishedUrl)}><Copy /> Copy link</Button><Button onClick={() => toast.info("Opening your live site in a new tab")}>Visit site <ExternalLink /></Button></div></div> : <><label className="subdomain-label">Choose your free subdomain</label><div className="subdomain-field"><Input value={publishSlug} onChange={e => setPublishSlug(slugify(e.target.value))} aria-label="Subdomain" /><span>.vibekit.io</span></div><div className="publish-checks"><span><Check /> SSL included</span><span><Check /> Instant updates</span><span><Check /> Custom domain ready</span></div><DialogFooter><Button className="publish-confirm" onClick={publish} disabled={publishing || !publishSlug}>{publishing ? <><LoaderCircle className="spin" /> Publishing</> : <>Publish site <ArrowRight /></>}</Button></DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={creditsOpen} onOpenChange={setCreditsOpen}><DialogContent className="credits-dialog"><DialogHeader><span className="credits-icon"><Coins /></span><DialogTitle>AI token balance</DialogTitle><DialogDescription>Build with Vibekit credits. Your X grant is permanent and holder rewards refresh every UTC day.</DialogDescription></DialogHeader>{creditStatus?.authenticated ? <div className="credits-account">
      <div className="credits-profile"><span>{(creditStatus.user?.displayName || creditStatus.user?.username || "X").charAt(0)}</span><div><strong>{creditStatus.user?.displayName || `@${creditStatus.user?.username}`}</strong><small>{creditStatus.user?.username ? `@${creditStatus.user.username}` : "Connected with X"}</small></div><b>{compactCredits(creditStatus.user?.balance)}<small>tokens left</small></b></div>
      <div className="credit-grant-grid"><article><Gift /><span>WELCOME GRANT</span><strong>10M</strong><small>One time with X</small></article><article><ShieldCheck /><span>HOLDER DROP</span><strong>30M</strong><small>Every UTC day</small></article><article><Coins /><span>HOLDING NEEDED</span><strong>10M</strong><small>1% of 1B supply</small></article></div>
      <div className={`holder-card ${creditStatus.holder?.eligible ? "holder-card-eligible" : ""}`}><div><span>{creditStatus.holder?.eligible ? <Check /> : <Wallet />}</span><p><strong>{creditStatus.user?.walletAddress ? shortAddress(creditStatus.user.walletAddress) : "Verify a holder wallet"}</strong><small>{!creditStatus.holder?.configured ? "Reward mint needs to be added in Railway" : creditStatus.holder?.eligible ? `${compactCredits(creditStatus.holder.holding)} held · daily reward active` : creditStatus.user?.walletAddress ? `${compactCredits(creditStatus.holder?.holding)} held · 10M required` : "Sign once with Phantom. No transaction or gas."}</small></p></div><Button variant={creditStatus.user?.walletAddress ? "outline" : "default"} onClick={connectHolderWallet} disabled={walletBusy}>{walletBusy ? <LoaderCircle className="spin" /> : <Wallet />} {creditStatus.user?.walletAddress ? "Change wallet" : "Connect Phantom"}</Button></div>
      <div className="credits-foot"><span>Spent {compactCredits(creditStatus.user?.lifetimeSpent)} tokens</span><button onClick={() => void signOut({ redirectTo: "/" })}><LogOut /> Disconnect X</button></div>
    </div> : <div className="connect-x-card"><span className="connect-x-logo">𝕏</span><h3>Get 10M AI tokens</h3><p>Connect your X account once. No card and no payment required.</p><Button onClick={connectX} disabled={creditStatus?.configured === false}>Connect with X <ArrowRight /></Button>{creditStatus?.configured === false && <small>X credentials still need to be added in Railway.</small>}</div>}</DialogContent></Dialog>

    <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}><SheetContent className="history-sheet"><SheetHeader><SheetTitle>Version history</SheetTitle><SheetDescription>Every AI edit creates a version you can restore.</SheetDescription></SheetHeader><div className="version-list">{Array.from({ length: version },(_,index) => version-index).map((item,index) => <button key={item} className={index === 0 ? "current-version" : ""} onClick={() => { setVersion(item); setVersionsOpen(false); toast.success(`Restored version ${item}`); }}><span>v{item}</span><div><strong>{index === 0 ? "Current version" : `Design update ${item}`}</strong><small>{index === 0 ? "Just now" : `${index*8+4} min ago`}</small></div>{index === 0 ? <Check /> : <History />}</button>)}</div></SheetContent></Sheet>

    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}><SheetContent className="settings-sheet"><SheetHeader><SheetTitle>Builder settings</SheetTitle><SheetDescription>Choose how Vibekit generates your sites.</SheetDescription></SheetHeader><div className="settings-content">
      <div className="setting-block"><span>AI MODEL</span><button><div><Sparkles /><p><strong>Vibekit Auto</strong><small>Best available model for each edit</small></p></div><Check /></button></div>
      <div className="setting-block"><span>BRING YOUR OWN KEY</span><p>Use your own OpenRouter key for AI-generated names, copy and visual direction. It stays in this session.</p><Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste OpenRouter API key" aria-label="Personal AI API key" /><Button variant="outline" onClick={() => toast.success(apiKey ? "Key ready for this session" : "Add a key first")}>Use this key</Button></div>
      <div className="setting-block"><span>CODE & OWNERSHIP</span><Button variant="outline" onClick={() => toast.info("GitHub connection will open here")}><GitBranch /> Connect GitHub</Button><p className="ownership-note">Your sites and generated code stay exportable.</p></div>
    </div></SheetContent></Sheet>
    <Toaster position="bottom-center" theme="light" />
  </main>;
}
