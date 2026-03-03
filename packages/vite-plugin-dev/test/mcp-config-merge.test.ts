/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  mergeJsonConfig,
  unmergeJsonConfig,
  mergeTomlConfig,
  unmergeTomlConfig,
} from '../src/index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `mcp-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('mergeJsonConfig', () => {
  test('creates file with our entries when it does not exist', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const entries = {
      'iwsdk': { command: 'node', args: ['server.js', '--port', '8081'] },
    };

    const created = await mergeJsonConfig(filePath, entries, 'mcpServers');

    expect(created).toBe(true);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers['iwsdk']).toEqual(entries['iwsdk']);
  });

  test('preserves user entries when file already exists', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const userConfig = {
      mcpServers: {
        'my-custom-server': { command: 'python', args: ['server.py'] },
      },
    };
    await writeFile(filePath, JSON.stringify(userConfig, null, 2));

    const entries = {
      'iwsdk': { command: 'node', args: ['server.js'] },
    };

    const created = await mergeJsonConfig(filePath, entries, 'mcpServers');

    expect(created).toBe(false);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers['my-custom-server']).toEqual(
      userConfig.mcpServers['my-custom-server'],
    );
    expect(parsed.mcpServers['iwsdk']).toEqual(entries['iwsdk']);
  });

  test('updates existing managed entries in place', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const initial = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['old-server.js'] },
      },
    };
    await writeFile(filePath, JSON.stringify(initial, null, 2));

    const entries = {
      'iwsdk': { command: 'node', args: ['new-server.js', '--port', '9999'] },
    };

    const created = await mergeJsonConfig(filePath, entries, 'mcpServers');

    expect(created).toBe(false);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers['iwsdk'].args).toEqual([
      'new-server.js',
      '--port',
      '9999',
    ]);
  });

  test('works with different JSON keys (servers vs mcpServers)', async () => {
    const filePath = path.join(tmpDir, 'mcp.json');
    const entries = {
      'iwsdk': { command: 'node', args: ['server.js'] },
    };

    await mergeJsonConfig(filePath, entries, 'servers');

    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers['iwsdk']).toEqual(entries['iwsdk']);
    expect(parsed.mcpServers).toBeUndefined();
  });

  test('preserves sibling user keys within the same JSON section', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const initial = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['old-server.js'] },
        'my-custom-server': { command: 'python', args: ['server.py'] },
      },
    };
    await writeFile(filePath, JSON.stringify(initial, null, 2));

    // Re-merge with updated iwsdk entry
    const entries = {
      'iwsdk': { command: 'node', args: ['new-server.js', '--port', '9999'] },
    };

    await mergeJsonConfig(filePath, entries, 'mcpServers');

    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Our entry is updated
    expect(parsed.mcpServers['iwsdk'].args).toEqual(['new-server.js', '--port', '9999']);
    // User's sibling key survives
    expect(parsed.mcpServers['my-custom-server']).toEqual(
      initial.mcpServers['my-custom-server'],
    );
  });
});

describe('unmergeJsonConfig', () => {
  test('removes only our keys, keeps user entries', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const config = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['server.js'] },
        'iwsdk-rag-local': { command: 'node', args: ['rag.js'] },
        'my-custom-server': { command: 'python', args: ['server.py'] },
      },
    };
    await writeFile(filePath, JSON.stringify(config, null, 2));

    await unmergeJsonConfig(
      filePath,
      ['iwsdk', 'iwsdk-rag-local'],
      'mcpServers',
      false,
    );

    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers['my-custom-server']).toEqual(
      config.mcpServers['my-custom-server'],
    );
    expect(parsed.mcpServers['iwsdk']).toBeUndefined();
    expect(parsed.mcpServers['iwsdk-rag-local']).toBeUndefined();
  });

  test('deletes file when we created it and only our entries remain', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const config = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['server.js'] },
      },
    };
    await writeFile(filePath, JSON.stringify(config, null, 2));

    await unmergeJsonConfig(filePath, ['iwsdk'], 'mcpServers', true);

    expect(existsSync(filePath)).toBe(false);
  });

  test('keeps file when we created it but other top-level keys exist', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const config = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['server.js'] },
      },
      someOtherKey: 'value',
    };
    await writeFile(filePath, JSON.stringify(config, null, 2));

    await unmergeJsonConfig(filePath, ['iwsdk'], 'mcpServers', true);

    expect(existsSync(filePath)).toBe(true);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.someOtherKey).toBe('value');
    expect(parsed.mcpServers).toBeUndefined();
  });

  test('does not throw when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.json');

    await expect(
      unmergeJsonConfig(filePath, ['iwsdk'], 'mcpServers', false),
    ).resolves.toBeUndefined();
  });

  test('does not delete file when we did not create it, even if empty after removal', async () => {
    const filePath = path.join(tmpDir, '.mcp.json');
    const config = {
      mcpServers: {
        'iwsdk': { command: 'node', args: ['server.js'] },
      },
    };
    await writeFile(filePath, JSON.stringify(config, null, 2));

    await unmergeJsonConfig(filePath, ['iwsdk'], 'mcpServers', false);

    expect(existsSync(filePath)).toBe(true);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // The file should still exist with an empty object
    expect(Object.keys(parsed)).toHaveLength(0);
  });
});

describe('mergeTomlConfig', () => {
  test('creates file with managed block when it does not exist', async () => {
    const filePath = path.join(tmpDir, '.codex', 'config.toml');
    const entries = {
      'iwsdk': { command: 'node', args: ['server.js', '--port', '8081'] },
    };

    const created = await mergeTomlConfig(filePath, entries);

    expect(created).toBe(true);
    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('# --- IWER managed (do not edit) ---');
    expect(raw).toContain('# --- end IWER managed ---');
    expect(raw).toContain('[mcp_servers.iwsdk]');
    expect(raw).toContain('command = "node"');
    expect(raw).toContain('"server.js", "--port", "8081"');
  });

  test('preserves user content when file already exists', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const userContent = [
      '[settings]',
      'model = "gpt-4"',
      '',
    ].join('\n');
    await writeFile(filePath, userContent);

    const entries = {
      'iwsdk': { command: 'node', args: ['server.js'] },
    };

    const created = await mergeTomlConfig(filePath, entries);

    expect(created).toBe(false);
    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('[settings]');
    expect(raw).toContain('model = "gpt-4"');
    expect(raw).toContain('[mcp_servers.iwsdk]');
  });

  test('replaces old managed block with new one', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const existingContent = [
      '[settings]',
      'model = "gpt-4"',
      '',
      '# --- IWER managed (do not edit) ---',
      '[mcp_servers.iwer]',
      'command = "node"',
      'args = ["old-server.js"]',
      '',
      '# --- end IWER managed ---',
    ].join('\n');
    await writeFile(filePath, existingContent);

    const entries = {
      'iwsdk': { command: 'node', args: ['new-server.js', '--port', '9999'] },
    };

    await mergeTomlConfig(filePath, entries);

    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('"new-server.js", "--port", "9999"');
    expect(raw).not.toContain('old-server.js');
    // Should still have user content
    expect(raw).toContain('[settings]');
    // Should only have one managed block
    const starts = raw.split('# --- IWER managed (do not edit) ---');
    expect(starts).toHaveLength(2);
  });

  test('ignores TOML markers in wrong order and appends new block', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    // End marker appears before start marker — should be treated as no existing block
    const existingContent = [
      '[settings]',
      'model = "gpt-4"',
      '',
      '# --- end IWER managed ---',
      '# --- IWER managed (do not edit) ---',
    ].join('\n');
    await writeFile(filePath, existingContent);

    const entries = {
      'iwsdk': { command: 'node', args: ['server.js'] },
    };

    await mergeTomlConfig(filePath, entries);

    const raw = await readFile(filePath, 'utf-8');
    // Should have user content preserved (including the stale markers)
    expect(raw).toContain('[settings]');
    // Should have a valid new managed block appended
    expect(raw).toContain('[mcp_servers.iwsdk]');
    expect(raw).toContain('command = "node"');
  });
});

describe('unmergeTomlConfig', () => {
  test('removes managed block, keeps user content', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const content = [
      '[settings]',
      'model = "gpt-4"',
      '',
      '# --- IWER managed (do not edit) ---',
      '[mcp_servers.iwer]',
      'command = "node"',
      'args = ["server.js"]',
      '',
      '# --- end IWER managed ---',
    ].join('\n');
    await writeFile(filePath, content);

    await unmergeTomlConfig(filePath, false);

    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('[settings]');
    expect(raw).toContain('model = "gpt-4"');
    expect(raw).not.toContain('# --- IWER managed');
    expect(raw).not.toContain('[mcp_servers.iwer]');
  });

  test('deletes file when we created it and only managed block remains', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const content = [
      '# --- IWER managed (do not edit) ---',
      '[mcp_servers.iwer]',
      'command = "node"',
      'args = ["server.js"]',
      '',
      '# --- end IWER managed ---',
    ].join('\n');
    await writeFile(filePath, content);

    await unmergeTomlConfig(filePath, true);

    expect(existsSync(filePath)).toBe(false);
  });

  test('does not throw when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.toml');

    await expect(
      unmergeTomlConfig(filePath, false),
    ).resolves.toBeUndefined();
  });

  test('does not delete file when we did not create it, even if empty after removal', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const content = [
      '# --- IWER managed (do not edit) ---',
      '[mcp_servers.iwer]',
      'command = "node"',
      'args = ["server.js"]',
      '',
      '# --- end IWER managed ---',
    ].join('\n');
    await writeFile(filePath, content);

    await unmergeTomlConfig(filePath, false);

    // File should still exist (we didn't create it)
    expect(existsSync(filePath)).toBe(true);
  });

  test('preserves file with user content but no managed block, even if weCreatedFile=true', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const userContent = [
      '[settings]',
      'model = "gpt-4"',
      '',
    ].join('\n');
    await writeFile(filePath, userContent);

    await unmergeTomlConfig(filePath, true);

    // File should still exist with user content intact
    expect(existsSync(filePath)).toBe(true);
    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('[settings]');
    expect(raw).toContain('model = "gpt-4"');
  });

  test('ignores TOML markers in wrong order and leaves file untouched', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    // End marker appears before start marker — should be treated as no managed block
    const existingContent = [
      '[settings]',
      'model = "gpt-4"',
      '',
      '# --- end IWER managed ---',
      '# --- IWER managed (do not edit) ---',
    ].join('\n');
    await writeFile(filePath, existingContent);

    await unmergeTomlConfig(filePath, false);

    // File should be unchanged
    const raw = await readFile(filePath, 'utf-8');
    expect(raw).toContain('[settings]');
    expect(raw).toContain('model = "gpt-4"');
    // The stale markers should remain since they weren't in valid order
    expect(raw).toContain('# --- end IWER managed ---');
    expect(raw).toContain('# --- IWER managed (do not edit) ---');
  });
});
