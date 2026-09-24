import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
let schema: Promise<void> | undefined;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("Publishing database is unavailable.");
  client ??= postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  return client;
}

export async function publishedSites() {
  schema ??= db()`CREATE TABLE IF NOT EXISTS vibekit_sites (
    slug TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    html TEXT NOT NULL,
    preview BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.then(() => undefined).catch(error => { schema = undefined; throw error; });
  await schema;
  return db();
}

export function validSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(value) && !["www", "api", "admin", "preview", "app"].includes(value);
}
