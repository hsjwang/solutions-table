import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the repository name for GitHub Pages project sites,
// e.g. https://<user>.github.io/solutions-table/ -> base: "/solutions-table/"
// For a user/org site (<user>.github.io) use base: "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/solutions-table/",
  build: { outDir: "dist" },
});
