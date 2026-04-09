/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CliFailure, CliRawOutput, CliSuccess } from './cli-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createSuccess<T>(data: T): CliSuccess<T> {
  return {
    ok: true,
    data,
  };
}

export function createRawOutput(value: unknown): CliRawOutput {
  return {
    __raw: true,
    value,
  };
}

export function createFailure(
  message: string,
  code = 'cli_error',
  details?: unknown,
): CliFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

export function writeJson(stream: NodeJS.WritableStream, value: unknown): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function isCliRawOutput(value: unknown): value is CliRawOutput {
  return isRecord(value) && value.__raw === true;
}

export function isCliFailure(value: unknown): value is CliFailure {
  return isRecord(value) && value.ok === false && isRecord(value.error);
}
