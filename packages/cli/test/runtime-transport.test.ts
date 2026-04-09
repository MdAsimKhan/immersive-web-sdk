/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import net from 'net';
import { describe, expect, test } from 'vitest';
import { sendRuntimeCommand } from '../src/runtime-transport.js';

describe('runtime command transport', () => {
  test('uses one timeout budget across the WSS to WS fallback path', async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => {
        sockets.delete(socket);
      });
      socket.on('error', () => {});
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const startedAt = Date.now();

    try {
      await expect(
        sendRuntimeCommand({
          port,
          method: 'never_responds',
          timeoutMs: 2000,
        }),
      ).rejects.toThrow();
    } finally {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(3200);
  });
});
