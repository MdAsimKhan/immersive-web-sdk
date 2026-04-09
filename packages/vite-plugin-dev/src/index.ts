/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import {
  launchManagedBrowser,
  type ManagedBrowser,
} from './headless-browser.js';
import { reportSessionStart, reportSessionEnd } from './hzdb-telemetry.js';
import { buildInjectionBundle } from './injection-bundler.js';
import { createRelayHandler } from './mcp-relay.js';
import {
  registerRuntimeSession,
  setRuntimeSessionBrowserState,
  unregisterRuntimeSession,
} from './runtime-session.js';
import type {
  RuntimeBrowserState,
  RuntimeIssueCause,
  RuntimeIssueInfo,
} from '@iwsdk/cli/contract';
import type {
  DevPluginOptions,
  ProcessedDevOptions,
  InjectionBundleResult,
  AiTool,
  AiMode,
} from './types.js';

// Export types for users
export type {
  DevPluginOptions,
  AiOptions,
  AiMode,
  EmulatorOptions,
  ProcessedDevOptions,
  IWERPluginOptions,
  SEMOptions,
  AiTool,
} from './types.js';

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
 * Derive internal headless / devUI / viewport settings from the AI mode.
 */
const MODE_SETTINGS: Record<
  AiMode,
  { headless: boolean; devUI: boolean; fixedViewport: boolean }
> = {
  agent: { headless: true, devUI: false, fixedViewport: true },
  oversight: { headless: false, devUI: false, fixedViewport: false },
  collaborate: { headless: false, devUI: true, fixedViewport: false },
};

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

  // AI is opt-in: omit `ai` to disable entirely
  if (options.ai) {
    const mode = options.ai.mode ?? 'agent';
    const settings = MODE_SETTINGS[mode];
    if (!settings) {
      const valid = Object.keys(MODE_SETTINGS).join(', ');
      throw new Error(
        `[IWSDK] Invalid ai.mode "${mode}". Valid modes: ${valid}`,
      );
    }
    const ssInput = options.ai.screenshotSize;
    const ssWidth = ssInput?.width;
    const ssHeight = ssInput?.height;
    const screenshotSize = {
      width: ssWidth ?? ssHeight ?? 800,
      height: ssHeight ?? ssWidth ?? 800,
    };

    processed.ai = {
      mode,
      tools: options.ai.tools ?? ['claude'],
      headless: settings.headless,
      devUI: settings.devUI,
      viewport: settings.fixedViewport ? screenshotSize : null,
      screenshotSize,
    };
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
      // In oversight/collaborate mode the Playwright window IS the visible
      // browser, so suppress Vite's auto-open to avoid a duplicate tab.
      if (pluginOptions.ai && !pluginOptions.ai.headless) {
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
        console.log(
          `  - AI: ${pluginOptions.ai ? `enabled (${pluginOptions.ai.mode} mode)` : 'disabled'}`,
        );
        console.log(`  - Activation: ${pluginOptions.activation}`);
        if (pluginOptions.userAgentException) {
          console.log('  - UA exception: enabled');
        }
        console.log(`  - Inject on build: ${pluginOptions.injectOnBuild}`);
      }
    },

    configureServer(server: ViteDevServer) {
      if (!pluginOptions.ai) {
        return;
      }

      // Closure-scoped state for browser auto-recovery
      let browserLaunchPromise: Promise<void> | null = null;
      let browserRuntimeClients: Set<WebSocket> | null = null;
      let serverShuttingDown = false;
      let browserUrl = '';
      let consecutiveFailures = 0;
      const MAX_LAUNCH_FAILURES = 3;

      const createBrowserIssue = (
        cause: RuntimeIssueCause,
        message: string,
      ): RuntimeIssueInfo => ({
        cause,
        message,
        at: new Date().toISOString(),
      });

      const classifyBrowserLaunchFailure = (message: string): RuntimeIssueCause =>
        /permission|not permitted|denied|sandbox|eacces|eperm/i.test(message)
          ? 'permission_denied'
          : 'browser_launch_failed';

      const createBrowserState = (
        status: RuntimeBrowserState['status'],
        options: {
          connected?: boolean;
          connectedClientCount?: number;
          lastError?: RuntimeIssueInfo;
        } = {},
      ): RuntimeBrowserState => {
        const connectedClientCount =
          options.connectedClientCount ?? browserRuntimeClients?.size ?? 0;
        const connected = options.connected ?? status === 'connected';

        return {
          status,
          connected,
          connectedClientCount,
          lastTransitionAt: new Date().toISOString(),
          ...(options.lastError ? { lastError: options.lastError } : {}),
        };
      };

      const publishBrowserState = (browser: RuntimeBrowserState): void => {
        void setRuntimeSessionBrowserState(config.root, browser).catch((error) => {
          console.error('[IWSDK Dev] Failed to update browser state:', error);
        });
      };

      /**
       * Launch (or re-launch) the Playwright-managed browser.
       * Guards against concurrent launches via `browserLaunchPromise`.
       * Stops retrying after MAX_LAUNCH_FAILURES consecutive failures.
       */
      const launchBrowser = (): Promise<void> => {
        if (browserLaunchPromise) {
          return browserLaunchPromise;
        }

        browserLaunchPromise = (async () => {
          publishBrowserState(createBrowserState('launching'));
          try {
            const browser = await launchManagedBrowser(
              browserUrl,
              pluginOptions.ai!.headless,
              pluginOptions.verbose,
              pluginOptions.ai!.viewport,
              pluginOptions.ai!.screenshotSize,
            );
            managedBrowser = browser;
            consecutiveFailures = 0;
            publishBrowserState(
              createBrowserState(
                (browserRuntimeClients?.size ?? 0) > 0
                  ? 'connected'
                  : 'waiting_for_connection',
                {
                  connected: (browserRuntimeClients?.size ?? 0) > 0,
                },
              ),
            );

            // On unexpected close, mark as null. The browser will be
            // relaunched lazily on the next MCP request via ensureBrowser().
            browser.onClose(() => {
              managedBrowser = null;
              publishBrowserState(
                createBrowserState('disconnected', {
                  connected: false,
                  lastError: createBrowserIssue(
                    'connection_lost',
                    'Managed browser closed unexpectedly. It will relaunch on the next MCP request.',
                  ),
                }),
              );
              if (!serverShuttingDown) {
                console.log(
                  '🔄 IWSDK: Browser closed. Will relaunch on next MCP request.',
                );
              }
            });
          } catch (error) {
            consecutiveFailures++;
            const message = error instanceof Error ? error.message : String(error);
            publishBrowserState(
              createBrowserState('launch_failed', {
                connected: false,
                lastError: createBrowserIssue(
                  classifyBrowserLaunchFailure(message),
                  message,
                ),
              }),
            );
            console.error('❌ IWSDK: Failed to launch browser:', error);
            if (consecutiveFailures >= MAX_LAUNCH_FAILURES) {
              console.error(
                `❌ IWSDK: ${MAX_LAUNCH_FAILURES} consecutive launch failures, giving up. ` +
                  'Restart the dev server to retry.',
              );
            }
          } finally {
            browserLaunchPromise = null;
          }
        })();

        return browserLaunchPromise;
      };

      /**
       * Return the current managed browser, re-launching if it was closed.
       * `relaunched` is true when the browser was just freshly launched
       * (meaning the previous page state was lost).
       */
      const ensureBrowser = async (): Promise<{
        browser: ManagedBrowser | null;
        relaunched: boolean;
      }> => {
        const current = managedBrowser;
        if (current && !current.isClosed()) {
          return { browser: current, relaunched: false };
        }
        managedBrowser = null;
        if (consecutiveFailures >= MAX_LAUNCH_FAILURES) {
          return { browser: null, relaunched: false };
        }
        await launchBrowser();
        return { browser: managedBrowser, relaunched: managedBrowser !== null };
      };

      // Initialize WebSocket server and client tracking
      mcpClients = new Set();
      browserRuntimeClients = new Set();
      mcpWss = new WebSocketServer({ noServer: true });

      // First-response-wins relay handler (extracted for testability)
      const relay = createRelayHandler({
        verbose: pluginOptions.verbose,
      });

      // Clean up stale entries every 60 seconds
      const relayCleanupInterval = setInterval(() => {
        relay.cleanStale(60000);
      }, 60000);
      relayCleanupInterval.unref();

      mcpWss.on('connection', (ws: WebSocket) => {
        mcpClients!.add(ws);

        if (pluginOptions.verbose) {
          console.log('[IWSDK-MCP] Client connected');
        }

        ws.on('message', async (data: Buffer) => {
          const message = data.toString();
          if (pluginOptions.verbose) {
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

            if (parsed?.type === 'iwsdk_browser_hello') {
              intercepted = true;
              if (!browserRuntimeClients!.has(ws)) {
                browserRuntimeClients!.add(ws);
                publishBrowserState(
                  createBrowserState('connected', {
                    connected: true,
                    connectedClientCount: browserRuntimeClients!.size,
                  }),
                );
              }
              return;
            }

            const BROWSER_RELAUNCHED_RESULT = {
              status: 'browser_relaunched',
              message:
                'Browser was closed and has been relaunched. ' +
                'The page state has been reset — please retry your request.',
            };

            // Console logs: Playwright captures via CDP
            if (parsed.method === 'get_console_logs' && parsed.id) {
              intercepted = true;
              const { browser, relaunched } = await ensureBrowser();
              if (relaunched) {
                ws.send(
                  JSON.stringify({
                    id: parsed.id,
                    result: BROWSER_RELAUNCHED_RESULT,
                  }),
                );
              } else {
                const params = parsed.params ?? {};
                if (!params.level) {
                  params.level = ['log', 'info', 'warn', 'error'];
                }
                const result = browser ? browser.queryLogs(params) : [];
                ws.send(JSON.stringify({ id: parsed.id, result }));
              }
            }

            // Screenshot: Playwright captures via CDP compositor
            if (!intercepted && parsed.method === 'screenshot' && parsed.id) {
              intercepted = true;
              try {
                const { browser, relaunched } = await ensureBrowser();
                if (relaunched) {
                  ws.send(
                    JSON.stringify({
                      id: parsed.id,
                      result: BROWSER_RELAUNCHED_RESULT,
                    }),
                  );
                } else if (browser) {
                  const buffer = await browser.screenshot();
                  const base64 = buffer.toString('base64');
                  ws.send(
                    JSON.stringify({
                      id: parsed.id,
                      result: { imageData: base64, mimeType: 'image/png' },
                    }),
                  );
                } else {
                  ws.send(
                    JSON.stringify({
                      id: parsed.id,
                      error: { code: -32000, message: 'Browser not ready' },
                    }),
                  );
                }
              } catch (err) {
                ws.send(
                  JSON.stringify({
                    id: parsed.id,
                    error: {
                      code: -32000,
                      message: err instanceof Error ? err.message : String(err),
                    },
                  }),
                );
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
          if (browserRuntimeClients!.delete(ws)) {
            publishBrowserState(
              createBrowserState(
                browserRuntimeClients!.size > 0 ? 'connected' : 'disconnected',
                {
                  connected: browserRuntimeClients!.size > 0,
                  connectedClientCount: browserRuntimeClients!.size,
                  lastError:
                    browserRuntimeClients!.size > 0
                      ? undefined
                      : createBrowserIssue(
                          'connection_lost',
                          'Managed browser runtime disconnected from the MCP bridge.',
                        ),
                },
              ),
            );
          }
          if (pluginOptions.verbose) {
            console.log('[IWSDK-MCP] Client disconnected');
          }
        });

        ws.on('error', (error) => {
          if (pluginOptions.verbose) {
            console.error('[IWSDK-MCP] WebSocket error:', error);
          }
        });
      });

      // Set up WebSocket endpoint for MCP - handle upgrade requests
      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url !== '/__iwer_mcp') {
          return;
        }

        if (pluginOptions.verbose) {
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

      // Register the project-local runtime session after server start.
      // Waiting for 'listening' lets us record Vite's actual chosen port.

      // Find the path to the RAG MCP server
      const ragMcpServerPath = path.join(
        config.root,
        'node_modules',
        '@felixtz',
        'iwsdk-rag-mcp',
        'dist',
        'index.js',
      );

      // Resolve IWSDK version for telemetry attribution
      let iwsdkVersion: string | undefined;
      try {
        const pluginPkgPath = path.join(
          config.root,
          'node_modules',
          '@iwsdk',
          'vite-plugin-dev',
          'package.json',
        );
        const pluginPkg = JSON.parse(readFileSync(pluginPkgPath, 'utf-8'));
        iwsdkVersion = pluginPkg.version;
      } catch {
        // Version detection is best-effort
      }

      // Session tracking for telemetry
      const sessionId = randomUUID();
      const sessionStartTime = Date.now();

      // Wait for server to start listening to get the actual port
      server.httpServer?.on('listening', async () => {
        const address = server.httpServer?.address();
        const actualPort =
          typeof address === 'object' && address
            ? address.port
            : server.config.server.port || 5173;

        const protocol = server.config.server.https ? 'https' : 'http';
        browserUrl = `${protocol}://localhost:${actualPort}`;
        try {
          await registerRuntimeSession({
            sessionId,
            workspaceRoot: config.root,
            pid: process.pid,
            port: actualPort,
            localUrl: server.resolvedUrls?.local?.[0] ?? browserUrl,
            networkUrls: server.resolvedUrls?.network ?? [],
            aiMode: pluginOptions.ai?.mode,
            aiTools: pluginOptions.ai?.tools ?? [],
            browser: createBrowserState('launching', { connected: false }),
          });
        } catch (error) {
          console.error('[IWSDK Dev] Failed to register runtime session:', error);
        }

        // Report session start to hzdb telemetry (fire-and-forget via npx)
        reportSessionStart(sessionId, {
          iwsdkVersion,
          clientVersion: iwsdkVersion,
          port: actualPort,
        });

        // Warm up RAG MCP server (downloads embedding model if needed)
        // This ensures the model is cached before Claude Code tries to use it
        warmupRagMcp(ragMcpServerPath, pluginOptions.verbose);

        // Launch Playwright-managed browser
        launchBrowser();
      });

      // Clean up WebSocket server and browser when Vite server closes.
      server.httpServer?.on('close', () => {
        serverShuttingDown = true;
        void unregisterRuntimeSession(config.root);

        reportSessionEnd(sessionId, {
          durationMs: Date.now() - sessionStartTime,
          reason: 'user_closed',
          clientVersion: iwsdkVersion,
        });

        if (mcpWss) {
          for (const client of mcpClients || []) {
            client.close();
          }
          mcpClients?.clear();
          mcpWss.close();
          mcpWss = null;
        }

        if (managedBrowser) {
          managedBrowser.close().catch(() => {});
          managedBrowser = null;
        }
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
          console.log('🚀 IWSDK Dev: Starting injection bundle generation...');
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

          if (pluginOptions.ai) {
            console.log(
              `  - AI: ${pluginOptions.ai.mode} mode (WebSocket at /__iwer_mcp)`,
            );
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
