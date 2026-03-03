/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import * as path from 'path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { buildInjectionBundle } from './injection-bundler.js';
import { createRelayHandler } from './mcp-relay.js';
import {
  launchManagedBrowser,
  type ManagedBrowser,
} from './headless-browser.js';
import type {
  DevPluginOptions,
  ProcessedDevOptions,
  InjectionBundleResult,
  AiTool,
} from './types.js';

// Export types for users
export type {
  DevPluginOptions,
  AiOptions,
  EmulatorOptions,
  ProcessedDevOptions,
  IWERPluginOptions,
  SEMOptions,
  MCPOptions,
  AiTool,
} from './types.js';

/**
 * MCP config target descriptor for each AI tool.
 */
type McpConfigTarget = {
  /** Path relative to project root */
  file: string;
  /** JSON key that holds server entries (null for TOML) */
  jsonKey: string | null;
  /** 'json' or 'toml' */
  format: 'json' | 'toml';
};

const MCP_CONFIG_TARGETS: Record<AiTool, McpConfigTarget> = {
  claude: { file: '.mcp.json', jsonKey: 'mcpServers', format: 'json' },
  cursor: { file: '.cursor/mcp.json', jsonKey: 'mcpServers', format: 'json' },
  copilot: { file: '.vscode/mcp.json', jsonKey: 'servers', format: 'json' },
  codex: { file: '.codex/config.toml', jsonKey: null, format: 'toml' },
};

const TOML_BLOCK_START = '# --- IWER managed (do not edit) ---';
const TOML_BLOCK_END = '# --- end IWER managed ---';

/**
 * Merge our server entries into an existing (or new) JSON config file.
 * Returns true if the file was newly created.
 */
export async function mergeJsonConfig(
  filePath: string,
  serverEntries: Record<string, unknown>,
  jsonKey: string,
): Promise<boolean> {
  let existing: Record<string, unknown> = {};
  let created = false;

  try {
    const raw = await readFile(filePath, 'utf-8');
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist or invalid JSON — start fresh
    created = true;
  }

  const section = (existing[jsonKey] as Record<string, unknown>) ?? {};
  Object.assign(section, serverEntries);
  existing[jsonKey] = section;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(existing, null, 2) + '\n');
  return created;
}

/**
 * Remove our managed server keys from a JSON config file.
 * If we originally created the file and the servers section is now empty
 * with no other top-level keys, delete the file entirely.
 */
export async function unmergeJsonConfig(
  filePath: string,
  serverKeys: string[],
  jsonKey: string,
  weCreatedFile: boolean,
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return; // file doesn't exist — no-op
  }

  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(raw);
  } catch {
    return; // invalid JSON — leave it alone
  }

  const section = existing[jsonKey] as Record<string, unknown> | undefined;
  if (section) {
    for (const key of serverKeys) {
      delete section[key];
    }
    if (Object.keys(section).length === 0) {
      delete existing[jsonKey];
    }
  }

  if (weCreatedFile && Object.keys(existing).length === 0) {
    try {
      await unlink(filePath);
    } catch {}
  } else {
    await writeFile(filePath, JSON.stringify(existing, null, 2) + '\n');
  }
}

/**
 * Merge our managed TOML block into an existing (or new) config file.
 * Returns true if the file was newly created.
 */
export async function mergeTomlConfig(
  filePath: string,
  serverEntries: Record<string, { command: string; args: string[] }>,
): Promise<boolean> {
  let existing = '';
  let created = false;

  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    created = true;
  }

  // Remove any old managed block
  const startIdx = existing.indexOf(TOML_BLOCK_START);
  const endIdx = existing.indexOf(TOML_BLOCK_END);
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    existing =
      existing.slice(0, startIdx).trimEnd() +
      '\n' +
      existing.slice(endIdx + TOML_BLOCK_END.length).trimStart();
    existing = existing.trim();
  }

  // Build new managed block
  const tomlLines: string[] = [TOML_BLOCK_START];
  for (const [name, entry] of Object.entries(serverEntries)) {
    tomlLines.push(`[mcp_servers.${name}]`);
    tomlLines.push(`command = ${JSON.stringify(entry.command)}`);
    tomlLines.push(
      `args = [${entry.args.map((a) => JSON.stringify(a)).join(', ')}]`,
    );
    tomlLines.push('');
  }
  tomlLines.push(TOML_BLOCK_END);

  const newContent = existing
    ? existing.trimEnd() + '\n\n' + tomlLines.join('\n') + '\n'
    : tomlLines.join('\n') + '\n';

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, newContent);
  return created;
}

/**
 * Remove our managed TOML block from a config file.
 * If we originally created the file and it's now effectively empty, delete it.
 */
export async function unmergeTomlConfig(
  filePath: string,
  weCreatedFile: boolean,
): Promise<void> {
  let existing: string;
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    return; // file doesn't exist — no-op
  }

  const startIdx = existing.indexOf(TOML_BLOCK_START);
  const endIdx = existing.indexOf(TOML_BLOCK_END);
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    // No managed block found — nothing to remove
    if (weCreatedFile && existing.trim() === '') {
      try {
        await unlink(filePath);
      } catch {}
    }
    return;
  }

  const cleaned =
    existing.slice(0, startIdx).trimEnd() +
    '\n' +
    existing.slice(endIdx + TOML_BLOCK_END.length).trimStart();
  const result = cleaned.trim();

  if (weCreatedFile && result === '') {
    try {
      await unlink(filePath);
    } catch {}
  } else {
    await writeFile(filePath, result + '\n');
  }
}

/**
 * Warm up the RAG MCP server by spawning it and waiting for initialization.
 * This downloads the HuggingFace embedding model if not already cached.
 * The process is killed after initialization completes.
 */
function warmupRagMcp(ragMcpServerPath: string, verbose: boolean): void {
  if (!existsSync(ragMcpServerPath)) {
    if (verbose) {
      console.log('[RAG-MCP] Server not found, skipping warmup');
    }
    return;
  }

  console.log('📚 RAG-MCP: Warming up (downloading model if needed)...');

  const warmupProcess: ChildProcess = spawn('node', [ragMcpServerPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let initialized = false;

  warmupProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    if (verbose) {
      // Print warmup progress
      process.stderr.write(`[RAG-MCP Warmup] ${output}`);
    }

    // Check if initialization is complete
    if (output.includes('IWSDK RAG MCP Server is ready')) {
      initialized = true;
      clearTimeout(warmupTimeout);
      console.log('📚 RAG-MCP: Model cached successfully');
      warmupProcess.kill('SIGTERM');
    }
  });

  warmupProcess.on('error', (error) => {
    if (verbose) {
      console.error('[RAG-MCP] Warmup error:', error.message);
    }
  });

  warmupProcess.on('exit', (code) => {
    if (!initialized && code !== 0 && verbose) {
      console.warn(`[RAG-MCP] Warmup process exited with code ${code}`);
    }
  });

  // Safety timeout - kill after 5 minutes if still running
  const warmupTimeout = setTimeout(
    () => {
      if (!initialized && !warmupProcess.killed) {
        console.warn('[RAG-MCP] Warmup timeout, killing process');
        warmupProcess.kill('SIGTERM');
      }
    },
    5 * 60 * 1000,
  );
}

/**
 * Process and normalize plugin options with defaults
 */
function processOptions(options: DevPluginOptions = {}): ProcessedDevOptions {
  const emulator = options.emulator ?? {};
  const processed: ProcessedDevOptions = {
    device: emulator.device || 'metaQuest3',
    injectOnBuild: emulator.injectOnBuild || false,
    activation: emulator.activation || 'localhost',
    verbose: options.verbose || false,
    userAgentException:
      emulator.userAgentException || new RegExp('OculusBrowser'),
  };

  // Process SEM options from emulator.environment
  if (emulator.environment) {
    processed.sem = {
      defaultScene: emulator.environment,
    };
  }

  // Process AI/MCP options - enabled by default unless explicitly disabled
  const aiOption = options.ai ?? true;
  if (aiOption) {
    if (typeof aiOption === 'boolean') {
      processed.mcp = {
        verbose: false,
        tools: ['claude', 'cursor', 'copilot', 'codex'],
        headless: false,
        viewport: { width: 800, height: 800 },
      };
    } else {
      processed.mcp = {
        port: aiOption.port,
        verbose: aiOption.verbose ?? false,
        tools: aiOption.tools ?? ['claude', 'cursor', 'copilot', 'codex'],
        headless: aiOption.headless ?? false,
        viewport: {
          width: aiOption.viewport?.width ?? 800,
          height: aiOption.viewport?.height ?? 800,
        },
      };
    }
  }

  return processed;
}

/**
 * Vite plugin for IWSDK development — XR emulation, AI agent tooling, and Playwright browser
 */
export function iwsdkDev(options: DevPluginOptions = {}): Plugin {
  const pluginOptions = processOptions(options);
  let injectionBundle: InjectionBundleResult | null = null;
  let config: ResolvedConfig;
  let mcpWss: WebSocketServer | null = null;
  let mcpClients: Set<WebSocket> | null = null;
  let managedBrowser: ManagedBrowser | null = null;
  const VIRTUAL_ID = '/@iwer-injection-runtime';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'iwsdk-dev',

    config(userConfig) {
      // Suppress Vite's auto-open — Playwright manages the browser tab.
      // Mutate userConfig directly since plugin return values have lower
      // precedence and would be overridden by the user's `open: true`.
      if (pluginOptions.mcp) {
        if (userConfig.server) {
          userConfig.server.open = false;
        } else {
          userConfig.server = { open: false };
        }
      }
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (pluginOptions.verbose) {
        console.log('🔧 IWSDK Dev Configuration:');
        console.log(`  - Device: ${pluginOptions.device}`);
        console.log(
          `  - SEM: ${pluginOptions.sem ? 'enabled (' + pluginOptions.sem.defaultScene + ')' : 'disabled'}`,
        );
        console.log(`  - MCP: ${pluginOptions.mcp ? 'enabled' : 'disabled'}`);
        console.log(`  - Activation: ${pluginOptions.activation}`);
        if (pluginOptions.userAgentException) {
          console.log('  - UA exception: enabled');
        }
        console.log(`  - Inject on build: ${pluginOptions.injectOnBuild}`);
      }
    },

    configureServer(server: ViteDevServer) {
      if (!pluginOptions.mcp) {
        return;
      }

      // Initialize WebSocket server and client tracking
      mcpClients = new Set();
      mcpWss = new WebSocketServer({ noServer: true });

      // First-response-wins relay handler (extracted for testability)
      const relay = createRelayHandler({
        verbose: pluginOptions.mcp?.verbose,
      });

      // Clean up stale entries every 60 seconds
      const relayCleanupInterval = setInterval(() => {
        relay.cleanStale(60000);
      }, 60000);
      relayCleanupInterval.unref();

      mcpWss.on('connection', (ws: WebSocket) => {
        mcpClients!.add(ws);

        if (pluginOptions.mcp?.verbose || pluginOptions.verbose) {
          console.log('[IWSDK-MCP] Client connected');
        }

        ws.on('message', async (data: Buffer) => {
          const message = data.toString();
          if (pluginOptions.mcp?.verbose) {
            console.log(
              '[IWSDK-MCP] Message received:',
              message.substring(0, 100),
            );
          }

          // Intercept server-side tools that use Playwright directly.
          // These respond from the Node process without a browser round-trip.
          let intercepted = false;
          try {
            const parsed = JSON.parse(message);

            // Console logs: Playwright captures via CDP
            if (parsed.method === 'get_console_logs' && parsed.id) {
              intercepted = true;
              const params = parsed.params ?? {};
              if (!params.level) {
                params.level = ['log', 'info', 'warn', 'error'];
              }
              const result = managedBrowser ? managedBrowser.queryLogs(params) : [];
              ws.send(JSON.stringify({ id: parsed.id, result }));
            }

            // Screenshot: Playwright captures via CDP compositor
            if (!intercepted && parsed.method === 'screenshot' && parsed.id) {
              intercepted = true;
              try {
                if (managedBrowser) {
                  const buffer = await managedBrowser.screenshot();
                  const base64 = buffer.toString('base64');
                  ws.send(JSON.stringify({
                    id: parsed.id,
                    result: { imageData: base64, mimeType: 'image/png' },
                  }));
                } else {
                  ws.send(JSON.stringify({
                    id: parsed.id,
                    error: { code: -32000, message: 'Browser not ready' },
                  }));
                }
              } catch (err) {
                ws.send(JSON.stringify({
                  id: parsed.id,
                  error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
                }));
              }
            }
          } catch {
            // Not JSON — fall through to relay
          }

          if (!intercepted) {
            relay.onMessage(ws, message, mcpClients!);
          }
        });

        ws.on('close', () => {
          mcpClients!.delete(ws);
          if (pluginOptions.mcp?.verbose || pluginOptions.verbose) {
            console.log('[IWSDK-MCP] Client disconnected');
          }
        });

        ws.on('error', (error) => {
          if (pluginOptions.mcp?.verbose || pluginOptions.verbose) {
            console.error('[IWSDK-MCP] WebSocket error:', error);
          }
        });
      });

      // Set up WebSocket endpoint for MCP - handle upgrade requests
      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url !== '/__iwer_mcp') {
          return;
        }

        if (pluginOptions.mcp?.verbose || pluginOptions.verbose) {
          console.log('[IWSDK-MCP] WebSocket upgrade request received');
        }

        mcpWss!.handleUpgrade(request, socket, head, (ws) => {
          mcpWss!.emit('connection', ws, request);
        });
      });

      if (pluginOptions.verbose) {
        console.log(
          '🔌 IWSDK-MCP: WebSocket endpoint registered at /__iwer_mcp',
        );
      }

      // Generate MCP config files for selected AI tools after server starts
      // We wait for the 'listening' event to get the actual port (in case configured port was busy)

      // Find the path to the MCP server script
      // It's installed in node_modules/@iwsdk/vite-plugin-dev/dist/mcp-server.js
      const mcpServerPath = path.join(
        config.root,
        'node_modules',
        '@iwsdk',
        'vite-plugin-dev',
        'dist',
        'mcp-server.js',
      );

      // Find the path to the RAG MCP server
      const ragMcpServerPath = path.join(
        config.root,
        'node_modules',
        '@felixtz',
        'iwsdk-rag-mcp',
        'dist',
        'index.js',
      );

      // Track which files we created (so cleanup can decide whether to delete them)
      const filesWeCreated = new Set<string>();
      // Track our managed server entry keys for JSON unmerge
      const managedServerKeys: string[] = [];
      // Track the in-flight config write so cleanup can await it
      let configWritePromise: Promise<void> | null = null;

      const writeMcpConfigs = async (actualPort: number) => {
        const serverEntries: Record<string, { command: string; args: string[] }> = {
          iwsdk: {
            command: 'node',
            args: [mcpServerPath, '--port', String(actualPort)],
          },
        };

        // Only include RAG MCP server if the package is actually installed
        if (existsSync(ragMcpServerPath)) {
          serverEntries['iwsdk-rag-local'] = {
            command: 'node',
            args: [ragMcpServerPath],
          };
        }

        // Remember which keys we manage for cleanup
        managedServerKeys.length = 0;
        managedServerKeys.push(...Object.keys(serverEntries));

        const tools = pluginOptions.mcp!.tools;
        const writes: Promise<void>[] = [];

        for (const tool of tools) {
          const target = MCP_CONFIG_TARGETS[tool];
          const filePath = path.join(config.root, target.file);

          if (target.format === 'json') {
            writes.push(
              mergeJsonConfig(filePath, serverEntries, target.jsonKey!).then(
                (created) => {
                  if (created) filesWeCreated.add(filePath);
                },
              ),
            );
          } else {
            writes.push(
              mergeTomlConfig(filePath, serverEntries).then((created) => {
                if (created) filesWeCreated.add(filePath);
              }),
            );
          }
        }

        const results = await Promise.allSettled(writes);
        const failures = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        if (failures.length > 0) {
          for (const f of failures) {
            console.error('[MCP] Config write failed:', f.reason);
          }
        } else if (pluginOptions.verbose) {
          const toolNames = tools.join(', ');
          console.log(
            `📝 MCP: Generated config files for [${toolNames}] (port: ${actualPort})`,
          );
        }
      };

      // Wait for server to start listening to get the actual port
      server.httpServer?.on('listening', () => {
        const address = server.httpServer?.address();
        const actualPort =
          typeof address === 'object' && address
            ? address.port
            : server.config.server.port || 5173;
        configWritePromise = writeMcpConfigs(actualPort);

        // Warm up RAG MCP server (downloads embedding model if needed)
        // This ensures the model is cached before Claude Code tries to use it
        warmupRagMcp(ragMcpServerPath, pluginOptions.verbose);

        // Launch Playwright-managed browser
        const protocol = server.config.server.https ? 'https' : 'http';
        const url = `${protocol}://localhost:${actualPort}`;
        const headless = pluginOptions.mcp?.headless ?? false;
        const viewport = pluginOptions.mcp?.viewport ?? { width: 800, height: 800 };
        launchManagedBrowser(url, headless, pluginOptions.verbose, viewport)
          .then((browser) => {
            managedBrowser = browser;
          })
          .catch((error) => {
            console.error('❌ IWSDK: Failed to launch browser:', error);
          });
      });

      // Clean up WebSocket server and MCP config files when Vite server closes
      server.httpServer?.on('close', () => {
        if (mcpWss) {
          for (const client of mcpClients || []) {
            client.close();
          }
          mcpClients?.clear();
          mcpWss.close();
          mcpWss = null;
        }

        const doCleanup = async () => {
          // Close managed browser
          if (managedBrowser) {
            await managedBrowser.close().catch(() => {});
            managedBrowser = null;
          }

          // Wait for any in-flight config write to finish before cleaning up
          if (configWritePromise) {
            await configWritePromise.catch(() => {});
          }

          // Remove our managed entries from all configured MCP config files
          const tools = pluginOptions.mcp!.tools;
          const cleanups: Promise<void>[] = [];

          for (const tool of tools) {
            const target = MCP_CONFIG_TARGETS[tool];
            const filePath = path.join(config.root, target.file);
            const weCreated = filesWeCreated.has(filePath);

            if (target.format === 'json') {
              cleanups.push(
                unmergeJsonConfig(
                  filePath,
                  managedServerKeys,
                  target.jsonKey!,
                  weCreated,
                ),
              );
            } else {
              cleanups.push(unmergeTomlConfig(filePath, weCreated));
            }
          }

          await Promise.allSettled(cleanups);
        };

        doCleanup().catch(() => {});
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!injectionBundle) {
          return 'console.warn("[IWSDK Dev] Runtime not available - injection bundle not loaded");';
        }
        return injectionBundle.code;
      }
    },

    async buildStart() {
      // Determine if we should generate injection script
      const shouldInject =
        config.command === 'serve' ||
        (config.command === 'build' && pluginOptions.injectOnBuild);

      if (!shouldInject) {
        if (pluginOptions.verbose && config.command === 'build') {
          console.log(
            '⏭️  IWSDK Dev: Skipping build injection (injectOnBuild: false)',
          );
        }
        return;
      }

      try {
        if (pluginOptions.verbose) {
          console.log(
            '🚀 IWSDK Dev: Starting injection bundle generation...',
          );
        }

        injectionBundle = await buildInjectionBundle(pluginOptions);

        if (pluginOptions.verbose) {
          console.log('✅ IWSDK Dev: Injection bundle ready');
        }
      } catch (error) {
        console.error(
          '❌ IWSDK Dev: Failed to generate injection bundle:',
          error,
        );
        // Continue without injection rather than failing the build
      }
    },

    transformIndexHtml: {
      order: 'pre', // Run before other HTML transformations
      handler(html) {
        // Check if we should inject
        const shouldInject =
          config.command === 'serve' ||
          (config.command === 'build' && pluginOptions.injectOnBuild);

        if (!shouldInject || !injectionBundle) {
          return html;
        }

        if (pluginOptions.verbose) {
          console.log('💉 IWSDK Dev: Injecting runtime script into HTML');
        }

        // Inject the script using Vite's tag API for robustness
        return {
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module', src: VIRTUAL_ID },
              injectTo: 'head',
            },
          ],
        } as any;
      },
    },

    // Display summary at the end of build process
    closeBundle: {
      order: 'post',
      async handler() {
        // Only show summary when injection actually happened
        const shouldInject =
          config.command === 'serve' ||
          (config.command === 'build' && pluginOptions.injectOnBuild);

        if (shouldInject && injectionBundle) {
          const mode = config.command === 'serve' ? 'Development' : 'Build';
          console.log(`\n🥽 IWSDK Dev Summary (${mode}):`);
          console.log(`  - Device: ${pluginOptions.device}`);
          console.log(
            `  - Runtime injected: ${(injectionBundle.size / 1024).toFixed(1)}KB`,
          );
          console.log(`  - Activation mode: ${pluginOptions.activation}`);

          if (pluginOptions.sem) {
            console.log(
              `  - SEM environment: ${pluginOptions.sem.defaultScene}`,
            );
          }

          if (pluginOptions.mcp) {
            console.log('  - AI: enabled (WebSocket at /__iwer_mcp)');
          }

          if (pluginOptions.activation === 'localhost') {
            console.log(
              '  - Note: Runtime only activates on localhost/local networks',
            );
          }

          console.log(''); // Extra line for spacing
        }
      },
    },
  };
}

/** @deprecated Use `iwsdkDev` instead */
export const injectIWER = iwsdkDev;
