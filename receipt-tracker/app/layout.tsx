import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "日本旅遊收據記帳",
  description: "拍收據、AI 辨識、寫入 Notion 的旅遊記帳系統",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#D4502A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="bg-washi text-sumi">
        <div className="mx-auto min-h-screen w-full max-w-app pb-16">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
