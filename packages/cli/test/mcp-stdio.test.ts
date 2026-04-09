/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import os from 'os';
import path from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketServer } from 'ws';
import { type RuntimeBrowserState } from '@iwsdk/cli/contract';
import {
  registerRuntimeSession,
  unregisterRuntimeSession,
} from '../src/runtime-state.js';

const CLI_PATH = path.join(
  '/Users/fe1ix/Projects/webxr-dev-platform/immersive-web-sdk',
  'packages',
  'cli',
  'dist',
  'cli.js',
);

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0ZQAAAAASUVORK5CYII=';

let tempDir: string;
let appRoot: string;

type RuntimeResponse = {
  result?: unknown;
  error?: {
    message?: string;
    cause?:
      | 'browser_not_ready'
      | 'browser_not_launched'
      | 'browser_launch_failed'
      | 'connection_lost'
      | 'permission_denied'
      | 'browser_relaunched'
      | 'tab_throttled'
      | 'open_failed';
  };
  _tabId?: string;
  _tabGeneration?: number;
};

async function createAppFixture(root: string) {
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        private: true,
        devDependencies: {
          '@iwsdk/vite-plugin-dev': 'workspace:*',
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(path.join(root, 'vite.config.ts'), 'export default {}\n', 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.ts'), 'export {};\n', 'utf8');
}

function createBrowserState(
  status: RuntimeBrowserState['status'] = 'connected',
): RuntimeBrowserState {
  return {
    status,
    connected: status === 'connected',
    connectedClientCount: status === 'connected' ? 1 : 0,
    lastTransitionAt: new Date().toISOString(),
  };
}

async function startRuntimeFixture(
  workspaceRoot: string,
  handler: (request: { method: string; params?: unknown }) => RuntimeResponse,
) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  server.on('connection', (socket) => {
    socket.on('message', (chunk) => {
      const request = JSON.parse(chunk.toString()) as {
        id: string;
        method: string;
        params?: unknown;
      };
      const response = handler({ method: request.method, params: request.params });
      socket.send(
        JSON.stringify({
          id: request.id,
          ...response,
        }),
      );
    });
  });

  await registerRuntimeSession({
    sessionId: `session-${path.basename(workspaceRoot)}`,
    workspaceRoot,
    pid: process.pid,
    port,
    localUrl: `http://localhost:${port}`,
    aiMode: 'agent',
    aiTools: ['claude'],
    browser: createBrowserState(),
  });

  return {
    async close() {
      await unregisterRuntimeSession(workspaceRoot);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function connectMcpClient(workspaceRoot: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, 'mcp', 'stdio'],
    cwd: workspaceRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'mcp-stdio-test', version: '1.0.0' });
  await client.connect(transport);

  return {
    client,
    async close() {
      await transport.close();
    },
  };
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-mcp-stdio-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  appRoot = path.join(tempDir, 'apps', 'app-a');
  await createAppFixture(appRoot);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('mcp stdio interface shaping', () => {
  test('returns array payloads before the separate _tab metadata block', async () => {
    const runtime = await startRuntimeFixture(appRoot, ({ method }) => {
      if (method === 'get_console_logs') {
        return {
          result: [
            {
              level: 'info',
              text: 'hello from runtime',
              timestamp: '2026-04-07T00:00:00.000Z',
            },
          ],
          _tabId: 'tab-1',
          _tabGeneration: 1,
        };
      }

      return {
        result: { ok: true },
        _tabId: 'tab-1',
        _tabGeneration: 1,
      };
    });
    const mcp = await connectMcpClient(appRoot);

    try {
      const result = await mcp.client.callTool({
        name: 'browser_get_console_logs',
        arguments: { count: 20, level: ['info'] },
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(2);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[1]?.type).toBe('text');
      expect(JSON.parse(result.content[0]?.text ?? '')).toEqual([
        {
          level: 'info',
          text: 'hello from runtime',
          timestamp: '2026-04-07T00:00:00.000Z',
        },
      ]);
      expect(JSON.parse(result.content[1]?.text ?? '')).toEqual({
        _tab: { id: 'tab-1', generation: 1 },
      });
    } finally {
      await mcp.close();
      await runtime.close();
    }
  });

  test('emits a warning when the active tab changes', async () => {
    let currentTabId = 'tab-1';
    let currentGeneration = 1;

    const runtime = await startRuntimeFixture(appRoot, ({ method }) => {
      if (method === 'reload_page') {
        currentTabId = 'tab-2';
        currentGeneration = 2;
        return {
          result: { reloaded: true },
          _tabId: currentTabId,
          _tabGeneration: currentGeneration,
        };
      }

      return {
        result: { sessionOffered: true, sessionActive: false },
        _tabId: currentTabId,
        _tabGeneration: currentGeneration,
      };
    });
    const mcp = await connectMcpClient(appRoot);

    try {
      const initial = await mcp.client.callTool({
        name: 'xr_get_session_status',
        arguments: {},
      });
      expect(initial.isError).not.toBe(true);

      const reloaded = await mcp.client.callTool({
        name: 'browser_reload_page',
        arguments: {},
      });
      expect(reloaded.isError).not.toBe(true);
      expect(reloaded.content[0]?.type).toBe('text');
      expect(reloaded.content[0]?.text).toContain('Active browser tab changed');
      expect(JSON.parse(reloaded.content[1]?.text ?? '')).toMatchObject({
        reloaded: true,
        _tab: { id: 'tab-2', generation: 2 },
      });
    } finally {
      await mcp.close();
      await runtime.close();
    }
  });

  test('returns screenshots as MCP image content', async () => {
    const runtime = await startRuntimeFixture(appRoot, ({ method }) => {
      if (method === 'screenshot') {
        return {
          result: {
            imageData: ONE_BY_ONE_PNG_BASE64,
            mimeType: 'image/png',
          },
          _tabId: 'tab-1',
          _tabGeneration: 1,
        };
      }

      return {
        result: { ok: true },
        _tabId: 'tab-1',
        _tabGeneration: 1,
      };
    });
    const mcp = await connectMcpClient(appRoot);

    try {
      const result = await mcp.client.callTool({
        name: 'browser_screenshot',
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'image',
        data: ONE_BY_ONE_PNG_BASE64,
        mimeType: 'image/png',
      });
    } finally {
      await mcp.close();
      await runtime.close();
    }
  });

  test('returns structured JSON error content with cause and browser details', async () => {
    const runtime = await startRuntimeFixture(appRoot, ({ method }) => {
      if (method === 'get_object_transform') {
        return {
          error: {
            message: 'Permission denied while reading object transform',
            cause: 'permission_denied',
          },
          _tabId: 'tab-1',
          _tabGeneration: 1,
        };
      }

      return {
        result: { ok: true },
        _tabId: 'tab-1',
        _tabGeneration: 1,
      };
    });
    const mcp = await connectMcpClient(appRoot);

    try {
      const result = await mcp.client.callTool({
        name: 'scene_get_object_transform',
        arguments: { uuid: 'missing-object' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      const payload = JSON.parse(result.content[0]?.text ?? '');
      expect(payload).toMatchObject({
        message: 'Permission denied while reading object transform',
        cause: 'permission_denied',
        browser: {
          status: 'connected',
          connected: true,
          connectedClientCount: 1,
        },
      });
      expect(typeof payload.browser.lastTransitionAt).toBe('string');
    } finally {
      await mcp.close();
      await runtime.close();
    }
  });
});
