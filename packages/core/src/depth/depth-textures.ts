/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  DataTexture,
  ExternalTexture,
  FloatType,
  RedFormat,
  RGFormat,
  Texture,
  UnsignedByteType,
  WebGLRenderer,
} from '../runtime/three.js';
/**
 * Manages depth textures from WebXR depth sensing.
 * Supports both CPU-optimized (DataTexture) and GPU-optimized (ExternalTexture) depth data.
 */
export class DepthTextures {
  private float32Arrays: Float32Array[] = [];
  private uint8Arrays: Uint8Array[] = [];
  private dataTextures: DataTexture[] = [];
  private nativeTextures: ExternalTexture[] = [];

  constructor(private useFloat32: boolean) {}

  private createDataDepthTextures(
    depthData: XRCPUDepthInformation,
    viewId: number,
  ): void {
    if (this.dataTextures[viewId]) {
      this.dataTextures[viewId].dispose();
    }
    if (this.useFloat32) {
      const typedArray = new Float32Array(depthData.width * depthData.height);
      const format = RedFormat;
      const type = FloatType;
      this.float32Arrays[viewId] = typedArray;
      this.dataTextures[viewId] = new DataTexture(
        typedArray,
        depthData.width,
        depthData.height,
        format,
        type,
      );
    } else {
      const typedArray = new Uint8Array(depthData.width * depthData.height * 2);
      const format = RGFormat;
      const type = UnsignedByteType;
      this.uint8Arrays[viewId] = typedArray;
      this.dataTextures[viewId] = new DataTexture(
        typedArray,
        depthData.width,
        depthData.height,
        format,
        type,
      );
    }
  }

  /**
   * Update the depth texture with new CPU depth data.
   * @param depthData - The CPU depth information from WebXR.
   * @param viewId - The view index (0 for left eye, 1 for right eye).
   */
  updateData(depthData: XRCPUDepthInformation, viewId: number): void {
    if (
      this.dataTextures.length < viewId + 1 ||
      this.dataTextures[viewId].image.width !== depthData.width ||
      this.dataTextures[viewId].image.height !== depthData.height
    ) {
      this.createDataDepthTextures(depthData, viewId);
    }
    if (this.useFloat32) {
      this.float32Arrays[viewId].set(new Float32Array(depthData.data));
    } else {
      this.uint8Arrays[viewId].set(new Uint8Array(depthData.data));
    }
    this.dataTextures[viewId].needsUpdate = true;
  }

  /**
   * Update the depth texture with native GPU texture from WebXR.
   * @param depthData - The GPU depth information from WebXR.
   * @param renderer - The WebGL renderer.
   * @param viewId - The view index (0 for left eye, 1 for right eye).
   */
  updateNativeTexture(
    depthData: XRWebGLDepthInformation,
    renderer: WebGLRenderer,
    viewId: number,
  ): void {
    if (this.dataTextures.length < viewId + 1) {
      this.nativeTextures[viewId] = new ExternalTexture(depthData.texture);
    } else {
      this.nativeTextures[viewId].sourceTexture = depthData.texture;
    }
    // Update the texture properties for three.js
    const textureProperties = renderer.properties.get(
      this.nativeTextures[viewId],
    ) as {
      __webglTexture: WebGLTexture;
      __version: number;
    };
    textureProperties.__webglTexture = depthData.texture;
    textureProperties.__version = 1;
  }

  /**
   * Get the depth texture for a specific view.
   * @param viewId - The view index (0 for left eye, 1 for right eye).
   * @returns The depth texture, or undefined if not available.
   */
  get(viewId: number): Texture | undefined {
    if (this.dataTextures.length > 0) {
      return this.dataTextures[viewId];
    }

    return this.nativeTextures[viewId];
  }

  /**
   * Dispose of all depth textures.
   */
  dispose(): void {
    this.dataTextures.forEach((texture) => texture.dispose());
    this.dataTextures = [];
    this.nativeTextures = [];
    this.float32Arrays = [];
    this.uint8Arrays = [];
  }
}
