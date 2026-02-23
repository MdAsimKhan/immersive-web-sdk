/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent } from '../ecs/index.js';

/**
 * Component for entities that should be occluded by real-world depth.
 * Add this component to entities that should be hidden when behind real-world surfaces.
 * NOTE: The depth occlusion feature may not be compatible with custom shaders.
 *
 * @example
 * ```ts
 * // Create an entity with occlusion enabled
 * const entity = world.createTransformEntity(mesh);
 * entity.addComponent(DepthOccludable);
 * ```
 *
 * @category Depth Sensing
 */
export const DepthOccludable = createComponent(
  'DepthOccludable',
  {},
  'Entity that can be occluded by real-world depth',
);
