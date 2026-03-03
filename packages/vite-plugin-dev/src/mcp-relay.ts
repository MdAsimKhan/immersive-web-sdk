/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Minimal WebSocket interface used by the relay.
 * Compatible with both the `ws` library and the browser WebSocket API.
 */
export interface RelayWebSocket {
  readyState: number;
  send(data: string): void;
}

/** WebSocket OPEN readyState constant */
const WS_OPEN = 1;

export interface RelayOptions {
  verbose?: boolean;
}

export interface RelayHandler {
  /**
   * Handle an incoming message from a connected client.
   * Routes requests to all other clients and deduplicates responses
   * using first-response-wins semantics.
   */
  onMessage(senderWs: RelayWebSocket, data: string, clients: Set<RelayWebSocket>): void;

  /** Number of pending (unresolved) relay requests. */
  pendingCount(): number;

  /** Clean up stale pending entries older than `maxAgeMs`. */
  cleanStale(maxAgeMs: number): void;
}

/**
 * Create a relay handler that implements first-response-wins message routing.
 *
 * When multiple browser tabs are connected, a request from the MCP server is
 * broadcast to all tabs. Each tab processes it and responds. The relay
 * forwards only the FIRST response for each request ID and silently drops
 * duplicates.
 */
export function createRelayHandler(options?: RelayOptions): RelayHandler {
  const verbose = options?.verbose ?? false;

  // Track pending request IDs for first-response-wins deduplication.
  const pendingRelayRequests = new Map<
    string,
    { timestamp: number; sourceWs: RelayWebSocket }
  >();

  function onMessage(
    senderWs: RelayWebSocket,
    data: string,
    clients: Set<RelayWebSocket>,
  ): void {
    let parsed: {
      id?: string;
      method?: string;
      result?: unknown;
      error?: unknown;
    } | null = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON — broadcast as-is for backward compatibility
    }

    if (parsed && typeof parsed.id === 'string') {
      const isRequest = typeof parsed.method === 'string';
      const isResponse =
        !parsed.method &&
        (parsed.result !== undefined || parsed.error !== undefined);

      if (isRequest) {
        // Track this request for deduplication
        pendingRelayRequests.set(parsed.id, {
          timestamp: Date.now(),
          sourceWs: senderWs,
        });
        // Broadcast request to all OTHER clients (all browser tabs)
        clients.forEach((client) => {
          if (client !== senderWs && client.readyState === WS_OPEN) {
            client.send(data);
          }
        });
        return;
      }

      if (isResponse) {
        const pending = pendingRelayRequests.get(parsed.id);
        if (pending) {
          // First response wins — forward to the original requester
          pendingRelayRequests.delete(parsed.id);
          if (pending.sourceWs.readyState === WS_OPEN) {
            pending.sourceWs.send(data);
          }
          if (verbose) {
            console.log(
              `[MCP-IWER] Response for ${parsed.id} forwarded (first-wins)`,
            );
          }
        } else if (verbose) {
          console.log(
            `[MCP-IWER] Duplicate response for ${parsed.id} dropped`,
          );
        }
        return;
      }
    }

    // Unknown message shape — broadcast for backward compatibility
    clients.forEach((client) => {
      if (client !== senderWs && client.readyState === WS_OPEN) {
        client.send(data);
      }
    });
  }

  function pendingCount(): number {
    return pendingRelayRequests.size;
  }

  function cleanStale(maxAgeMs: number): void {
    const now = Date.now();
    for (const [id, entry] of pendingRelayRequests) {
      if (now - entry.timestamp > maxAgeMs) {
        pendingRelayRequests.delete(id);
      }
    }
  }

  return { onMessage, pendingCount, cleanStale };
}
