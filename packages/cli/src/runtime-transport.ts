/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import WebSocket from 'ws';
import type {
  RuntimeBrowserState,
  RuntimeIssueCause,
  RuntimeSession,
} from './runtime-contract.js';

const FAST_WSS_FALLBACK_TIMEOUT_MS = 1500;

type RuntimeCommandError = { message?: string; cause?: RuntimeIssueCause };

export interface RuntimeCommandResponse {
  id?: string;
  result?: unknown;
  _tabId?: string;
  _tabGeneration?: number;
  error?: RuntimeCommandError;
}

export interface SendRuntimeCommandOptions {
  port: number;
  method: string;
  params?: unknown;
  timeoutMs?: number;
  runtimeSession?: RuntimeSession | null;
}

export class RuntimeCommandExecutionError extends Error {
  issueCause?: RuntimeIssueCause;
  browser?: RuntimeBrowserState;

  constructor(
    message: string,
    options: {
      issueCause?: RuntimeIssueCause;
      browser?: RuntimeBrowserState;
    } = {},
  ) {
    super(message);
    this.name = 'RuntimeCommandExecutionError';
    this.issueCause = options.issueCause;
    this.browser = options.browser;
  }
}

class RuntimeCommandTransportError extends RuntimeCommandExecutionError {
  constructor(
    message: string,
    options: {
      issueCause?: RuntimeIssueCause;
      browser?: RuntimeBrowserState;
    } = {},
  ) {
    super(message, options);
    this.name = 'RuntimeCommandTransportError';
  }
}

function inferRuntimeIssueCause(
  message: string,
  browser: RuntimeBrowserState | undefined,
  explicitCause?: RuntimeIssueCause,
): RuntimeIssueCause | undefined {
  if (explicitCause) {
    return explicitCause;
  }

  const normalized = message.toLowerCase();
  if (browser?.status === 'launch_failed') {
    return browser.lastError?.cause ?? 'browser_launch_failed';
  }
  if (browser?.status === 'launching' || browser?.status === 'waiting_for_connection') {
    return 'browser_not_ready';
  }
  if (browser?.status === 'disconnected') {
    return browser.lastError?.cause ?? 'connection_lost';
  }
  if (normalized.includes('browser not ready')) {
    return browser?.lastError?.cause ?? 'browser_not_ready';
  }
  if (normalized.includes('browser_relaunched') || normalized.includes('relaunch')) {
    return 'browser_relaunched';
  }
  if (/permission|not permitted|denied|sandbox|eacces|eperm/i.test(normalized)) {
    return 'permission_denied';
  }
  if (
    normalized.includes('socket hang up') ||
    normalized.includes('request timeout') ||
    normalized.includes('econnreset') ||
    normalized.includes('econnrefused')
  ) {
    return browser?.connected ? 'connection_lost' : 'browser_not_ready';
  }
  return undefined;
}

async function trySendRuntimeCommand(
  protocol: 'ws' | 'wss',
  port: number,
  method: string,
  params: unknown,
  timeoutMs: number,
  browser: RuntimeBrowserState | undefined,
): Promise<RuntimeCommandResponse> {
  return new Promise<RuntimeCommandResponse>((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ws = new WebSocket(`${protocol}://localhost:${port}/__iwer_mcp`, {
      rejectUnauthorized: false,
    });

    const timeout = setTimeout(() => {
      ws.close();
      const message = `Request timeout for ${method}`;
      reject(
        new RuntimeCommandTransportError(message, {
          issueCause: inferRuntimeIssueCause(message, browser),
          browser,
        }),
      );
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params: params ?? {},
        }),
      );
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const response = JSON.parse(data.toString()) as RuntimeCommandResponse;
        if (response.id !== requestId) {
          return;
        }

        clearTimeout(timeout);
        ws.close();
        if (response.error) {
          const message = response.error.message ?? 'Unknown runtime error';
          reject(
            new RuntimeCommandExecutionError(message, {
              issueCause: inferRuntimeIssueCause(message, browser, response.error.cause),
              browser,
            }),
          );
          return;
        }
        resolve(response);
      } catch (error) {
        clearTimeout(timeout);
        ws.close();
        reject(
          new RuntimeCommandTransportError(
            error instanceof Error ? error.message : String(error),
            {
              issueCause: inferRuntimeIssueCause(
                error instanceof Error ? error.message : String(error),
                browser,
              ),
              browser,
            },
          ),
        );
      }
    });

    ws.on('error', (error: Error) => {
      clearTimeout(timeout);
      ws.close();
      reject(
        new RuntimeCommandTransportError(error.message, {
          issueCause: inferRuntimeIssueCause(error.message, browser),
          browser,
        }),
      );
    });
  });
}

export async function sendRuntimeCommand({
  port,
  method,
  params,
  timeoutMs = 30000,
  runtimeSession,
}: SendRuntimeCommandOptions): Promise<RuntimeCommandResponse> {
  const browser = runtimeSession?.browser;
  const secureAttemptTimeout = Math.min(timeoutMs, FAST_WSS_FALLBACK_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    return await trySendRuntimeCommand(
      'wss',
      port,
      method,
      params,
      secureAttemptTimeout,
      browser,
    );
  } catch (error) {
    if (!(error instanceof RuntimeCommandTransportError)) {
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(timeoutMs - elapsedMs, 1);
    return trySendRuntimeCommand('ws', port, method, params, remainingMs, browser);
  }
}
