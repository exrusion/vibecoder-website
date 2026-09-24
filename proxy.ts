import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0] || "";
  const match = /^([a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?)\.vibekit\.io$/.exec(host);
  if (!match || ["www", "api", "admin", "preview", "app"].includes(match[1])) return NextResponse.next();
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/s/${match[1]}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/"] };
