"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, ShieldCheck, Wallet, Download } from "lucide-react";

type GateInfo = { name: string; mint: string; minimum: string; contentType: string };
type Phantom = { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toString: () => string } }>; signMessage: (message: Uint8Array, encoding: "utf8") => Promise<{ signature: Uint8Array }> };

export default function GateUnlock({ id }: { id: string }) {
  const [info, setInfo] = useState<GateInfo | null>(null);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/tools/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "details", id }) })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setInfo(result); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Gate unavailable."));
  }, [id]);
  const unlock = async () => {
    const provider = (window as Window & { solana?: Phantom }).solana;
    if (!provider?.isPhantom) { setError("Install Phantom to unlock with your holder wallet."); return; }
    setBusy(true); setError("");
    try {
      const wallet = (await provider.connect()).publicKey.toString();
      const challengeResponse = await fetch("/api/tools/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "challenge", id, wallet }) });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error);
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const accessResponse = await fetch("/api/tools/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlock", id, wallet, message: challenge.message, mac: challenge.mac, signature: Array.from(signed.signature) }) });
      const access = await accessResponse.json();
      if (!accessResponse.ok) throw new Error(access.error);
      setContent(access.content);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to verify this wallet."); }
    finally { setBusy(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "holder-access.txt"; link.click(); URL.revokeObjectURL(url);
  };
  return <main className="gate-screen"><div className="gate-box"><span className="gate-icon">{content ? <ShieldCheck /> : <LockKeyhole />}</span>
    <span className="gate-eyebrow">VIBECODER / HOLDERS ONLY</span>
    <h1>{info?.name || "Holder access"}</h1>
    <p>{content ? "Wallet verified against the Solana token balance." : "Connect and sign with your wallet to verify ownership. No transaction or gas is required."}</p>
    {info && <div className="gate-requirement"><span>Required balance</span><strong>{info.minimum} tokens</strong><code>{info.mint}</code></div>}
    {content ? <div className="gate-unlocked"><div>{content}</div>{info?.contentType === "download" && <button onClick={download}><Download /> Download unlocked file</button>}</div> : <button className="gate-cta" disabled={!info || busy} onClick={unlock}><Wallet /> {busy ? "Checking holder balance…" : "Connect Phantom & unlock"}</button>}
    {error && <p className="gate-error" role="alert">{error}</p>}
    <Link className="gate-back" href="/">Made with Vibekit ↗</Link>
  </div></main>;
}
