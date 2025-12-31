import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protect everything under /orakl EXCEPT /orakl/login
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/orakl")) return NextResponse.next();
  if (pathname.startsWith("/orakl/login")) return NextResponse.next();

  // Supabase auth stores a cookie; if missing, redirect to login
  const hasAuthCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token") ||
    // some Supabase setups use project-ref prefixed cookies
    [...req.cookies.getAll()].some((c) => c.name.includes("sb-") && c.name.includes("auth-token"));

  if (!hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/orakl/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/orakl/:path*"],
};
