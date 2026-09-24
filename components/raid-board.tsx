"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { startXSignIn } from "@/lib/x-signin";
import { ArrowUpRight, Check, Trophy, X } from "lucide-react";

type Task = { id: string; label: string; url: string; points: number };
type Submission = { id: string; task_id: string; username: string; proof: string; points: number };
type Board = { id: string; name: string; tasks: Task[]; leaderboard: { username: string; points: number }[]; pending: Submission[]; isOwner: boolean };

export default function RaidBoard({ id }: { id: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/tools/raids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "details", id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setBoard(data);
  }, [id]);
  useEffect(() => {
    fetch("/api/tools/raids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "details", id }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setBoard(data); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Could not load board."));
  }, [id]);
  const send = async (action: string, extra: Record<string, unknown>) => {
    setBusy(String(extra.taskId || extra.submissionId || action)); setError("");
    try {
      const response = await fetch("/api/tools/raids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...extra }) });
      const data = await response.json();
      if (response.status === 401) { setError(data.error); return; }
      if (!response.ok) throw new Error(data.error);
      if (action === "submit") setProofs(current => ({ ...current, [String(extra.taskId)]: "" }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setBusy(""); }
  };
  return <main className="gate-screen raid-screen"><div className="raid-box"><span className="gate-eyebrow">VIBECODER / COMMUNITY RAIDS</span>
    <h1>{board?.name || "Community raid board"}</h1><p>Complete a task, paste a public proof link, and wait for the creator to review it. Points are added only after approval.</p>
    {error && <div className="gate-error" role="alert">{error} {error.includes("Connect X") && <button onClick={() => void startXSignIn(window.location.pathname)}>Connect X</button>}</div>}
    <div className="raid-layout"><section><h2>Open tasks</h2>{board?.tasks.map(task => <article className="raid-task" key={task.id}><div><strong>{task.label}</strong><span>{task.points} points</span></div><a href={task.url} target="_blank" rel="noopener noreferrer">Open task <ArrowUpRight /></a><div className="raid-proof"><input placeholder="Paste your public proof link" value={proofs[task.id] || ""} onChange={event => setProofs(current => ({ ...current, [task.id]: event.target.value }))} /><button disabled={busy === task.id || !proofs[task.id]} onClick={() => void send("submit", { taskId: task.id, proof: proofs[task.id] })}>Submit proof</button></div></article>)}</section>
    <section><h2><Trophy /> Leaderboard</h2>{board?.leaderboard.length ? board.leaderboard.map((entry, index) => <div className="raid-rank" key={index}><span>#{index + 1}</span><strong>{entry.username}</strong><b>{entry.points} pts</b></div>) : <p>No approved scores yet.</p>}</section></div>
    {board?.isOwner && <section className="raid-review"><h2>Review submissions</h2>{board.pending.length ? board.pending.map(item => <article key={item.id}><div><strong>{item.username}</strong><a href={item.proof} target="_blank" rel="noopener noreferrer">View proof <ArrowUpRight /></a></div><span>{item.points} points requested</span><button onClick={() => void send("review", { submissionId: item.id, status: "approved" })}><Check /> Approve</button><button onClick={() => void send("review", { submissionId: item.id, status: "rejected" })}><X /> Reject</button></article>) : <p>Nothing to review.</p>}</section>}
    <Link className="gate-back" href="/">Made with Vibekit ↗</Link>
  </div></main>;
}
