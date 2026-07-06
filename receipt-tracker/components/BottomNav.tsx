"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "首頁" },
  { href: "/scan", label: "掃描" },
  { href: "/history", label: "記錄" },
  { href: "/stats", label: "統計" },
  { href: "/settings", label: "設定" },
];

export default function BottomNav() {
  const pathname = usePathname();
  // 登入頁不顯示底部導覽
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-app border-t border-black/10 bg-washi">
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex h-16 items-center justify-center text-sm ${
                  active ? "font-bold text-kaki" : "text-sumi/60"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
