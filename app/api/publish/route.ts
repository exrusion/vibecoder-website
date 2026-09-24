import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { publishedSites, validSlug } from "@/lib/published-sites";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.xUserId) return Response.json({ error: "Connect X to share or publish your site." }, { status: 401 });
  let body: { slug?: string; html?: string; name?: string; preview?: boolean; auto?: boolean };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const preview = body.preview === true;
  const requested = String(body.slug || "");
  const slug = preview ? `preview-${randomUUID()}` : body.auto && !validSlug(requested) && /^[a-z0-9-]{1,26}$/.test(requested) ? `site-${requested}` : requested;
  if (!preview && !validSlug(slug)) return Response.json({ error: "Choose a valid site name." }, { status: 400 });
  const html = String(body.html || "");
  if (!/^\s*<!doctype html|^\s*<html/i.test(html) || html.length > 250_000) return Response.json({ error: "A generated HTML site is required (maximum 250 KB)." }, { status: 400 });
  const sql = await publishedSites();
  if (body.auto && !preview) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? slug : `${slug.slice(0, 23).replace(/-$/, "")}-${randomUUID().slice(0, 6)}`;
      const inserted = await sql`
        INSERT INTO vibekit_sites (slug, owner_id, name, html, preview)
        VALUES (${candidate}, ${session.user.xUserId}, ${String(body.name || candidate).slice(0, 100)}, ${html}, FALSE)
        ON CONFLICT (slug) DO NOTHING RETURNING slug
      `;
      if (inserted.length) return Response.json({ url: `https://${candidate}.vibekit.io` });
    }
    return Response.json({ error: "Could not reserve a unique address." }, { status: 409 });
  }
  const rows = await sql`
    INSERT INTO vibekit_sites (slug, owner_id, name, html, preview)
    VALUES (${slug}, ${session.user.xUserId}, ${String(body.name || slug).slice(0, 100)}, ${html}, ${preview})
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, html = EXCLUDED.html, updated_at = NOW()
    WHERE vibekit_sites.owner_id = EXCLUDED.owner_id AND vibekit_sites.preview = EXCLUDED.preview
    RETURNING slug
  `;
  if (!rows.length) return Response.json({ error: "This site name is already taken." }, { status: 409 });
  return Response.json({ url: preview ? `https://vibekit.io/preview/${slug}` : `https://${slug}.vibekit.io` });
}
