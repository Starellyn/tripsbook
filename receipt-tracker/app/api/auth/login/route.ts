import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "伺服器未設定 APP_PASSWORD" },
      { status: 500 }
    );
  }
  if (password !== expected) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("rt_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
  return res;
}
