import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["lib/__tests__/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
