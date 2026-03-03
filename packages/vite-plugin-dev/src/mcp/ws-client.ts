/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { XRDevice } from 'iwer';

/**
 * Interface that any framework can implement to provide MCP tools.
 * The vite plugin will route requests to this runtime when available.
 */
interface FrameworkMCPRuntime {
  /**
   * Returns true if this runtime handles the given method.
   */
  handles(method: string): boolean;

  /**
   * Dispatch a method call. Returns result or throws an error.
   */
  dispatch(method: string, params: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Window {
    FRAMEWORK_MCP_RUNTIME?: FrameworkMCPRuntime;
  }
}

/**
 * MCP request message format
 */
interface MCPRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

/**
 * MCP response message format
 */
interface MCPResponse {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * WebSocket client that connects the browser to the Vite dev server's MCP endpoint.
 * Routes commands to device.remote.dispatch() for IWER tools,
 * framework runtime for IWSDK tools, and handles page reload locally.
 */
export class MCPWebSocketClient {
  private ws: WebSocket | null = null;
  private device: XRDevice;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  private verbose: boolean;

  // Tab identity: stable across reloads/HMR within the same browser tab,
  // new ID when the tab is closed and reopened.
  readonly tabId: string;
  readonly tabGeneration: number;

  constructor(device: XRDevice, options: { verbose?: boolean } = {}) {
    this.device = device;
    this.verbose = options.verbose ?? false;

    // sessionStorage is scoped per tab — survives reloads/HMR but not tab close
    let id = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('iwer-mcp-tab-id')
      : null;
    if (!id) {
      id = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('iwer-mcp-tab-id', id);
      }
    }
    this.tabId = id;

    // Generation increments on every page load / HMR within the same tab
    const gen = typeof sessionStorage !== 'undefined'
      ? parseInt(sessionStorage.getItem('iwer-mcp-gen') || '0', 10) + 1
      : 1;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('iwer-mcp-gen', String(gen));
    }
    this.tabGeneration = gen;
  }

  /**
   * Connect to the Vite dev server's WebSocket endpoint
   */
  connect(port?: number): void {
    // Guard against duplicate connections
    if (this.ws !== null) {
      return;
    }

    this.intentionalDisconnect = false;

    const wsPort = port ?? this.getVitePort();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${host}:${wsPort}/__iwer_mcp`;

    if (this.verbose) {
      console.log('[IWSDK-MCP] Connecting to:', wsUrl);
    }

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[IWSDK-MCP] Failed to create WebSocket:', error);
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent onclose from scheduling reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  private getVitePort(): number {
    const port = parseInt(window.location.port, 10);
    return port || 5173;
  }

  private setupEventHandlers(): void {
    if (!this.ws) {
      return;
    }

    this.ws.onopen = () => {
      if (this.verbose) {
        console.log('[IWSDK-MCP] Connected');
      }
      this.reconnectAttempts = 0;
    };

    this.ws.onclose = (event) => {
      if (this.verbose) {
        console.log(
          '[IWSDK-MCP] Disconnected:',
          event.reason || 'Connection closed',
        );
      }
      this.ws = null;
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[IWSDK-MCP] WebSocket error:', error);
    };

    this.ws.onmessage = async (event) => {
      await this.handleMessage(event.data);
    };
  }

  private async handleMessage(data: string): Promise<void> {
    let request: MCPRequest;

    try {
      request = JSON.parse(data);
    } catch {
      console.error('[IWSDK-MCP] Invalid JSON received:', data);
      return;
    }

    // Validate request structure
    if (typeof request.id !== 'string' || typeof request.method !== 'string') {
      console.error('[IWSDK-MCP] Malformed request (missing id or method):', request);
      return;
    }

    if (this.verbose) {
      console.debug('[IWSDK-MCP] Received:', request.method, request.params);
    }

    const response: MCPResponse = { id: request.id };

    try {
      response.result = await this.dispatch(
        request.method,
        request.params ?? {},
      );
    } catch (error) {
      response.error = {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    if (this.verbose) {
      if (response.error) {
        console.debug('[IWSDK-MCP] Error:', response.error.message);
      } else {
        console.debug('[IWSDK-MCP] Result:', response.result);
      }
    }

    this.send(response);
  }

  /**
   * Dispatch a method call to the appropriate handler.
   * Priority:
   * 1. Plugin-specific tools (page reload - always local)
   * 2. Framework runtime (IWSDK or any framework providing FRAMEWORK_MCP_RUNTIME)
   * 3. IWER device control (device.remote.dispatch)
   */
  private async dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    // 1. Handle plugin-specific tools locally
    if (method === 'reload_page') {
      // Defer reload so the WebSocket response can flush before the page tears down
      setTimeout(() => window.location.reload(), 50);
      return { success: true, message: 'Page reload initiated' };
    }

    // 2. Route to framework runtime if available and handles this method
    if (window.FRAMEWORK_MCP_RUNTIME?.handles(method)) {
      return window.FRAMEWORK_MCP_RUNTIME.dispatch(method, params);
    }

    // 3. All other methods go to IWER's RemoteControlInterface
    return this.device.remote.dispatch(method, params);
  }

  private send(response: MCPResponse): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Inject tab identity so the MCP server knows which tab responded
      const enriched = {
        ...response,
        _tabId: this.tabId,
        _tabGeneration: this.tabGeneration,
      };
      this.ws.send(JSON.stringify(enriched));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.verbose) {
        console.debug('[IWSDK-MCP] Max reconnect attempts reached');
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    if (this.verbose) {
      console.debug(
        `[IWSDK-MCP] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
      );
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

/**
 * Initialize MCP WebSocket client and connect to the server
 */
export function initMCPClient(
  device: XRDevice,
  options: { port?: number; verbose?: boolean } = {},
): MCPWebSocketClient {
  const client = new MCPWebSocketClient(device, { verbose: options.verbose });
  client.connect(options.port);
  return client;
}
