/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IUniform } from '../runtime/three.js';

/**
 * Shader uniform map type used for depth and occlusion rendering.
 */
export type ShaderUniforms = { [uniform: string]: IUniform };

/**
 * Shader object with uniforms, defines, and shader source.
 */
export interface Shader {
  uniforms: ShaderUniforms;
  defines?: { [key: string]: unknown };
  vertexShader: string;
  fragmentShader: string;
}
