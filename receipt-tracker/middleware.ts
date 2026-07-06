import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("rt_auth")?.value;
  const expected = process.env.APP_PASSWORD;
  const authed = Boolean(expected) && token === expected;

  if (authed) {
    return NextResponse.next();
  }

  // API 未授權回 401，頁面導向 /login
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

// 排除：靜態資源、登入頁、登入 API
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon.svg|login|api/auth/login).*)",
  ],
};
