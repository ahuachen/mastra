#!/usr/bin/env node
// Builds both apps and checks what the deployer put in each deploy artifact.
//
// See ../README.md for what each app is meant to show. Run with `pnpm verify`.

import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const APPS = [
  {
    name: 'bundled-app',
    // The shape reported in #21129: every workspace dependency has a root export, so the bundler
    // compiles all of them in and the artifact needs no tarballs at all.
    bundled: ['@repo/contracts', '@repo/orders', '@repo/logging'],
    packed: [],
    manifestInstall: 'succeeds',
    expectLockfile: true,
    expectMarkers: [
      'contracts: compiled into the bundle',
      'orders: compiled into the bundle',
      'logging: compiled into the bundle',
    ],
  },
  {
    name: 'subpath-app',
    // @repo/formatters has no root export. The bundle imports it at runtime, so it still ships as
    // a tarball — and the artifact still cannot be installed from the manifest on its own.
    bundled: ['@repo/receipts', '@repo/contracts'],
    packed: ['@repo/formatters'],
    manifestInstall: 'fails',
    expectLockfile: false,
    expectMarkers: ['receipts: compiled into the bundle', 'formatters: installed from workspace-module/'],
  },
];

const results = [];
const tempDirs = [];

/** The filename `DepsService` packs a workspace package under, e.g. `@repo/formatters` → `repo-formatters-1.0.0.tgz`. */
function tarballName(packageName, version = '1.0.0') {
  return `${packageName.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`;
}

function check(app, name, ok, detail) {
  results.push({ app, name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function build(appDir) {
  const bin = join(appDir, 'node_modules', '.bin', 'mastra');
  if (!existsSync(bin)) {
    throw new Error(`${bin} is missing. Run \`pnpm install\` in ${exampleRoot} first.`);
  }
  execFileSync(bin, ['build'], { cwd: appDir, stdio: 'inherit' });
}

/** Installs from the manifest alone, the way a deploy target does before it has the rest of the output. */
function installFromManifestOnly(outputDir) {
  const layer = mkdtempSync(join(tmpdir(), 'mastra-manifest-layer-'));
  tempDirs.push(layer);

  for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
    if (existsSync(join(outputDir, file))) {
      copyFileSync(join(outputDir, file), join(layer, file));
    }
  }

  try {
    execFileSync('npm', ['install', '--force', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: layer,
      stdio: 'pipe',
    });
    return { ok: true };
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return { ok: false, output };
  }
}

/** Asks the OS for a port nothing is listening on, so a stray dev server cannot fail the run. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/** Boots the built artifact and reads the route that exercises every workspace package. */
async function readWorkspaceRoute(outputDir, port) {
  const server = spawn(process.execPath, ['index.mjs'], {
    cwd: outputDir,
    env: { ...process.env, MASTRA_PORT: String(port), PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', chunk => (serverOutput += chunk));
  server.stderr.on('data', chunk => (serverOutput += chunk));

  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`server exited with code ${server.exitCode}\n${serverOutput}`);
      }

      try {
        const response = await fetch(`http://127.0.0.1:${port}/workspace`);
        if (response.ok) return await response.json();
        throw new Error(`GET /workspace returned ${response.status}`);
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await sleep(500);
      }
    }

    throw new Error(`server did not answer on port ${port}\n${serverOutput}`);
  } finally {
    server.kill('SIGKILL');
  }
}

for (const app of APPS) {
  console.log(`\n── ${app.name} ${'─'.repeat(Math.max(0, 60 - app.name.length))}`);

  const appDir = join(exampleRoot, 'apps', app.name);
  const outputDir = join(appDir, '.mastra', 'output');

  build(appDir);

  const manifest = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf-8'));
  const dependencies = manifest.dependencies ?? {};

  const declaredButBundled = app.bundled.filter(name => name in dependencies);
  check(
    app.name,
    'bundled workspace packages stay out of the artifact manifest',
    declaredButBundled.length === 0,
    declaredButBundled.length ? `still declared: ${declaredButBundled.join(', ')}` : app.bundled.join(', '),
  );

  for (const name of app.packed) {
    const spec = dependencies[name];
    check(
      app.name,
      `${name} is declared as a packed tarball`,
      spec === `file:./workspace-module/${tarballName(name)}`,
      spec ?? 'not declared',
    );
  }

  const tarballRefs = Object.entries(dependencies).filter(([, spec]) => String(spec).includes('workspace-module'));
  check(
    app.name,
    `artifact references exactly ${app.packed.length} tarball(s)`,
    tarballRefs.length === app.packed.length,
    tarballRefs.map(([name]) => name).join(', ') || 'none',
  );

  // Read the directory rather than trusting the manifest: a tarball packed for a package that was
  // compiled in is dead weight in the artifact even when nothing references it.
  const workspaceModuleDir = join(outputDir, 'workspace-module');
  const packedTarballs = existsSync(workspaceModuleDir)
    ? readdirSync(workspaceModuleDir)
        .filter(name => name.endsWith('.tgz'))
        .sort()
    : [];
  const expectedTarballs = app.packed.map(name => tarballName(name)).sort();
  check(
    app.name,
    'workspace-module/ holds exactly the tarballs the artifact needs',
    packedTarballs.join(',') === expectedTarballs.join(','),
    packedTarballs.join(', ') || 'empty',
  );

  const hasLockfile = existsSync(join(outputDir, 'package-lock.json'));
  check(
    app.name,
    app.expectLockfile ? 'artifact ships a package-lock.json' : 'artifact skips package-lock.json (has tarballs)',
    hasLockfile === app.expectLockfile,
    hasLockfile ? 'present' : 'absent',
  );

  const install = installFromManifestOnly(outputDir);
  const enoent = !install.ok && /ENOENT|seems to be corrupted/.test(install.output);
  check(
    app.name,
    `installing from the manifest alone ${app.manifestInstall}`,
    app.manifestInstall === 'succeeds' ? install.ok : !install.ok && enoent,
    install.ok
      ? 'installed'
      : enoent
        ? 'the manifest points at a tarball that is not in this directory'
        : 'failed for another reason',
  );

  const body = await readWorkspaceRoute(outputDir, await freePort());
  const missing = app.expectMarkers.filter(marker => !JSON.stringify(body).includes(marker));
  check(
    app.name,
    'the built server answers with values from every workspace package',
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : JSON.stringify(body),
  );
}

for (const dir of tempDirs) {
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) {
  for (const result of failed) {
    console.log(`  ✗ [${result.app}] ${result.name} — ${result.detail}`);
  }
  process.exit(1);
}
