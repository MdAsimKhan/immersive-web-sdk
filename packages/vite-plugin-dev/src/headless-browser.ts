/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { chromium } from 'playwright';
import * as os from 'os';

/**
 * Log types for the server-side console capture.
 */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface CapturedLog {
  timestamp: number;
  level: LogLevel;
  message: string;
  args: string[];
  repeatCount?: number;
}

export interface LogQuery {
  count?: number;
  level?: LogLevel | LogLevel[];
  pattern?: string;
  since?: number;
  until?: number;
}

const MAX_LOGS = 1000;

/** Map Playwright console message types to our LogLevel. */
const PLAYWRIGHT_TYPE_MAP: Record<string, LogLevel | undefined> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
  trace: 'trace',
  assert: 'error',
};

/**
 * Server-side console capture that accumulates Playwright console events.
 */
class ServerSideConsoleCapture {
  private logs: CapturedLog[] = [];

  add(level: LogLevel, message: string): void {
    // Log compaction: if the last entry has the same level + message,
    // increment repeatCount instead of adding a new entry.
    const last = this.logs[this.logs.length - 1];
    if (last && last.level === level && last.message === message) {
      last.repeatCount = (last.repeatCount ?? 1) + 1;
      last.timestamp = Date.now();
      return;
    }

    this.logs.push({
      timestamp: Date.now(),
      level,
      message,
      args: [message],
    });

    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
  }

  query(options: LogQuery = {}): CapturedLog[] {
    let result = [...this.logs];

    if (options.level) {
      const levels = Array.isArray(options.level)
        ? options.level
        : [options.level];
      if (levels.length > 0) {
        result = result.filter((log) => levels.includes(log.level));
      }
    }

    if (options.since) {
      result = result.filter((log) => log.timestamp >= options.since!);
    }
    if (options.until) {
      result = result.filter((log) => log.timestamp <= options.until!);
    }

    if (options.pattern) {
      const regex = new RegExp(options.pattern, 'i');
      result = result.filter((log) => regex.test(log.message));
    }

    if (options.count && options.count > 0) {
      result = result.slice(-options.count);
    }

    return result;
  }
}

export interface ManagedBrowser {
  close(): Promise<void>;
  page: unknown; // playwright.Page
  /** Query captured console logs. */
  queryLogs(options?: LogQuery): CapturedLog[];
  /** Take a screenshot of the browser page via CDP. */
  screenshot(): Promise<Buffer>;
  /** Register a callback invoked when the page/browser closes unexpectedly. */
  onClose(callback: () => void): void;
  /** Whether the underlying Playwright page has been closed. */
  isClosed(): boolean;
}

export async function launchManagedBrowser(
  url: string,
  headless: boolean,
  verbose: boolean,
  viewport: { width: number; height: number } = { width: 800, height: 800 },
): Promise<ManagedBrowser> {
  // Select GPU backend based on platform
  const angleBackend =
    os.platform() === 'darwin' ? 'metal' :
    os.platform() === 'win32' ? 'd3d11' :
    'gl';

  const browser = await chromium.launch({
    headless,
    args: [
      '--enable-webgl',                        // Ensure WebGL is available
      '--use-gl=angle',                        // Use ANGLE for WebGL
      `--use-angle=${angleBackend}`,           // Platform-specific GPU backend
      '--disable-background-timer-throttling', // No rAF throttling
      '--disable-renderer-backgrounding',
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true, // Accept self-signed certs (e.g. from mkcert)
    viewport, // Configurable viewport for screenshot resolution
  });
  const page = await context.newPage();

  // Server-side console capture — accumulates logs from Playwright via CDP
  const consoleCapture = new ServerSideConsoleCapture();

  page.on('console', (msg: any) => {
    const type = msg.type() as string;
    const text = msg.text() as string;
    const level = PLAYWRIGHT_TYPE_MAP[type];

    // Accumulate into server-side buffer
    if (level) {
      consoleCapture.add(level, text);
    }

    // Also forward to Node console for debugging
    if (type === 'error') {
      console.error('[browser]', text);
    } else if (verbose) {
      console.log(`[browser:${type}]`, text);
    }
  });

  // Capture uncaught page errors (with full stack traces)
  page.on('pageerror', (err: any) => {
    // err.stack already includes "ErrorName: message" as its first line
    const text = err.stack || (err.name ? `${err.name}: ${err.message}` : err.message);
    consoleCapture.add('error', `[uncaught] ${text}`);
    console.error('[browser:pageerror]', text);
  });

  // Capture unhandled promise rejections by re-emitting as console.error
  // (which Playwright's page.on('console') already captures via CDP)
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      // reason.stack already includes "ErrorName: message" as its first line
      const text =
        reason instanceof Error
          ? (reason.stack || `${reason.name}: ${reason.message}`)
          : String(reason);
      console.error(`[unhandledrejection] ${text}`);
    });
  });

  // Mark this tab as the Playwright-managed tab. The injection template
  // checks this flag and only initializes the MCP WebSocket client when
  // present, so manually-opened browser tabs are not remote-controlled.
  await page.addInitScript(() => {
    (window as any).__IWER_MCP_MANAGED = true;
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for IWER to inject and XR device to be available
  await page.waitForFunction(
    () => (window as any).IWER_DEVICE !== undefined,
    { timeout: 15000 },
  );

  if (verbose) {
    console.log(
      headless
        ? '🖥️  IWSDK: Headless browser launched'
        : '🖥️  IWSDK: Browser launched',
    );
  }

  // Track intentional vs unexpected closure
  let intentionalClose = false;
  let closeCallback: (() => void) | null = null;
  let closeFired = false;

  const fireCloseCallback = () => {
    if (!intentionalClose && closeCallback && !closeFired) {
      closeFired = true;
      closeCallback();
    }
  };

  page.on('close', fireCloseCallback);
  browser.on('disconnected', fireCloseCallback);

  return {
    close: async () => {
      intentionalClose = true;
      try {
        await context.close();
      } finally {
        await browser.close();
      }
    },
    page,
    queryLogs: (options?: LogQuery) => consoleCapture.query(options),
    screenshot: () => page.screenshot({ type: 'png' }),
    onClose: (callback: () => void) => {
      closeCallback = callback;
    },
    isClosed: () => (page as any).isClosed(),
  };
}
