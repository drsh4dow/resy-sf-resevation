# Anti-slop provenance

- Source: <https://github.com/dmmulroy/anti-slop>
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Source directory: `skills/install-anti-slop/assets/anti-slop/`
- Installed directory: `tools/oxlint/anti-slop/`
- Generic entry point: `index.ts`
- Optional Effect entry point: `effect/index.ts` (not enabled)

The bundled installer copied these assets from a checkout of the commit above.
The nested `vendor/eslint-stylistic/LICENSE` and `UPSTREAM.md` are preserved.

## Local integration

All `@oxlint/plugins` imports use `vite-plus/lint/plugins` instead, including
those in the nested Stylistic vendor files. Vite+ 1.0 documents this entry point
as the supported way to use its bundled plugin API without separately installing
`oxlint` or `@oxlint/plugins`. The existing Vite+ import rule applied this change;
rule implementations are otherwise unchanged.

The repository's `vite.config.ts` enables all 18 generic rules and the native
`oxc/no-accumulating-spread` companion at error severity. Effect rules remain
vendored but disabled because the project has no direct Effect dependency.
Lint and format checks ignore the vendored plugin and installed agent assets.
