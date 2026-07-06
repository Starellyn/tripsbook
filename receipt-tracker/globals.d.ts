// Next.js 全域 CSS 以副作用方式匯入（import "./globals.css"）。
// Next 套件未提供 *.css 型別宣告，於此補上 ambient 宣告供 TypeScript 通過型別檢查。
declare module "*.css";
