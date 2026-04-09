/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { createSuccess } from '../cli-results.js';
import type {
  CliOptions,
  CliOptionValue,
  CliSuccess,
  ResolvedCliIo,
} from '../cli-types.js';
import { MCP_CONFIG_TARGETS, SUPPORTED_AI_TOOLS, type AiTool } from '../runtime-contract.js';
import { pruneMcpAdapters, syncMcpAdapters } from '../mcp-adapters.js';
import { getRuntimeSession, resolveWorkspaceRoot } from '../runtime-state.js';

export interface AdapterStatusEntry {
  tool: AiTool;
  file: string;
  exists: boolean;
  status: 'configured' | 'missing' | 'stale';
}

function hasCanonicalManagedAdapterEntry(content: string): boolean {
  return (
    (content.includes('@iwsdk/cli') ||
      content.includes('"iwsdk"') ||
      content.includes('command = "iwsdk"')) &&
    content.includes('"mcp"') &&
    content.includes('"stdio"')
  );
}

function hasLegacyManagedAdapterEntry(content: string): boolean {
  return content.includes('iwsdk-dev-mcp') || content.includes('--port');
}

function isAiTool(value: string): value is AiTool {
  return SUPPORTED_AI_TOOLS.includes(value as AiTool);
}

export async function readAdapterStatus(
  workspaceRoot: string,
): Promise<AdapterStatusEntry[]> {
  const status: AdapterStatusEntry[] = [];

  for (const tool of SUPPORTED_AI_TOOLS) {
    const target = MCP_CONFIG_TARGETS[tool];
    const filePath = path.join(workspaceRoot, target.file);
    if (!existsSync(filePath)) {
      status.push({
        tool,
        file: target.file,
        exists: false,
        status: 'missing',
      });
      continue;
    }

    const content = await readFile(filePath, 'utf8');
    status.push({
      tool,
      file: target.file,
      exists: true,
      status:
        hasCanonicalManagedAdapterEntry(content) &&
        !hasLegacyManagedAdapterEntry(content)
          ? 'configured'
          : 'stale',
    });
  }

  return status;
}

async function resolveAdapterTools(
  options: CliOptions,
  workspaceRoot: string,
): Promise<AiTool[]> {
  if (typeof options.tools === 'string') {
    const requested = options.tools
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const invalid = requested.filter((tool) => !isAiTool(tool));
    if (invalid.length > 0) {
      throw new Error(`Unsupported AI tools: ${invalid.join(', ')}`);
    }

    return requested.filter((tool): tool is AiTool => isAiTool(tool));
  }

  const session = await getRuntimeSession(workspaceRoot);
  if (session?.aiTools?.length) {
    return session.aiTools;
  }

  return [...SUPPORTED_AI_TOOLS];
}

export async function syncStableAdaptersForWorkspace(
  workspaceRoot: string,
  options: CliOptions,
): Promise<AdapterStatusEntry[]> {
  const tools = await resolveAdapterTools(options, workspaceRoot);
  await syncMcpAdapters({ workspaceRoot, tools });
  return readAdapterStatus(workspaceRoot);
}

async function resolveWorkspace(
  io: ResolvedCliIo,
  workspace: CliOptionValue | undefined,
): Promise<string> {
  return resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace: typeof workspace === 'string' ? workspace : undefined,
    requireRunning: false,
  });
}

export async function handleAdapterSync(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspace(io, options.workspace);
  const tools = await resolveAdapterTools(options, workspaceRoot);
  const result = await syncMcpAdapters({ workspaceRoot, tools });
  return createSuccess({
    ...result,
    adapters: await readAdapterStatus(workspaceRoot),
  });
}

export async function handleAdapterPrune(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspace(io, options.workspace);
  const tools = await resolveAdapterTools(options, workspaceRoot);
  await pruneMcpAdapters({ workspaceRoot, tools });
  return createSuccess({
    workspaceRoot,
    tools,
    adapters: await readAdapterStatus(workspaceRoot),
  });
}

export async function handleAdapterStatus(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspace(io, options.workspace);
  return createSuccess({
    workspaceRoot,
    adapters: await readAdapterStatus(workspaceRoot),
  });
}
