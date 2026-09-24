import { auth } from "@/auth";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 3, prepare: false }) : null;
let setup: Promise<unknown> | undefined;
function schema() {
  if (!sql) throw new Error("Raid board storage is unavailable.");
  setup ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS vibecoder_raid_boards (
      id TEXT PRIMARY KEY, owner_x_id TEXT NOT NULL, name TEXT NOT NULL, tasks JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS vibecoder_raid_submissions (
      id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES vibecoder_raid_boards(id),
      task_id TEXT NOT NULL, x_user_id TEXT NOT NULL, username TEXT NOT NULL,
      proof TEXT NOT NULL, points INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(board_id, task_id, x_user_id)
    )`;
  })().catch(error => { setup = undefined; throw error; });
  return setup;
}
type Task = { id: string; label: string; url: string; points: number };
type Board = { id: string; name: string; owner_x_id: string; tasks: Task[] };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  try {
    await schema();
    const session = await auth();
    const userId = session?.user?.xUserId || "";
    if (action === "create") {
      if (!userId) return Response.json({ error: "Connect X to create a raid board." }, { status: 401 });
      const name = String(body.name || "").trim().slice(0, 80);
      const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
      const tasks: Task[] = rawTasks.slice(0, 12).map((task: Record<string, unknown>) => ({
        id: randomUUID(), label: String(task.label || "").trim().slice(0, 100),
        url: String(task.url || "").trim().slice(0, 500),
        points: Math.min(1000, Math.max(1, Math.floor(Number(task.points) || 10))),
      }));
      if (!name || !tasks.length || tasks.some(task => !task.label || !/^https:\/\//.test(task.url))) {
        return Response.json({ error: "Add a board name and HTTPS link for every task." }, { status: 400 });
      }
      const id = randomUUID();
      await sql!`INSERT INTO vibecoder_raid_boards (id, owner_x_id, name, tasks)
        VALUES (${id}, ${userId}, ${name}, ${sql!.json(tasks)})`;
      return Response.json({ id, url: "/raids/" + id }, { status: 201 });
    }
    const id = String(body.id || "");
    const boards = await sql!<Board[]>`SELECT * FROM vibecoder_raid_boards WHERE id = ${id} LIMIT 1`;
    const board = boards[0];
    if (!board) return Response.json({ error: "Raid board not found." }, { status: 404 });
    if (action === "details") {
      const leaderboard = await sql!`SELECT username, SUM(points)::int AS points
        FROM vibecoder_raid_submissions WHERE board_id = ${id} AND status = 'approved'
        GROUP BY x_user_id, username ORDER BY points DESC LIMIT 25`;
      const pending = userId === board.owner_x_id ? await sql!`SELECT id, task_id, username, proof, points, status
        FROM vibecoder_raid_submissions WHERE board_id = ${id} AND status = 'pending' ORDER BY created_at DESC LIMIT 100` : [];
      return Response.json({ id, name: board.name, tasks: board.tasks, leaderboard, pending, isOwner: userId === board.owner_x_id });
    }
    if (action === "submit") {
      if (!userId) return Response.json({ error: "Connect X to submit task proof." }, { status: 401 });
      const task = board.tasks.find(item => item.id === body.taskId);
      const proof = String(body.proof || "").trim().slice(0, 500);
      if (!task || !/^https:\/\//.test(proof)) return Response.json({ error: "Paste an HTTPS proof link for a valid task." }, { status: 400 });
      await sql!`INSERT INTO vibecoder_raid_submissions (id, board_id, task_id, x_user_id, username, proof, points)
        VALUES (${randomUUID()}, ${id}, ${task.id}, ${userId}, ${session?.user?.name || "X user"}, ${proof}, ${task.points})
        ON CONFLICT (board_id, task_id, x_user_id) DO UPDATE SET proof = EXCLUDED.proof, status = 'pending', created_at = NOW()`;
      return Response.json({ submitted: true, status: "pending" });
    }
    if (action === "review") {
      if (userId !== board.owner_x_id) return Response.json({ error: "Only the board owner can review proofs." }, { status: 403 });
      const status = body.status === "approved" ? "approved" : "rejected";
      await sql!`UPDATE vibecoder_raid_submissions SET status = ${status} WHERE id = ${String(body.submissionId || "")} AND board_id = ${id}`;
      return Response.json({ reviewed: true, status });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Raid board unavailable." }, { status: 502 });
  }
}
