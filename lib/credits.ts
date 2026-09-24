import postgres from "postgres";

export const X_WELCOME_CREDITS = BigInt(10_000_000);
export const DAILY_HOLDER_CREDITS = BigInt(30_000_000);
export const HOLDER_THRESHOLD_TOKENS = BigInt(10_000_000);
export const GENERATION_RESERVE = BigInt(12_000);

export type CreditUser = {
  xUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  walletAddress: string | null;
  balance: bigint;
  lifetimeSpent: bigint;
  lastHolderClaim: string | null;
};

type DatabaseRow = Record<string, unknown>;

let client: ReturnType<typeof postgres> | undefined;
let schemaPromise: Promise<void> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  client ??= postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false });
  return client;
}

export async function ensureCreditSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = database();
      await sql`
        CREATE TABLE IF NOT EXISTS vibecoder_users (
          x_user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL DEFAULT '',
          display_name TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT '',
          wallet_address TEXT UNIQUE,
          balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
          lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
          x_grant_claimed BOOLEAN NOT NULL DEFAULT FALSE,
          last_holder_claim DATE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS vibecoder_wallet_challenges (
          x_user_id TEXT PRIMARY KEY REFERENCES vibecoder_users(x_user_id) ON DELETE CASCADE,
          wallet_address TEXT NOT NULL,
          message TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS vibecoder_credit_events (
          id BIGSERIAL PRIMARY KEY,
          x_user_id TEXT NOT NULL REFERENCES vibecoder_users(x_user_id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          amount BIGINT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS vibecoder_credit_events_user_created_idx ON vibecoder_credit_events(x_user_id, created_at DESC)`;
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

function toUser(row: DatabaseRow): CreditUser {
  const rawDate = row.last_holder_claim;
  return {
    xUserId: String(row.x_user_id),
    username: String(row.username || ""),
    displayName: String(row.display_name || ""),
    avatarUrl: String(row.avatar_url || ""),
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    balance: BigInt(String(row.balance ?? 0)),
    lifetimeSpent: BigInt(String(row.lifetime_spent ?? 0)),
    lastHolderClaim: rawDate ? new Date(String(rawDate)).toISOString().slice(0, 10) : null,
  };
}

export async function ensureTwitterUser(input: { xUserId: string; username?: string; displayName?: string; avatarUrl?: string }) {
  await ensureCreditSchema();
  const sql = database();
  return sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO vibecoder_users (x_user_id, username, display_name, avatar_url)
      VALUES (${input.xUserId}, ${input.username || ""}, ${input.displayName || ""}, ${input.avatarUrl || ""})
      ON CONFLICT (x_user_id) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
    `;
    const granted = await transaction<DatabaseRow[]>`
      UPDATE vibecoder_users
      SET balance = balance + ${X_WELCOME_CREDITS.toString()}, x_grant_claimed = TRUE, updated_at = NOW()
      WHERE x_user_id = ${input.xUserId} AND x_grant_claimed = FALSE
      RETURNING x_user_id
    `;
    if (granted.length) {
      await transaction`
        INSERT INTO vibecoder_credit_events (x_user_id, kind, amount)
        VALUES (${input.xUserId}, 'x_welcome', ${X_WELCOME_CREDITS.toString()})
      `;
    }
  });
}

export async function getCreditUser(xUserId: string) {
  await ensureCreditSchema();
  const rows = await database()<DatabaseRow[]>`SELECT * FROM vibecoder_users WHERE x_user_id = ${xUserId} LIMIT 1`;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function createWalletChallenge(xUserId: string, walletAddress: string) {
  await ensureCreditSchema();
  const nonce = crypto.randomUUID();
  const expires = new Date(Date.now() + 5 * 60_000);
  const message = [
    "Vibekit wallet verification",
    `X account: ${xUserId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires: ${expires.toISOString()}`,
  ].join("\n");
  await database()`
    INSERT INTO vibecoder_wallet_challenges (x_user_id, wallet_address, message, expires_at)
    VALUES (${xUserId}, ${walletAddress}, ${message}, ${expires})
    ON CONFLICT (x_user_id) DO UPDATE SET
      wallet_address = EXCLUDED.wallet_address,
      message = EXCLUDED.message,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
  `;
  return { message, expiresAt: expires.toISOString() };
}

export async function consumeWalletChallenge(xUserId: string, walletAddress: string) {
  await ensureCreditSchema();
  const rows = await database()<DatabaseRow[]>`
    DELETE FROM vibecoder_wallet_challenges
    WHERE x_user_id = ${xUserId} AND wallet_address = ${walletAddress} AND expires_at > NOW()
    RETURNING message
  `;
  return rows[0]?.message ? String(rows[0].message) : null;
}

export async function linkWallet(xUserId: string, walletAddress: string) {
  await ensureCreditSchema();
  const rows = await database()<DatabaseRow[]>`
    UPDATE vibecoder_users
    SET wallet_address = ${walletAddress}, updated_at = NOW()
    WHERE x_user_id = ${xUserId}
    RETURNING *
  `;
  return rows[0] ? toUser(rows[0]) : null;
}

type ParsedTokenAccount = {
  account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } } };
};

export async function getHolderBalance(walletAddress: string) {
  const mint = (process.env.VIBEKIT_TOKEN_MINT || process.env.VIBECODER_TOKEN_MINT)?.trim();
  if (!mint) return { configured: false as const, eligible: false, holding: "0", threshold: HOLDER_THRESHOLD_TOKENS.toString() };
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "vibecoder-holder-check",
      method: "getTokenAccountsByOwner",
      params: [walletAddress, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The Solana RPC holder check failed.");
  const payload = await response.json() as { error?: { message?: string }; result?: { value?: ParsedTokenAccount[] } };
  if (payload.error) throw new Error(payload.error.message || "The Solana RPC returned an error.");
  let rawHolding = BigInt(0);
  let decimals = 0;
  for (const item of payload.result?.value || []) {
    const tokenAmount = item.account?.data?.parsed?.info?.tokenAmount;
    rawHolding += BigInt(tokenAmount?.amount || "0");
    decimals = tokenAmount?.decimals ?? decimals;
  }
  const scale = BigInt(10) ** BigInt(decimals);
  const thresholdRaw = HOLDER_THRESHOLD_TOKENS * scale;
  const whole = rawHolding / scale;
  const fraction = rawHolding % scale;
  const holding = fraction ? `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}` : whole.toString();
  return { configured: true as const, eligible: rawHolding >= thresholdRaw, holding, threshold: HOLDER_THRESHOLD_TOKENS.toString() };
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function applyDailyHolderGrant(xUserId: string, walletAddress: string) {
  const holder = await getHolderBalance(walletAddress);
  if (!holder.configured || !holder.eligible) return { ...holder, granted: false, claimedToday: false };
  await ensureCreditSchema();
  const today = utcDate();
  const rows = await database()<DatabaseRow[]>`
    UPDATE vibecoder_users
    SET balance = balance + ${DAILY_HOLDER_CREDITS.toString()}, last_holder_claim = ${today}, updated_at = NOW()
    WHERE x_user_id = ${xUserId}
      AND wallet_address = ${walletAddress}
      AND (last_holder_claim IS NULL OR last_holder_claim < ${today})
    RETURNING x_user_id
  `;
  if (rows.length) {
    await database()`
      INSERT INTO vibecoder_credit_events (x_user_id, kind, amount, metadata)
      VALUES (${xUserId}, 'daily_holder', ${DAILY_HOLDER_CREDITS.toString()}, ${database().json({ walletAddress, holding: holder.holding, date: today })})
    `;
  }
  return { ...holder, granted: rows.length > 0, claimedToday: true };
}

export async function reserveGenerationCredits(xUserId: string, amount = GENERATION_RESERVE) {
  await ensureCreditSchema();
  const rows = await database()<DatabaseRow[]>`
    UPDATE vibecoder_users
    SET balance = balance - ${amount.toString()}, lifetime_spent = lifetime_spent + ${amount.toString()}, updated_at = NOW()
    WHERE x_user_id = ${xUserId} AND balance >= ${amount.toString()}
    RETURNING balance
  `;
  if (!rows.length) return null;
  await database()`INSERT INTO vibecoder_credit_events (x_user_id, kind, amount) VALUES (${xUserId}, 'generation_reserve', ${(-amount).toString()})`;
  return { reserved: amount, balance: BigInt(String(rows[0].balance)) };
}

export async function settleGenerationCredits(xUserId: string, reserved: bigint, actual: bigint) {
  await ensureCreditSchema();
  const charged = actual > reserved ? reserved : actual < BigInt(0) ? BigInt(0) : actual;
  const refund = reserved - charged;
  const rows = await database()<DatabaseRow[]>`
    UPDATE vibecoder_users
    SET balance = balance + ${refund.toString()}, lifetime_spent = lifetime_spent - ${refund.toString()}, updated_at = NOW()
    WHERE x_user_id = ${xUserId}
    RETURNING balance
  `;
  if (refund > BigInt(0)) {
    await database()`INSERT INTO vibecoder_credit_events (x_user_id, kind, amount, metadata) VALUES (${xUserId}, 'generation_refund', ${refund.toString()}, ${database().json({ actual: charged.toString() })})`;
  }
  return rows[0] ? BigInt(String(rows[0].balance)) : BigInt(0);
}

export async function refundGenerationCredits(xUserId: string, reserved: bigint) {
  return settleGenerationCredits(xUserId, reserved, BigInt(0));
}
