import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiUrl = process.env.VITE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
if (process.env.VERCEL && !apiUrl) {
  throw new Error("Configure VITE_API_URL na Vercel com a URL pública do backend seguida de /api");
}

export default defineConfig({
  root: "vercel",
  plugins: [react()],
  define: {
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(apiUrl),
  },
  build: {
    outDir: "../dist-vercel",
    emptyOutDir: true,
  },
});
