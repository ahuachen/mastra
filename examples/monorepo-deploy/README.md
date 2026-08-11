# Monorepo deploy artifacts

A Turborepo monorepo that shows what `@mastra/deployer` puts in `.mastra/output` when a Mastra app
depends on workspace packages, and checks that the result can actually be installed by a deploy
target.

It exists because of [#21129](https://github.com/mastra-ai/mastra/issues/21129): deployer 1.56
started declaring workspace packages as `file:./workspace-module/<pkg>.tgz` dependencies even when
their code was already compiled into the bundle. A deploy target that installs from the generated
`package.json` before the rest of the output is available cannot resolve those paths, so the install
failed with repeated `tarball data ... seems to be corrupted` warnings and then `ENOENT`.

## Layout

```text
packages/
  contracts/    root export, TypeScript source        → compiled into the bundle
  orders/       root export, depends on contracts     → compiled into the bundle
  logging/      root export                           → compiled into the bundle
  receipts/     root export, imports formatters       → compiled into the bundle
  formatters/   subpath-only exports, JavaScript      → shipped as a tarball
apps/
  bundled-app/  depends on contracts, orders, logging
  subpath-app/  depends on receipts, formatters
```

`@repo/formatters` has no `"."` entry in its `exports` map. The bundler can inline the subpaths that
are actually imported, but any other subpath still resolves against `node_modules` at runtime, so the
package has to be installed — which is why it is plain JavaScript. TypeScript source only works for
workspace packages that stay symlinked or get compiled into the bundle; once a package is packed into
a tarball and installed, Node refuses to load `.ts` files from `node_modules`.

## The two apps

**`bundled-app`** is the shape reported in #21129. Every workspace package it uses has a root export,
so all of them are compiled into `mastra.mjs`. The artifact should contain no `workspace-module/`
directory and no tarball dependencies at all, and it should install from `package.json` alone.

**`subpath-app`** is the shape the fix deliberately leaves alone. `@repo/receipts` is compiled in,
but it imports `@repo/formatters/currency` at runtime and the app itself imports
`@repo/formatters/date`, so `@repo/formatters` is still packed into `workspace-module/` and declared
in the manifest. Installing this artifact still requires those tarballs to be present, so a deploy
target that runs the install before the tarballs are in place will still fail on it. That is a
property of the artifact, not a regression — the packages genuinely have to be installed.

## Running it

```bash
pnpm install
pnpm build:linked-workspace-deps   # builds the repo's mastra CLI and deployer
pnpm verify
```

`pnpm verify` builds both apps and, for each one, checks that:

1. workspace packages compiled into the bundle are not also declared in `.mastra/output/package.json`
2. workspace packages the bundle imports at runtime _are_ declared
3. `workspace-module/` holds exactly those tarballs and no others — read off disk, so a tarball
   packed for a package that was compiled in fails the run even if nothing references it
4. the artifact ships a `package-lock.json` when it has no tarballs, and skips it when it does
5. installing from the manifest alone behaves as described above for that app
6. the built server boots and its `/workspace` route returns values from every workspace package —
   including the one loaded out of the installed tarball

The last check is the one that catches over-correction. Dropping a workspace package that the bundle
really does import at runtime would leave the artifact installable but broken at boot with
`ERR_MODULE_NOT_FOUND`.

Expected output on a fixed deployer is `13/13 checks passed`. Against deployer 1.56 or 1.57 the
`bundled-app` checks fail: all three of its workspace packages get declared as tarballs and the
manifest-only install dies with `ENOENT`.

The manifest-only install needs network access to fetch the app's normal dependencies from npm.

## Package managers

The example uses pnpm so it can link the repo's local `mastra`, `@mastra/core` and `@mastra/deployer`
builds. #21129 was reported on npm workspaces; the artifact is the same either way, because the
`file:` specs are written into `.mastra/output/package.json` regardless of which package manager the
source repo uses.
