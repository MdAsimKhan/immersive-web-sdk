/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn, type ChildProcess } from 'child_process';
import { closeSync, existsSync, openSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { parseIntegerOption, safeJsonParse } from '../argv.js';
import { createFailure, createSuccess } from '../cli-results.js';
import type {
  CliFailure,
  CliOptions,
  CliSuccess,
  ResolvedCliIo,
} from '../cli-types.js';
import type { RuntimeIssueInfo, RuntimeSession } from '../runtime-contract.js';
import {
  clearLaunchMetadata,
  ensureRuntimeLogsDir,
  formatMissingRuntimeMessage,
  getLaunchMetadata,
  getRuntimeSession,
  getWorkspaceRuntimeState,
  resolveWorkspaceRoot,
  setLaunchMetadata,
} from '../runtime-state.js';
import { syncStableAdaptersForWorkspace } from './adapter.js';
import { handleStatus } from './status.js';

interface PackageJsonManifest {
  packageManager?: string;
  scripts?: Record<string, string>;
}

interface ProcessExitResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface WaitForRuntimeSessionResult {
  session: RuntimeSession | null;
  exit: ProcessExitResult | null;
  browserReady: boolean;
  browserIssue?: RuntimeIssueInfo;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPackageManifest(
  workspaceRoot: string,
): Promise<PackageJsonManifest> {
  return safeJsonParse<PackageJsonManifest>(
    await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'),
    'package.json',
  );
}

async function detectPackageManager(workspaceRoot: string): Promise<string> {
  const packageJson = await readPackageManifest(workspaceRoot);

  if (typeof packageJson.packageManager === 'string') {
    return packageJson.packageManager.split('@')[0];
  }

  if (existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(path.join(workspaceRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (
    existsSync(path.join(workspaceRoot, 'bun.lockb')) ||
    existsSync(path.join(workspaceRoot, 'bun.lock'))
  ) {
    return 'bun';
  }

  return 'npm';
}

async function resolveDevRuntimeScript(workspaceRoot: string): Promise<string> {
  const packageJson = await readPackageManifest(workspaceRoot);
  const scripts = packageJson.scripts ?? {};
  if (typeof scripts['dev:runtime'] === 'string') {
    return 'dev:runtime';
  }
  throw new Error(
    'Missing required "dev:runtime" script. This workspace must define an internal runtime script for "iwsdk dev up".',
  );
}

function isOpenRequested(options: CliOptions): boolean {
  return options.open === true;
}

function isForegroundLaunch(options: CliOptions): boolean {
  return options.foreground === true;
}

function getRunScriptArgs(
  packageManager: string,
  scriptName: string,
): string[] {
  switch (packageManager) {
    case 'yarn':
      return [scriptName];
    case 'bun':
      return ['run', scriptName];
    case 'pnpm':
    case 'npm':
    default:
      return ['run', scriptName];
  }
}

async function ensureLogPath(workspaceRoot: string): Promise<string> {
  const logsDir = await ensureRuntimeLogsDir(workspaceRoot);
  return path.join(logsDir, `dev-${Date.now()}.log`);
}

async function waitForRuntimeSession(
  workspaceRoot: string,
  timeoutMs: number,
  getChildExit?: () => ProcessExitResult | null,
): Promise<WaitForRuntimeSessionResult> {
  const deadline = Date.now() + timeoutMs;
  let lastSession: RuntimeSession | null = null;

  while (Date.now() < deadline) {
    const session = await getRuntimeSession(workspaceRoot);
    if (session) {
      lastSession = session;
      if (!session.browser || session.browser.connected) {
        return { session, exit: null, browserReady: true };
      }
      if (session.browser.status === 'launch_failed') {
        return {
          session,
          exit: null,
          browserReady: false,
          browserIssue: session.browser.lastError ?? {
            cause: 'browser_launch_failed',
            message: 'Managed browser launch failed.',
            at: session.browser.lastTransitionAt,
          },
        };
      }
    }

    const exit = getChildExit?.() ?? null;
    if (exit) {
      return {
        session: lastSession,
        exit,
        browserReady: false,
        browserIssue: lastSession?.browser?.lastError,
      };
    }
    await sleep(500);
  }

  return {
    session: lastSession,
    exit: null,
    browserReady: Boolean(
      lastSession && (!lastSession.browser || lastSession.browser.connected),
    ),
    browserIssue: lastSession?.browser
      ? (lastSession.browser.lastError ?? {
          cause:
            lastSession.browser.status === 'disconnected'
              ? 'connection_lost'
              : 'browser_not_ready',
          message:
            lastSession.browser.status === 'disconnected'
              ? 'Managed browser runtime disconnected before becoming ready.'
              : 'Managed browser did not finish connecting before the timeout elapsed.',
          at: lastSession.browser.lastTransitionAt,
        })
      : undefined,
  };
}

function waitForChildExit(child: ChildProcess): Promise<ProcessExitResult> {
  return new Promise((resolve) => {
    child.once('error', () => {
      resolve({ exitCode: 1, signal: null });
    });
    child.once('exit', (exitCode, signal) => {
      resolve({ exitCode, signal });
    });
  });
}

function getOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }
  return { command: 'xdg-open', args: [url] };
}

async function openUrl(url: string): Promise<void> {
  const command = getOpenCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', (error) => {
      reject(new Error(`Failed to open browser URL ${url}: ${error.message}`));
    });
    child.once('spawn', () => {
      resolve();
    });

    child.unref();
  });
}

async function terminateRuntimeWorkspace(
  workspaceRoot: string,
): Promise<unknown> {
  const state = await getWorkspaceRuntimeState(workspaceRoot);
  const pids = Array.from(
    new Set(
      [state.session?.pid, state.launch?.pid].filter(
        (value): value is number => typeof value === 'number',
      ),
    ),
  );

  if (pids.length === 0) {
    return {
      stopped: false,
      workspaceRoot,
      session: state.session,
      launch: state.launch,
    };
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const freshState = await getWorkspaceRuntimeState(workspaceRoot);
    if (!freshState.session && !freshState.launch) {
      await clearLaunchMetadata(workspaceRoot);
      return {
        stopped: true,
        workspaceRoot,
      };
    }
    await sleep(250);
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  await clearLaunchMetadata(workspaceRoot);
  return {
    stopped: true,
    workspaceRoot,
    forced: true,
  };
}

export async function handleDevUp(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown> | CliFailure | null> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });

  const foreground = isForegroundLaunch(options);
  const openBrowser = isOpenRequested(options);
  const existingSession = await getRuntimeSession(workspaceRoot);
  if (existingSession) {
    if (openBrowser) {
      await openUrl(existingSession.localUrl);
    }
    const adapters = await syncStableAdaptersForWorkspace(
      workspaceRoot,
      options,
    );
    if (foreground) {
      io.stdout.write(
        `[IWSDK] Runtime already running at ${existingSession.localUrl}\n`,
      );
      return null;
    }
    return createSuccess({
      action: 'attached',
      workspaceRoot,
      session: existingSession,
      launch: await getLaunchMetadata(workspaceRoot),
      adapters,
    });
  }

  const timeoutMs = parseIntegerOption(options.timeout, '--timeout', 60000);
  const packageManager = await detectPackageManager(workspaceRoot);
  const scriptName = await resolveDevRuntimeScript(workspaceRoot);
  const logPath = foreground ? null : await ensureLogPath(workspaceRoot);
  const stdoutFd = logPath ? openSync(logPath, 'a') : -1;
  const spawnArgs = getRunScriptArgs(packageManager, scriptName);

  const executable =
    process.platform === 'win32' && !packageManager.endsWith('.cmd')
      ? `${packageManager}.cmd`
      : packageManager;

  const child = spawn(executable, spawnArgs, {
    cwd: workspaceRoot,
    detached: !foreground,
    stdio: foreground ? 'inherit' : ['ignore', stdoutFd, stdoutFd],
    env: process.env,
    shell: process.platform === 'win32',
  });
  const childExitPromise = waitForChildExit(child);
  let childExit: ProcessExitResult | null = null;
  void childExitPromise.then((result) => {
    childExit = result;
  });

  if (!foreground) {
    closeSync(stdoutFd);
    child.unref();
  }

  if (typeof child.pid !== 'number') {
    throw new Error('Failed to start the dev process');
  }

  await setLaunchMetadata({
    workspaceRoot,
    pid: child.pid,
    command: packageManager,
    args: spawnArgs,
    logPath,
    scriptName,
    port: null,
    openBrowser,
  });

  const waitResult = await waitForRuntimeSession(
    workspaceRoot,
    timeoutMs,
    () => childExit,
  );

  if (!waitResult.session) {
    if (waitResult.exit) {
      await clearLaunchMetadata(workspaceRoot);
      return createFailure(
        'Dev server exited before registering a runtime session',
        'dev_up_exit',
        {
          workspaceRoot,
          logPath,
          exitCode: waitResult.exit.exitCode,
          signal: waitResult.exit.signal,
          scriptName,
        },
      );
    }

    return createFailure(
      `Dev server did not register a runtime session within ${timeoutMs}ms`,
      'dev_up_timeout',
      {
        workspaceRoot,
        logPath,
        scriptName,
      },
    );
  }

  await setLaunchMetadata({
    workspaceRoot,
    pid: waitResult.session.pid,
    command: packageManager,
    args: spawnArgs,
    logPath,
    scriptName,
    port: waitResult.session.port,
    openBrowser,
  });

  if (!waitResult.browserReady) {
    return createFailure(
      waitResult.browserIssue?.message ??
        `Managed browser did not become ready within ${timeoutMs}ms`,
      'dev_browser_not_ready',
      {
        workspaceRoot,
        logPath,
        scriptName,
        session: waitResult.session,
        browser: waitResult.session.browser ?? null,
        cause: waitResult.browserIssue?.cause,
      },
    );
  }

  const launch = await getLaunchMetadata(workspaceRoot);
  const adapters = await syncStableAdaptersForWorkspace(workspaceRoot, options);

  if (openBrowser) {
    await openUrl(waitResult.session.localUrl);
  }

  if (foreground) {
    io.stdout.write(
      `[IWSDK] Runtime ready at ${waitResult.session.localUrl}\n`,
    );
    const exit = await childExitPromise;
    if (exit.exitCode && exit.exitCode !== 0) {
      return createFailure(
        `Dev server exited with code ${exit.exitCode}`,
        'dev_up_exit',
        {
          workspaceRoot,
          session: waitResult.session,
          exitCode: exit.exitCode,
          signal: exit.signal,
          scriptName,
        },
      );
    }
    return null;
  }

  return createSuccess({
    action: 'started',
    workspaceRoot,
    session: waitResult.session,
    launch,
    logPath,
    adapters,
  });
}

export async function handleDevDown(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });
  return createSuccess(await terminateRuntimeWorkspace(workspaceRoot));
}

export async function handleDevRestart(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown> | CliFailure | null> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });

  await terminateRuntimeWorkspace(workspaceRoot);
  return handleDevUp({ ...options, workspace: workspaceRoot }, io);
}

export async function handleDevLogs(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });
  const launch = await getLaunchMetadata(workspaceRoot);
  if (!launch?.logPath || !existsSync(launch.logPath)) {
    return createSuccess({
      workspaceRoot,
      logPath: launch?.logPath ?? null,
      available: false,
    });
  }

  const tailLines = parseIntegerOption(options.tail, '--tail', 200);
  const content = await readFile(launch.logPath, 'utf8');
  const lines = content.trimEnd().split('\n');
  return createSuccess({
    workspaceRoot,
    logPath: launch.logPath,
    available: true,
    tail: lines.slice(-tailLines).join('\n'),
  });
}

export async function handleDevOpen(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: true,
  });
  const session = await getRuntimeSession(workspaceRoot);
  if (!session) {
    throw new Error(formatMissingRuntimeMessage(workspaceRoot));
  }

  await openUrl(session.localUrl);

  return createSuccess({
    workspaceRoot,
    opened: session.localUrl,
    browserConnected: Boolean(session.browser?.connected),
    browser: session.browser ?? null,
  });
}

export async function handleDevStatus(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  return handleStatus(options, io);
}
