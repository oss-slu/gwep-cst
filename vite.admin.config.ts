import { defineConfig } from "vite";

// The content editor at /admin (admin/index.html), built on its own after the
// site (npm run build), so nothing it bundles can end up in the viewer's
// files. Output goes to dist/admin/, next to the config.yml copied there from
// public/admin/. The dev server serves admin/index.html directly.
export default defineConfig({
  root: "admin",
  base: "/admin/",
  publicDir: false,
  cacheDir: "../.vite",
  build: {
    outDir: "../dist/admin",
    // The site's build has already filled dist/; keep it.
    emptyOutDir: false,
    // Sveltia CMS is one large bundle by design (about 2.6 MB); it loads
    // only on /admin.
    chunkSizeWarningLimit: 4000,
  },
});
