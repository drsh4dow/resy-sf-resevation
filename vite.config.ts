import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const toolingIgnorePatterns = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
  "tools/oxlint/anti-slop/**",
  // TanStack owns this file's formatting and emits its own type-check directive.
  "src/routeTree.gen.ts",
];

const config = defineConfig({
  staged: {
    "*": "vp check --fix --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: toolingIgnorePatterns,
  },
  lint: {
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    plugins: ["unicorn", "typescript", "oxc", "react", "jsx-a11y", "import", "promise"],
    ignorePatterns: toolingIgnorePatterns,
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "react/rules-of-hooks": "error",
      // The automatic JSX runtime does not require a React import.
      "react/react-in-jsx-scope": "off",
      "typescript/no-misused-promises": "error",
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
    },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => {
    // Data tests need Vite's runner, not Nitro's application server or route generation.
    if (process.env.VITEST) {
      return [];
    }

    return [
      devtools(),
      nitro({
        rollupConfig: { external: [/^@sentry\//] },
        rolldownConfig: {
          // This SSR app has no React Server Component directive boundaries.
          checks: { moduleLevelDirective: false },
        },
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
    ];
  }),
});

export default config;
