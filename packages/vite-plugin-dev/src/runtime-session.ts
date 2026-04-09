/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, realpathSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  IWSDK_RUNTIME_SESSION_PATH,
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type RuntimeBrowserState,
  type RuntimeSession,
} from '@iwsdk/cli/contract';

interface RegisterRuntimeSessionInput {
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  port: number;
  localUrl: string;
  networkUrls?: string[];
  aiMode?: string;
  aiTools?: RuntimeSession['aiTools'];
  browser?: RuntimeBrowserState;
}

function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try {
    return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  } catch {
    return resolved;
  }
}

function getRuntimeSessionFilePath(workspaceRoot: string): string {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), IWSDK_RUNTIME_SESSION_PATH);
}

async function readRuntimeSession(filePath: string): Promise<RuntimeSession | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as RuntimeSession;
  } catch {
    return null;
  }
}

async function writeRuntimeSession(
  workspaceRoot: string,
  session: RuntimeSession,
): Promise<RuntimeSession> {
  const filePath = getRuntimeSessionFilePath(workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  return session;
}

export async function registerRuntimeSession(
  input: RegisterRuntimeSessionInput,
): Promise<RuntimeSession> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const existing = await readRuntimeSession(getRuntimeSessionFilePath(workspaceRoot));
  const now = new Date().toISOString();
  const session: RuntimeSession = {
    schemaVersion: IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
    sessionId: input.sessionId,
    workspaceRoot,
    pid: input.pid,
    port: input.port,
    localUrl: input.localUrl,
    networkUrls: input.networkUrls ?? [],
    aiMode: input.aiMode,
    aiTools: input.aiTools ?? [],
    browser: input.browser ?? existing?.browser,
    registeredAt: existing?.registeredAt ?? now,
    updatedAt: now,
  };
  return writeRuntimeSession(workspaceRoot, session);
}

export async function setRuntimeSessionBrowserState(
  workspaceRoot: string,
  browser: RuntimeBrowserState,
): Promise<RuntimeSession | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const existing = await readRuntimeSession(getRuntimeSessionFilePath(normalizedWorkspaceRoot));
  if (!existing) {
    return null;
  }

  const session: RuntimeSession = {
    ...existing,
    browser,
    updatedAt: new Date().toISOString(),
  };
  return writeRuntimeSession(normalizedWorkspaceRoot, session);
}

export async function unregisterRuntimeSession(workspaceRoot: string): Promise<void> {
  await rm(getRuntimeSessionFilePath(workspaceRoot), { force: true }).catch(() => {});
}
