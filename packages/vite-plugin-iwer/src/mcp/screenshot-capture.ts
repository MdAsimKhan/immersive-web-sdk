/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Patch HTMLCanvasElement.getContext to force preserveDrawingBuffer: true
 * on all WebGL contexts. This ensures buffer content is always readable
 * for screenshots (canvas.toDataURL / gl.readPixels).
 *
 * Call this BEFORE any app code creates a WebGL context. On tile-based
 * GPUs (Quest / Adreno) this prevents the driver from discarding the
 * framebuffer after compositing — there is a small perf cost, which is
 * why this patch is only applied when MCP is enabled.
 */
export function patchGetContext(): void {
  if (typeof HTMLCanvasElement === 'undefined') {
    return; // Not in browser environment
  }

  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  // Check if already patched
  if ((originalGetContext as any).__iwer_patched) {
    return;
  }

  HTMLCanvasElement.prototype.getContext = function (
    contextId: string,
    options?: any,
  ): RenderingContext | null {
    // For WebGL contexts, force preserveDrawingBuffer: true
    if (contextId === 'webgl' || contextId === 'webgl2') {
      const modifiedOptions = {
        ...options,
        preserveDrawingBuffer: true,
      };

      return originalGetContext.call(this, contextId, modifiedOptions);
    }

    // For other contexts, pass through unchanged
    return originalGetContext.call(this, contextId, options);
  } as typeof HTMLCanvasElement.prototype.getContext;

  // Mark as patched to prevent double-patching
  (HTMLCanvasElement.prototype.getContext as any).__iwer_patched = true;

  console.debug('[IWER] WebGL preserveDrawingBuffer patch applied');
}
