/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, realpath, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type RuntimeBrowserState,
  type RuntimeSession,
} from '@iwsdk/cli/contract';
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
let appA: string;
let appB: string;

async function createAppFixture(
  root: string,
  packageJsonOverrides: Record<string, unknown> = {},
) {
  await mkdir(root, { recursive: true });
  const packageJson = {
    name: 'fixture-app',
    private: true,
    ...packageJsonOverrides,
  };
  packageJson.devDependencies = {
    '@iwsdk/vite-plugin-dev': 'workspace:*',
    ...(packageJsonOverrides.devDependencies as Record<string, unknown> | undefined),
  };
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  await writeFile(path.join(root, 'vite.config.ts'), 'export default {}\n', 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.ts'), 'export {};\n', 'utf8');
}

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function startRuntimeFixture(workspaceRoot: string) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  server.on('connection', (socket) => {
    socket.on('message', (chunk) => {
      const request = JSON.parse(chunk.toString());
      const response = {
        id: request.id,
        result:
          request.method === 'get_session_status'
            ? { sessionMode: 'immersive-vr', running: true }
            : request.method === 'screenshot'
              ? {
                  imageData: ONE_BY_ONE_PNG_BASE64,
                  mimeType: 'image/png',
                }
              : {
                  ok: true,
                  method: request.method,
                  params: request.params ?? {},
                },
        _tabId: 'tab-1',
        _tabGeneration: 1,
      };
      socket.send(JSON.stringify(response));
    });
  });

  await registerRuntimeSession({
    sessionId: `session-${path.basename(workspaceRoot)}`,
    workspaceRoot,
    pid: process.pid,
    port,
    localUrl: `http://localhost:${port}`,
    aiMode: 'agent',
    aiTools: ['claude', 'cursor'],
    browser: {
      status: 'connected',
      connected: true,
      connectedClientCount: 1,
      lastTransitionAt: new Date().toISOString(),
    },
  });

  return {
    async close() {
      await unregisterRuntimeSession(workspaceRoot);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function createBrowserState(
  status: RuntimeBrowserState['status'],
  overrides: Partial<RuntimeBrowserState> = {},
): RuntimeBrowserState {
  return {
    status,
    connected: status === 'connected',
    connectedClientCount: status === 'connected' ? 1 : 0,
    lastTransitionAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildManagedRuntimeScript(
  sessionId: string,
  options: {
    initialBrowserStatus?: RuntimeBrowserState['status'];
    finalBrowserStatus?: RuntimeBrowserState['status'];
    finalBrowserDelayMs?: number;
    finalBrowserError?: RuntimeBrowserState['lastError'];
  } = {},
): string {
  const initialBrowser = JSON.stringify(
    createBrowserState(options.initialBrowserStatus ?? 'launching'),
  );
  const finalBrowser = (options.finalBrowserStatus ?? 'connected')
    ? JSON.stringify(
        createBrowserState(options.finalBrowserStatus ?? 'connected', {
          ...(options.finalBrowserError
            ? {
                lastError: options.finalBrowserError,
              }
            : {}),
        }),
      )
    : null;
  const finalBrowserDelayMs = options.finalBrowserDelayMs ?? 100;

  return `import http from 'node:http';
import { realpathSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = realpathSync.native(process.cwd());
const sessionFile = path.join(workspaceRoot, '.iwsdk', 'runtime', 'session.json');
const server = http.createServer((_, res) => res.end('ok'));

async function writeSession(port, browser) {
  const now = new Date().toISOString();
  const session = {
    schemaVersion: ${IWSDK_RUNTIME_STATE_SCHEMA_VERSION},
    sessionId: ${JSON.stringify(sessionId)},
    workspaceRoot,
    pid: process.pid,
    port,
    localUrl: 'http://localhost:' + port,
    networkUrls: [],
    aiMode: 'agent',
    aiTools: ['claude', 'cursor'],
    browser,
    registeredAt: now,
    updatedAt: now,
  };
  await mkdir(path.dirname(sessionFile), { recursive: true });
  await writeFile(sessionFile, JSON.stringify(session, null, 2) + '\\n', 'utf8');
}

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await writeSession(port, ${initialBrowser});
  ${
    finalBrowser
      ? `setTimeout(() => {
  void writeSession(port, ${finalBrowser});
}, ${finalBrowserDelayMs});`
      : ''
  }
});

process.on('SIGTERM', async () => {
  await rm(sessionFile, { force: true }).catch(() => {});
  server.close(() => process.exit(0));
});

setInterval(() => {}, 1000);
`;
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  appA = path.join(tempDir, 'apps', 'app-a');
  appB = path.join(tempDir, 'apps', 'app-b');
  await createAppFixture(appA);
  await createAppFixture(appB);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('runtime commands and project resolution', () => {
  test('resolves the nearest IWSDK workspace root for runtime commands', async () => {
    const runtime = await startRuntimeFixture(appA);

    try {
      const xrStatus = await runCli(['xr', 'status'], path.join(appA, 'src'));
      expect(xrStatus.exitCode).toBe(0);
      const parsedStatus = JSON.parse(xrStatus.stdout);
      expect(parsedStatus.data.workspaceRoot).toBe(await realpath(appA));
      expect(parsedStatus.data.operation).toBe('xr.status');
      expect(parsedStatus.data.result.running).toBe(true);

      const screenshot = await runCli(['browser', 'screenshot'], path.join(appA, 'src'));
      expect(screenshot.exitCode).toBe(0);
      const parsedScreenshot = JSON.parse(screenshot.stdout);
      expect(existsSync(parsedScreenshot.data.screenshotPath)).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  test('fails outside an IWSDK workspace for runtime commands', async () => {
    const result = await runCli(['xr', 'status'], tempDir);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stderr);
    expect(parsed.error.message).toContain('No IWSDK app found at or above');
  });

  test('suggests starting the runtime when no session is active', async () => {
    const result = await runCli(['xr', 'status'], appA);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stderr);
    expect(parsed.error.message).toContain('No running IWSDK runtime found');
    expect(parsed.error.message).toContain('iwsdk dev up');
  });
});

describe('runtime introspection and raw output', () => {
  test('reports browser readiness in dev status', async () => {
    await registerRuntimeSession({
      sessionId: 'session-status',
      workspaceRoot: appA,
      pid: process.pid,
      port: 5190,
      localUrl: 'http://localhost:5190',
      aiMode: 'agent',
      aiTools: ['claude'],
      browser: createBrowserState('connected'),
    });

    const status = await runCli(['dev', 'status'], appA);
    expect(status.exitCode).toBe(0);
    const parsed = JSON.parse(status.stdout);
    expect(parsed.data.state.browserConnected).toBe(true);
    expect(parsed.data.state.session.browser.status).toBe('connected');
  });

  test('inspects one runtime tool schema', async () => {
    const inspect = await runCli(['mcp', 'inspect', '--tool', 'xr_look_at'], appA);
    expect(inspect.exitCode).toBe(0);
    const parsed = JSON.parse(inspect.stdout);
    expect(parsed.data.tool.mcpName).toBe('xr_look_at');
    expect(parsed.data.tool.cliPath).toBe('xr look-at');
    expect(parsed.data.tool.inputSchema.required).toContain('device');
    expect(parsed.data.tool.inputSchema.required).toContain('target');
  });

  test('prints schema-backed help for runtime commands', async () => {
    const xrHelp = await runCli(['xr', 'look-at', '--help'], appA);
    expect(xrHelp.exitCode).toBe(0);
    expect(xrHelp.stdout).toContain('Usage: iwsdk xr look-at');
    expect(xrHelp.stdout).toContain('device (required) [enum]');
    expect(xrHelp.stdout).toContain('controller-right');

    const ecsHelp = await runCli(['ecs', 'toggle-system', '--help'], appA);
    expect(ecsHelp.exitCode).toBe(0);
    expect(ecsHelp.stdout).toContain('Usage: iwsdk ecs toggle-system');
    expect(ecsHelp.stdout).toContain('name (required)');
    expect(ecsHelp.stdout).not.toContain('systemName');
  });

  test('returns underlying runtime payloads with --raw', async () => {
    const runtime = await startRuntimeFixture(appA);

    try {
      const xrStatus = await runCli(['xr', 'status', '--raw'], path.join(appA, 'src'));
      expect(xrStatus.exitCode).toBe(0);
      const parsedStatus = JSON.parse(xrStatus.stdout);
      expect(parsedStatus.running).toBe(true);
      expect(parsedStatus.browserConnected).toBe(true);
      expect(parsedStatus.ok).toBeUndefined();

      const screenshot = await runCli(
        ['browser', 'screenshot', '--raw'],
        path.join(appA, 'src'),
      );
      expect(screenshot.exitCode).toBe(0);
      const parsedScreenshot = JSON.parse(screenshot.stdout);
      expect(parsedScreenshot.mimeType).toBe('image/png');
      expect(typeof parsedScreenshot.imageData).toBe('string');
      expect(parsedScreenshot.imageData.length).toBeGreaterThan(0);
      expect(parsedScreenshot.ok).toBeUndefined();
    } finally {
      await runtime.close();
    }
  });
});

describe('adapter management', () => {
  test('writes stable adapter configs that point to iwsdk mcp stdio without workspace args', async () => {
    const result = await runCli(['adapter', 'sync'], appA);
    expect(result.exitCode).toBe(0);

    const claude = JSON.parse(await readFile(path.join(appA, '.mcp.json'), 'utf8'));
    const cursor = JSON.parse(
      await readFile(path.join(appA, '.cursor', 'mcp.json'), 'utf8'),
    );
    const codex = await readFile(path.join(appA, '.codex', 'config.toml'), 'utf8');
    const normalizedAppA = await realpath(appA);

    expect(claude.mcpServers.iwsdk.command).toBe('node');
    expect(claude.mcpServers.iwsdk.args).toContain(
      path.join(normalizedAppA, 'node_modules', '@iwsdk', 'cli', 'dist', 'cli.js'),
    );
    expect(claude.mcpServers.iwsdk.args).toContain('mcp');
    expect(claude.mcpServers.iwsdk.args).toContain('stdio');
    expect(claude.mcpServers.iwsdk.args).not.toContain('--workspace');
    expect(cursor.mcpServers.iwsdk.command).toBe('node');
    expect(codex).toContain('[mcp_servers.iwsdk]');
    expect(codex).not.toContain('--port');
    expect(codex).not.toContain('--workspace');
  });

  test('works against the real starter-template app shape', async () => {
    const starterApp = path.join(tempDir, 'starter-app');
    await mkdir(starterApp, { recursive: true });

    const starterPackageJson = await readFile(
      path.join(
        '/Users/fe1ix/Projects/webxr-dev-platform/immersive-web-sdk',
        'packages',
        'starter-assets',
        'starter-template',
        'package.json',
      ),
      'utf8',
    );
    const starterViteConfig = await readFile(
      path.join(
        '/Users/fe1ix/Projects/webxr-dev-platform/immersive-web-sdk',
        'packages',
        'starter-assets',
        'starter-template',
        'vite.config.template.ts',
      ),
      'utf8',
    );
    const parsedStarterPackageJson = JSON.parse(starterPackageJson);

    expect(parsedStarterPackageJson.scripts.dev).toBe('iwsdk dev up --open --foreground');
    expect(parsedStarterPackageJson.scripts['dev:runtime']).toBe('vite');
    expect(parsedStarterPackageJson.scripts['dev:down']).toBe('iwsdk dev down');
    expect(parsedStarterPackageJson.scripts['dev:status']).toBe('iwsdk dev status');
    expect(parsedStarterPackageJson.devDependencies['@iwsdk/cli']).toContain(
      'iwsdk-cli.tgz',
    );
    expect(starterViteConfig).not.toContain('IWSDK_DEV_PORT');
    expect(starterViteConfig).not.toContain('IWSDK_DEV_OPEN');
    expect(starterViteConfig).not.toContain('strictPort');

    await writeFile(path.join(starterApp, 'package.json'), starterPackageJson, 'utf8');
    await writeFile(path.join(starterApp, 'vite.config.ts'), starterViteConfig, 'utf8');

    const status = await runCli(['status'], starterApp);
    expect(status.exitCode).toBe(0);
    const parsedStatus = JSON.parse(status.stdout);
    expect(parsedStatus.data.workspaceRoot).toBe(await realpath(starterApp));

    const sync = await runCli(['adapter', 'sync'], starterApp);
    expect(sync.exitCode).toBe(0);
    const parsedSync = JSON.parse(sync.stdout);
    expect(
      parsedSync.data.adapters.every(
        (entry: { status: string }) => entry.status === 'configured',
      ),
    ).toBe(true);
  });
});

describe('dev lifecycle', () => {
  test('requires dev:runtime, records observed launch state, and syncs canonical adapters', async () => {
    const fixtureScript = path.join(appA, 'dev-runtime.mjs');
    const fallbackScript = path.join(appA, 'dev-should-not-run.mjs');
    const fallbackMarkerPath = path.join(appA, 'dev-script-hit.txt');

    await writeFile(
      fallbackScript,
      `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(fallbackMarkerPath)}, 'dev should not run\\n', 'utf8');
process.exit(1);
`,
      'utf8',
    );

    await writeFile(fixtureScript, buildManagedRuntimeScript('fixture-dev-runtime'), 'utf8');

    await createAppFixture(appA, {
      scripts: {
        dev: 'node dev-should-not-run.mjs',
        'dev:runtime': 'node dev-runtime.mjs',
      },
    });

    const up = await runCli(['dev', 'up', '--timeout', '15000'], appA);
    expect(up.exitCode).toBe(0);
    const parsedUp = JSON.parse(up.stdout);
    expect(parsedUp.data.action).toBe('started');
    expect(parsedUp.data.session.localUrl).toContain('http://localhost:');
    expect(parsedUp.data.session.browser.status).toBe('connected');
    const adapterStatuses = Object.fromEntries(
      parsedUp.data.adapters.map((entry: { tool: string; status: string }) => [
        entry.tool,
        entry.status,
      ]),
    );
    expect(adapterStatuses.claude).toBe('configured');
    expect(adapterStatuses.cursor).toBe('configured');
    expect(existsSync(fallbackMarkerPath)).toBe(false);

    const launch = parsedUp.data.launch;
    expect(launch.scriptName).toBe('dev:runtime');
    expect(launch.openBrowser).toBe(false);
    expect(typeof launch.port).toBe('number');
    expect(parsedUp.data.session.port).toBe(launch.port);
    expect(typeof parsedUp.data.logPath).toBe('string');
    expect(String(parsedUp.data.logPath)).toContain(path.join('.iwsdk', 'runtime', 'logs'));

    const claude = JSON.parse(await readFile(path.join(appA, '.mcp.json'), 'utf8'));
    expect(claude.mcpServers.iwsdk.args).toContain('mcp');
    expect(claude.mcpServers.iwsdk.args).toContain('stdio');
    expect(claude.mcpServers.iwsdk.args).not.toContain('--port');
    expect(claude.mcpServers.iwsdk.args).not.toContain('--workspace');

    const down = await runCli(['dev', 'down'], appA);
    expect(down.exitCode).toBe(0);
  });

  test('starts, reattaches, and stops a managed dev process', async () => {
    const fixtureScript = path.join(appA, 'dev-server.mjs');
    await writeFile(fixtureScript, buildManagedRuntimeScript('fixture-dev'), 'utf8');

    await createAppFixture(appA, {
      scripts: {
        'dev:runtime': 'node dev-server.mjs',
      },
    });

    const up = await runCli(['dev', 'up', '--timeout', '15000'], appA);
    expect(up.exitCode).toBe(0);
    const parsedUp = JSON.parse(up.stdout);
    expect(parsedUp.data.action).toBe('started');
    expect(parsedUp.data.session.localUrl).toContain('http://localhost:');
    expect(parsedUp.data.launch.scriptName).toBe('dev:runtime');
    expect(parsedUp.data.launch.port).toBe(parsedUp.data.session.port);
    expect(parsedUp.data.session.browser.status).toBe('connected');

    const again = await runCli(['dev', 'up'], appA);
    expect(again.exitCode).toBe(0);
    const parsedAgain = JSON.parse(again.stdout);
    expect(parsedAgain.data.action).toBe('attached');

    const down = await runCli(['dev', 'down'], appA);
    expect(down.exitCode).toBe(0);
    const parsedDown = JSON.parse(down.stdout);
    expect(parsedDown.data.stopped).toBe(true);
  });

  test('fails when the managed browser reports launch_failed', async () => {
    const fixtureScript = path.join(appA, 'dev-browser-fail.mjs');
    await writeFile(
      fixtureScript,
      buildManagedRuntimeScript('fixture-browser-fail', {
        finalBrowserStatus: 'launch_failed',
        finalBrowserDelayMs: 50,
        finalBrowserError: {
          cause: 'browser_launch_failed',
          message: 'Playwright sandbox denied',
          at: new Date().toISOString(),
        },
      }),
      'utf8',
    );

    await createAppFixture(appA, {
      scripts: {
        'dev:runtime': 'node dev-browser-fail.mjs',
      },
    });

    const up = await runCli(['dev', 'up', '--timeout', '5000'], appA);
    expect(up.exitCode).toBe(1);
    const parsedUp = JSON.parse(up.stderr);
    expect(parsedUp.error.code).toBe('dev_browser_not_ready');
    expect(parsedUp.error.message).toContain('Playwright sandbox denied');
    expect(parsedUp.error.details.cause).toBe('browser_launch_failed');
    expect(parsedUp.error.details.browser.status).toBe('launch_failed');

    const down = await runCli(['dev', 'down'], appA);
    expect(down.exitCode).toBe(0);
  });

  test('fails fast when dev:runtime is missing', async () => {
    await createAppFixture(appA, {
      scripts: {
        dev: 'vite',
      },
    });

    const up = await runCli(['dev', 'up'], appA);
    expect(up.exitCode).toBe(1);
    const parsedUp = JSON.parse(up.stderr);
    expect(parsedUp.error.message).toContain('Missing required "dev:runtime" script');
  });
});
