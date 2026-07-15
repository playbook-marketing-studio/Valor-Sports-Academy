/**
 * Bundle the MCP server into a single self-contained Netlify function.
 * The artifact is COMMITTED (netlify/functions/mcp.mjs) so the client site
 * keeps its zero-build deploy: Netlify just zips the file.
 *
 * Rebuild after any change here:  cd site-editor && npm run build
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/netlify.ts"],
  outfile: "../netlify/functions/mcp.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  banner: {
    js: [
      "// Generated file - do not edit. Source: site-editor/src (npm run build).",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
