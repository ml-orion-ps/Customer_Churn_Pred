import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(async () => {
  const isProductionBuild = process.env.NODE_ENV === "production";
  const plugins = [react()];

  if (!isProductionBuild) {
    const runtimeErrorOverlay = await import("@replit/vite-plugin-runtime-error-modal").then(
      (module) => module.default,
    );

    plugins.push(runtimeErrorOverlay());

    if (process.env.REPL_ID !== undefined) {
      const cartographer = await import("@replit/vite-plugin-cartographer").then(
        (module) => module.cartographer,
      );
      const devBanner = await import("@replit/vite-plugin-dev-banner").then(
        (module) => module.devBanner,
      );

      plugins.push(cartographer(), devBanner());
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
