/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
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

const MAX_LOGS = 1000; // Keep last 1000 logs in memory

/**
 * Console capture that stores logs and can send them to the server.
 *
 * Intercepts console.log/info/warn/error/debug/trace and console.assert,
 * and listens for uncaught exceptions and unhandled promise rejections.
 */
export class ConsoleCapture {
  private logs: CapturedLog[] = [];
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    trace: typeof console.trace;
    assert: typeof console.assert;
  };
  private onLog?: (log: CapturedLog) => void;
  private isCapturing = false;

  private errorHandler = (event: ErrorEvent) => {
    // Distinguish JS exceptions (ErrorEvent with message) from resource
    // load errors (plain Event on <img>/<script> etc.).
    if (!event.message) return;
    const err = event.error;
    const text =
      err instanceof Error
        ? this.stringify(err)
        : `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
    this.capture('error', [`[uncaught] ${text}`]);
  };

  private rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const text =
      reason instanceof Error ? this.stringify(reason) : String(reason);
    this.capture('error', [`[unhandledrejection] ${text}`]);
  };

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
      trace: console.trace.bind(console),
      assert: console.assert.bind(console),
    };
  }

  /**
   * Start capturing console output
   */
  start(onLog?: (log: CapturedLog) => void): void {
    this.onLog = onLog;

    // Override console methods. The try/catch ensures the original console
    // method is always called even if capture fails (e.g. on exotic objects).
    console.log = (...args: unknown[]) => {
      try {
        this.capture('log', args);
      } catch {
        /* noop */
      }
      this.originalConsole.log(...args);
    };

    console.info = (...args: unknown[]) => {
      try {
        this.capture('info', args);
      } catch {
        /* noop */
      }
      this.originalConsole.info(...args);
    };

    console.warn = (...args: unknown[]) => {
      try {
        this.capture('warn', args);
      } catch {
        /* noop */
      }
      this.originalConsole.warn(...args);
    };

    console.error = (...args: unknown[]) => {
      try {
        this.capture('error', args);
      } catch {
        /* noop */
      }
      this.originalConsole.error(...args);
    };

    console.debug = (...args: unknown[]) => {
      try {
        this.capture('debug', args);
      } catch {
        /* noop */
      }
      this.originalConsole.debug(...args);
    };

    console.trace = (...args: unknown[]) => {
      try {
        this.capture('trace', args);
      } catch {
        /* noop */
      }
      // Guard: Node's console.trace internally calls console.error,
      // which would trigger a second capture without this guard.
      this.isCapturing = true;
      try {
        this.originalConsole.trace(...args);
      } finally {
        this.isCapturing = false;
      }
    };

    console.assert = (condition?: boolean, ...args: unknown[]) => {
      if (!condition) {
        try {
          this.capture('error', [`Assertion failed: ${args.map((a) => this.stringify(a)).join(' ')}`]);
        } catch {
          /* noop */
        }
      }
      // Guard: Node's console.assert internally calls console.error on failure,
      // which would trigger a second capture without this guard.
      this.isCapturing = true;
      try {
        this.originalConsole.assert(condition, ...args);
      } finally {
        this.isCapturing = false;
      }
    };

    // Listen for uncaught exceptions and unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.errorHandler);
      window.addEventListener('unhandledrejection', this.rejectionHandler);
    }
  }

  /**
   * Stop capturing and restore original console methods
   */
  stop(): void {
    this.onLog = undefined;
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.trace = this.originalConsole.trace;
    console.assert = this.originalConsole.assert;

    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this.errorHandler);
      window.removeEventListener('unhandledrejection', this.rejectionHandler);
    }
  }

  /**
   * Capture a log entry, compacting consecutive duplicate messages.
   */
  private capture(level: LogLevel, args: unknown[]): void {
    // Reentrancy guard: if an onLog callback (or error handler) triggers
    // another console call, skip capture to prevent infinite recursion.
    if (this.isCapturing) return;
    this.isCapturing = true;

    try {
      const stringifiedArgs = args.map((arg) => this.stringify(arg));
      const message = stringifiedArgs.join(' ');

      // Log compaction: if the last entry has the same level + message,
      // increment its repeat count instead of adding a new entry.
      const last = this.logs[this.logs.length - 1];
      if (last && last.level === level && last.message === message) {
        last.repeatCount = (last.repeatCount ?? 1) + 1;
        last.timestamp = Date.now();
        // Still notify listener with the updated entry
        if (this.onLog) {
          this.onLog(last);
        }
        return;
      }

      const log: CapturedLog = {
        timestamp: Date.now(),
        level,
        message,
        args: stringifiedArgs,
      };

      this.logs.push(log);

      // Keep only the last MAX_LOGS
      if (this.logs.length > MAX_LOGS) {
        this.logs.shift();
      }

      // Notify listener
      if (this.onLog) {
        this.onLog(log);
      }
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Stringify a value for logging
   */
  private stringify(value: unknown): string {
    if (value === undefined) {
      return 'undefined';
    }
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return `${value}n`;
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }
    if (value instanceof Error) {
      let text = `${value.name}: ${value.message}`;
      if (value.stack) {
        text += `\n${value.stack}`;
      }
      if (value.cause) {
        text += `\nCaused by: ${this.stringify(value.cause)}`;
      }
      return text;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Query logs with filters
   */
  query(options: LogQuery = {}): CapturedLog[] {
    let result = [...this.logs];

    // Filter by level
    if (options.level) {
      const levels = Array.isArray(options.level)
        ? options.level
        : [options.level];
      if (levels.length > 0) {
        result = result.filter((log) => levels.includes(log.level));
      }
    }

    // Filter by time range
    if (options.since) {
      result = result.filter((log) => log.timestamp >= options.since!);
    }
    if (options.until) {
      result = result.filter((log) => log.timestamp <= options.until!);
    }

    // Filter by pattern (regex)
    if (options.pattern) {
      const regex = new RegExp(options.pattern, 'i');
      result = result.filter((log) => regex.test(log.message));
    }

    // Limit count (get last N logs)
    if (options.count && options.count > 0) {
      result = result.slice(-options.count);
    }

    return result;
  }

  /**
   * Get all logs
   */
  getAll(): CapturedLog[] {
    return [...this.logs];
  }

  /**
   * Clear all captured logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get the count of captured logs
   */
  get count(): number {
    return this.logs.length;
  }
}

// Singleton instance
let captureInstance: ConsoleCapture | null = null;

export function getConsoleCapture(): ConsoleCapture {
  if (!captureInstance) {
    captureInstance = new ConsoleCapture();
  }
  return captureInstance;
}

export function startConsoleCapture(
  onLog?: (log: CapturedLog) => void,
): ConsoleCapture {
  const capture = getConsoleCapture();
  capture.start(onLog);
  return capture;
}
