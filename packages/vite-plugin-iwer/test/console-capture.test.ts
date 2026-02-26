/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConsoleCapture,
  getConsoleCapture,
  startConsoleCapture,
} from '../src/mcp/console-capture.js';

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture;
  let originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    trace: typeof console.trace;
    assert: typeof console.assert;
  };

  beforeEach(() => {
    // Store original console methods before each test
    originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      trace: console.trace,
      assert: console.assert,
    };
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    // Always stop capture and restore console
    capture.stop();
    // Ensure console is restored
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
    console.trace = originalConsole.trace;
    console.assert = originalConsole.assert;
  });

  describe('start/stop', () => {
    test('should start capturing console output', () => {
      capture.start();
      console.log('test message');
      expect(capture.count).toBe(1);
    });

    test('should stop capturing and restore console', () => {
      capture.start();
      console.log('captured');
      expect(capture.count).toBe(1);

      capture.stop();
      console.log('not captured');
      expect(capture.count).toBe(1); // Still 1, not 2
    });

    test('should call onLog callback when log is captured', () => {
      const onLog = vi.fn();
      capture.start(onLog);

      console.log('test');

      expect(onLog).toHaveBeenCalledTimes(1);
      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'log',
          message: 'test',
        }),
      );
    });

    test('should clear onLog callback on stop', () => {
      const onLog = vi.fn();
      capture.start(onLog);
      console.log('captured');
      expect(onLog).toHaveBeenCalledTimes(1);

      capture.stop();
      capture.start(); // restart without callback
      console.log('no callback');

      // onLog should not have been called again
      expect(onLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('capture all log levels', () => {
    beforeEach(() => {
      capture.start();
    });

    test('should capture console.log', () => {
      console.log('log message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('log');
      expect(logs[0].message).toBe('log message');
    });

    test('should capture console.info', () => {
      console.info('info message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
    });

    test('should capture console.warn', () => {
      console.warn('warn message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');
    });

    test('should capture console.error', () => {
      console.error('error message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
    });

    test('should capture console.debug', () => {
      console.debug('debug message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('debug');
    });

    test('should capture console.trace', () => {
      console.trace('trace message');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('trace');
    });

    test('should capture console.assert failures', () => {
      console.assert(false, 'assertion detail');
      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('Assertion failed');
      expect(logs[0].message).toContain('assertion detail');
    });

    test('should not capture console.assert when condition is true', () => {
      console.assert(true, 'should not appear');
      const logs = capture.getAll();
      expect(logs).toHaveLength(0);
    });
  });

  describe('argument formatting', () => {
    beforeEach(() => {
      capture.start();
    });

    test('should format multiple arguments', () => {
      console.log('hello', 'world');
      const logs = capture.getAll();
      expect(logs[0].message).toBe('hello world');
      expect(logs[0].args).toEqual(['hello', 'world']);
    });

    test('should stringify numbers and booleans', () => {
      console.log(42, true, false);
      const logs = capture.getAll();
      expect(logs[0].message).toBe('42 true false');
    });

    test('should stringify null and undefined', () => {
      console.log(null, undefined);
      const logs = capture.getAll();
      expect(logs[0].message).toBe('null undefined');
    });

    test('should stringify objects as JSON', () => {
      console.log({ foo: 'bar' });
      const logs = capture.getAll();
      expect(logs[0].message).toContain('"foo"');
      expect(logs[0].message).toContain('"bar"');
    });

    test('should format Error objects with stack trace', () => {
      const error = new Error('test error');
      console.error(error);
      const logs = capture.getAll();
      expect(logs[0].message).toContain('Error: test error');
      expect(logs[0].message).toContain('at'); // Stack trace contains "at"
    });

    test('should format Error objects with cause chain', () => {
      const root = new Error('root cause');
      const wrapper = new Error('wrapper', { cause: root });
      console.error(wrapper);
      const logs = capture.getAll();
      expect(logs[0].message).toContain('wrapper');
      expect(logs[0].message).toContain('Caused by:');
      expect(logs[0].message).toContain('root cause');
    });

    test('should handle circular references gracefully', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;
      console.log(circular);
      const logs = capture.getAll();
      // Should not throw and should produce some output
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBeDefined();
    });

    test('should stringify BigInt values with n suffix', () => {
      console.log(42n);
      const logs = capture.getAll();
      expect(logs[0].message).toBe('42n');
    });

    test('should stringify Symbol values', () => {
      console.log(Symbol('test'));
      const logs = capture.getAll();
      expect(logs[0].message).toBe('Symbol(test)');
    });
  });

  describe('log compaction', () => {
    beforeEach(() => {
      capture.start();
    });

    test('should compact consecutive identical messages', () => {
      console.log('repeated');
      console.log('repeated');
      console.log('repeated');

      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('repeated');
      expect(logs[0].repeatCount).toBe(3);
    });

    test('should not compact different messages', () => {
      console.log('first');
      console.log('second');

      const logs = capture.getAll();
      expect(logs).toHaveLength(2);
      expect(logs[0].repeatCount).toBeUndefined();
      expect(logs[1].repeatCount).toBeUndefined();
    });

    test('should not compact same message at different levels', () => {
      console.log('msg');
      console.warn('msg');

      const logs = capture.getAll();
      expect(logs).toHaveLength(2);
    });

    test('should restart compaction after a different message', () => {
      console.log('aaa');
      console.log('aaa');
      console.log('bbb');
      console.log('aaa');
      console.log('aaa');

      const logs = capture.getAll();
      expect(logs).toHaveLength(3);
      expect(logs[0].repeatCount).toBe(2);
      expect(logs[1].repeatCount).toBeUndefined();
      expect(logs[2].repeatCount).toBe(2);
    });

    test('should dramatically reduce buffer usage for frame-loop logs', () => {
      // Simulate 10000 identical frame-loop messages
      for (let i = 0; i < 10000; i++) {
        console.log('position updated');
      }

      const logs = capture.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].repeatCount).toBe(10000);
    });

    test('should notify onLog for compacted entries', () => {
      const onLog = vi.fn();
      capture.stop();
      capture.start(onLog);

      console.log('repeated');
      console.log('repeated');

      // Called twice: once for initial, once for compaction update
      expect(onLog).toHaveBeenCalledTimes(2);
      expect(onLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ repeatCount: 2 }),
      );
    });
  });

  describe('reentrancy protection', () => {
    test('should not recurse when onLog triggers console calls', () => {
      let callCount = 0;
      capture.start((log) => {
        callCount++;
        // This would cause infinite recursion without the guard
        console.log('from callback:', log.message);
      });

      console.log('trigger');

      // The capture from the callback should be skipped
      expect(callCount).toBe(1);
    });
  });

  describe('query filtering', () => {
    beforeEach(() => {
      capture.start();
      console.log('first log');
      console.info('info message');
      console.warn('warning here');
      console.error('error occurred');
      console.debug('debug info');
    });

    test('should filter by single level', () => {
      const errors = capture.query({ level: 'error' });
      expect(errors).toHaveLength(1);
      expect(errors[0].level).toBe('error');
    });

    test('should filter by multiple levels', () => {
      const warnAndError = capture.query({ level: ['warn', 'error'] });
      expect(warnAndError).toHaveLength(2);
      expect(warnAndError.map((l) => l.level)).toContain('warn');
      expect(warnAndError.map((l) => l.level)).toContain('error');
    });

    test('should return all logs when level is an empty array', () => {
      const result = capture.query({ level: [] as any });
      expect(result).toHaveLength(5);
    });

    test('should filter by pattern (regex)', () => {
      const withMessage = capture.query({ pattern: 'message' });
      // "info message" contains "message"
      expect(withMessage).toHaveLength(1);
      expect(withMessage[0].message).toBe('info message');
    });

    test('should filter by pattern case-insensitively', () => {
      const withError = capture.query({ pattern: 'ERROR' });
      expect(withError).toHaveLength(1);
      expect(withError[0].message).toBe('error occurred');
    });

    test('should throw on invalid regex pattern', () => {
      expect(() => capture.query({ pattern: '[invalid(' })).toThrow();
    });

    test('should limit count (last N logs)', () => {
      const last2 = capture.query({ count: 2 });
      expect(last2).toHaveLength(2);
      expect(last2[0].level).toBe('error');
      expect(last2[1].level).toBe('debug');
    });

    test('should filter by since timestamp', () => {
      const logs = capture.getAll();
      const midTimestamp = logs[2].timestamp;

      const sinceMiddle = capture.query({ since: midTimestamp });
      expect(sinceMiddle.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter by until timestamp', () => {
      const logs = capture.getAll();
      // All logs might have the same timestamp, so use timestamp + 1
      const firstTimestamp = logs[0].timestamp;

      const untilFirst = capture.query({ until: firstTimestamp });
      // Should include at least the first log
      expect(untilFirst.length).toBeGreaterThanOrEqual(1);
      // All results should have timestamp <= firstTimestamp
      untilFirst.forEach((log) => {
        expect(log.timestamp).toBeLessThanOrEqual(firstTimestamp);
      });
    });

    test('should combine multiple filters', () => {
      const result = capture.query({
        level: ['log', 'info', 'warn'],
        pattern: 'message|log',
        count: 2,
      });
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('log limit', () => {
    test('should keep only MAX_LOGS entries', () => {
      capture.start();

      // Log more than MAX_LOGS (1000) — each message is unique to avoid compaction
      for (let i = 0; i < 1050; i++) {
        console.log(`message ${i}`);
      }

      expect(capture.count).toBe(1000);
      // First log should be message 50 (0-49 were shifted out)
      const logs = capture.getAll();
      expect(logs[0].message).toBe('message 50');
    });
  });

  describe('clear', () => {
    test('should clear all captured logs', () => {
      capture.start();
      console.log('message 1');
      console.log('message 2');
      expect(capture.count).toBe(2);

      capture.clear();
      expect(capture.count).toBe(0);
      expect(capture.getAll()).toEqual([]);
    });
  });

  describe('getAll', () => {
    test('should return a copy of logs', () => {
      capture.start();
      console.log('test');

      const logs1 = capture.getAll();
      const logs2 = capture.getAll();

      expect(logs1).not.toBe(logs2); // Different array instances
      expect(logs1).toEqual(logs2); // Same content
    });
  });

  describe('timestamp', () => {
    test('should include timestamp in captured log', () => {
      const before = Date.now();
      capture.start();
      console.log('test');
      const after = Date.now();

      const logs = capture.getAll();
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(logs[0].timestamp).toBeLessThanOrEqual(after);
    });
  });
});

describe('Singleton functions', () => {
  let originalConsole: typeof console.log;

  beforeEach(() => {
    originalConsole = console.log;
  });

  afterEach(() => {
    // Get the singleton and stop it
    const capture = getConsoleCapture();
    capture.stop();
    capture.clear();
    console.log = originalConsole;
  });

  test('getConsoleCapture should return singleton instance', () => {
    const capture1 = getConsoleCapture();
    const capture2 = getConsoleCapture();
    expect(capture1).toBe(capture2);
  });

  test('startConsoleCapture should start the singleton', () => {
    const capture = startConsoleCapture();
    console.log('test');
    expect(capture.count).toBe(1);
  });

  test('startConsoleCapture should accept onLog callback', () => {
    const onLog = vi.fn();
    startConsoleCapture(onLog);
    console.log('test');
    expect(onLog).toHaveBeenCalledTimes(1);
  });
});
