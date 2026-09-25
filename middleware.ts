import { NextRequest, NextResponse } from "next/server";

// Basic Auth fürs Dashboard (Webhook + Tick-API ausgenommen)
export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass || req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pwd] = atob(encoded).split(":");
    if (user === (process.env.DASHBOARD_USER || "admin") && pwd === pass) return NextResponse.next();
  }
  return new NextResponse("Auth required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="UGC"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
