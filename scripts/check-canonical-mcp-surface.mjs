#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';

const REPO_ROOT = process.cwd();
const INCLUDE_ROOTS = ['docs', 'packages/starter-assets', 'examples'];
const INCLUDE_EXTENSIONS = new Set([
  '.json',
  '.js',
  '.md',
  '.mdc',
  '.mjs',
  '.toml',
  '.ts',
]);
const IGNORE_DIRS = new Set(['dist', 'node_modules']);
const IGNORE_BASENAMES = new Set(['package-lock.json']);
const BANNED_PATTERNS = [
  {
    label: 'legacy server name',
    regex: /iwsdk-dev-mcp/g,
  },
  {
    label: 'legacy tool prefix',
    regex: /mcp__iwsdk-dev-mcp__/g,
  },
  {
    label: 'port-embedded managed entry',
    regex: /--port/g,
  },
  {
    label: 'fixed starter/example port',
    regex: /\b8081\b/g,
  },
  {
    label: 'workspace-bound MCP entry',
    regex: /mcp stdio --workspace|"--workspace"/g,
  },
  {
    label: 'target selection command',
    regex: /target (list|use|current|clear)/g,
  },
  {
    label: 'broker-era wording',
    regex:
      /\bbroker-backed\b|\bbroker-managed\b|\bbroker-era\b|\bdev-broker\b|\bbroker resolves\b/g,
  },
];

async function walk(root, relativeDir = '') {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...(await walk(root, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (IGNORE_BASENAMES.has(entry.name)) {
      continue;
    }
    if (!INCLUDE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

async function main() {
  const violations = [];

  for (const includeRoot of INCLUDE_ROOTS) {
    const absoluteRoot = path.join(REPO_ROOT, includeRoot);
    const files = await walk(absoluteRoot);

    for (const relativeFile of files) {
      const absoluteFile = path.join(absoluteRoot, relativeFile);
      const content = await readFile(absoluteFile, 'utf8');

      for (const pattern of BANNED_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push({
            file: path.relative(REPO_ROOT, absoluteFile),
            label: pattern.label,
          });
        }
        pattern.regex.lastIndex = 0;
      }
    }
  }

  if (violations.length > 0) {
    console.error('Found legacy MCP references in canonical surfaces:');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.label}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Canonical MCP surface check passed.');
}

main().catch((error) => {
  console.error('[check-canonical-mcp-surface] Failed:', error);
  process.exit(1);
});
