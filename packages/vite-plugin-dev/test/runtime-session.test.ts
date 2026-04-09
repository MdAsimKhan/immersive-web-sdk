/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import os from 'os';
import path from 'path';
import { mkdir, readFile, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { IWSDK_RUNTIME_SESSION_PATH } from '@iwsdk/cli/contract';
import {
  registerRuntimeSession,
  setRuntimeSessionBrowserState,
  unregisterRuntimeSession,
} from '../src/runtime-session.js';

let tempDir: string;
let workspaceRoot: string;

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-plugin-runtime-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  workspaceRoot = path.join(tempDir, 'app');
  await mkdir(workspaceRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('runtime session writer', () => {
  test('writes and removes project-local runtime session files', async () => {
    const session = await registerRuntimeSession({
      sessionId: 'session-1',
      workspaceRoot,
      pid: process.pid,
      port: 5174,
      localUrl: 'https://localhost:5174',
      networkUrls: ['https://192.168.1.2:5174'],
      aiMode: 'agent',
      aiTools: ['claude'],
    });

    const sessionFile = path.join(workspaceRoot, IWSDK_RUNTIME_SESSION_PATH);
    const written = JSON.parse(await readFile(sessionFile, 'utf8'));

    expect(session.port).toBe(5174);
    expect(written.port).toBe(5174);
    expect(written.localUrl).toBe('https://localhost:5174');
    expect(written.aiTools).toEqual(['claude']);

    await unregisterRuntimeSession(workspaceRoot);
    await expect(readFile(sessionFile, 'utf8')).rejects.toThrow();
  });

  test('updates browser readiness state incrementally', async () => {
    await registerRuntimeSession({
      sessionId: 'session-2',
      workspaceRoot,
      pid: process.pid,
      port: 5175,
      localUrl: 'https://localhost:5175',
      aiMode: 'agent',
      aiTools: ['claude'],
      browser: {
        status: 'launching',
        connected: false,
        connectedClientCount: 0,
        lastTransitionAt: new Date().toISOString(),
      },
    });

    const updated = await setRuntimeSessionBrowserState(workspaceRoot, {
      status: 'connected',
      connected: true,
      connectedClientCount: 1,
      lastTransitionAt: new Date().toISOString(),
    });

    const sessionFile = path.join(workspaceRoot, IWSDK_RUNTIME_SESSION_PATH);
    const written = JSON.parse(await readFile(sessionFile, 'utf8'));
    expect(updated?.browser?.status).toBe('connected');
    expect(written.browser.connected).toBe(true);
    expect(written.browser.connectedClientCount).toBe(1);
  });
});
