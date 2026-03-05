#!/usr/bin/env node --no-warnings
/**
 * Test preparation script for the IWSDK test orchestrator.
 *
 * Usage:
 *   node scripts/test-prep.mjs clone     — copy poke → poke-ecs, poke-environment, poke-level, poke-ui
 *   node scripts/test-prep.mjs install   — npm run fresh:install in all 9 example dirs in parallel
 *   node scripts/test-prep.mjs cleanup   — delete the 4 poke clone directories
 */

import { cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXAMPLES = join(ROOT, 'examples');

const CLONE_VARIANTS = ['poke-ecs', 'poke-environment', 'poke-level', 'poke-ui'];
const ALL_DIRS = ['poke', ...CLONE_VARIANTS, 'audio', 'grab', 'locomotion', 'physics'];
const EXCLUDE = new Set(['node_modules', 'package-lock.json', 'dist', '.mcp.json']);

const command = process.argv[2];

if (!command || !['clone', 'install', 'cleanup'].includes(command)) {
  console.error('Usage: node scripts/test-prep.mjs <clone|install|cleanup>');
  process.exit(1);
}

if (command === 'clone') {
  const src = join(EXAMPLES, 'poke');
  if (!existsSync(src)) {
    console.error(`Source directory not found: ${src}`);
    process.exit(1);
  }

  for (const variant of CLONE_VARIANTS) {
    const dest = join(EXAMPLES, variant);
    console.log(`Cloning poke → ${variant}...`);
    cpSync(src, dest, {
      recursive: true,
      filter: (source) => {
        const name = basename(source);
        return !EXCLUDE.has(name);
      },
    });
  }
  console.log(`Done. Created ${CLONE_VARIANTS.length} clones.`);
}

if (command === 'install') {
  console.log(`Installing dependencies in ${ALL_DIRS.length} examples...`);

  const results = await Promise.all(
    ALL_DIRS.map(
      (dir) =>
        new Promise((resolve) => {
          const cwd = join(EXAMPLES, dir);
          if (!existsSync(cwd)) {
            console.log(`  ${dir}: SKIP (not found)`);
            resolve({ dir, ok: false, reason: 'not found' });
            return;
          }

          const child = spawn('npm', ['run', 'fresh:install'], {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let stderr = '';
          child.stderr.on('data', (chunk) => (stderr += chunk));

          child.on('close', (code) => {
            if (code === 0) {
              console.log(`  ${dir}: OK`);
              resolve({ dir, ok: true });
            } else {
              console.log(`  ${dir}: FAIL (exit ${code})`);
              resolve({ dir, ok: false, reason: stderr.slice(-200) });
            }
          });
        })
    )
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} install(s) failed:`);
    for (const f of failed) console.error(`  ${f.dir}: ${f.reason}`);
    process.exit(1);
  }
  console.log(`\nAll ${ALL_DIRS.length} examples installed.`);
}

if (command === 'cleanup') {
  for (const variant of CLONE_VARIANTS) {
    const dir = join(EXAMPLES, variant);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`Deleted ${variant}`);
    } else {
      console.log(`${variant}: not found (already clean)`);
    }
  }
  console.log('Cleanup done.');
}
