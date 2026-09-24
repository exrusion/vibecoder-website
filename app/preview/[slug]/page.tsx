import { notFound } from "next/navigation";
import { publishedSites } from "@/lib/published-sites";

export const dynamic = "force-dynamic";

export default async function SharedPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^preview-[a-f0-9-]{36}$/.test(slug)) notFound();
  const sql = await publishedSites();
  const rows = await sql`SELECT name, html FROM vibekit_sites WHERE slug = ${slug} AND preview = TRUE LIMIT 1`;
  if (!rows.length) notFound();
  const policy = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https: data: blob:; script-src 'unsafe-inline'; frame-src https://dexscreener.com; media-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  return <main style={{ position: "fixed", inset: 0, background: "white" }}><iframe title={String(rows[0].name)} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="${policy}">${rows[0].html}`} style={{ width: "100%", height: "100%", border: 0 }} /></main>;
}
