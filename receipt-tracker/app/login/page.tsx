"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError("密碼錯誤，請重試");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="mb-8 text-2xl font-bold text-kaki">日本旅遊收據記帳</h1>
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="請輸入密碼"
          className="w-full rounded-lg border border-black/15 bg-white px-4 py-3 outline-none focus:border-kaki"
        />
        {error && <p className="text-sm text-kaki">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-kaki py-3 font-bold text-white disabled:opacity-50"
        >
          {loading ? "驗證中…" : "登入"}
        </button>
      </form>
    </main>
  );
}
