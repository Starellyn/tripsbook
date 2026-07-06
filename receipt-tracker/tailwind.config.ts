import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        washi: "#F7F3EC", // 紙白
        kaki: "#D4502A", // 柿色
        aizumi: "#3D5A73", // 藍墨
        sumi: "#2A241E", // 墨字
      },
      maxWidth: {
        app: "560px",
      },
    },
  },
  plugins: [],
};

export default config;
