/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, Types } from '../ecs/index.js';
import { ExternalTexture, Mesh, Texture, Vector2 } from '../runtime/three.js';
import { DepthOccludable } from './depth-occludable.js';
import { DepthTextures } from './depth-textures.js';
import type { Shader, ShaderUniforms } from './types.js';

/**
 * DepthSensingSystem - Manages WebXR depth sensing and occlusion.
 *
 * @remarks
 * - Automatically retrieves and processes depth data from WebXR sessions.
 * - Supports both CPU-optimized and GPU-optimized depth sensing.
 * - Enables occlusion of virtual objects behind real-world surfaces.
 * - Requires WebXR session feature: 'depth-sensing'.
 * NOTE: The depth occlusion feature may not be compatible with custom shaders.
 *
 * @example Basic depth sensing setup
 * ```ts
 * // Configure world with depth sensing
 * World.create(document.getElementById('scene-container'), {
 *   xr: {
 *     sessionMode: SessionMode.ImmersiveAR,
 *     features: {
 *       depthSensing: { usage: 'gpu-optimized', format: 'float32' }
 *     },
 *   }
 * })
 *
 * // Add the depth sensing system
 * world.registerSystem(DepthSensingSystem)
 * ```
 *
 * @example Enable occlusion for an object
 * ```ts
 * const cube = world.createTransformEntity(cubeObject)
 * cube.addComponent(DepthOccludable) // Will be occluded by real-world geometry
 * ```
 *
 * @category Depth Sensing
 * @see {@link DepthOccludable}
 */
export class DepthSensingSystem extends createSystem(
  {
    occludables: { required: [DepthOccludable] },
  },
  {
    enableOcclusion: { type: Types.Boolean, default: true },
    enableDepthTexture: { type: Types.Boolean, default: true },
    useFloat32: { type: Types.Boolean, default: true },
    blurRadius: { type: Types.Float32, default: 20.0 },
  },
) {
  private depthFeatureEnabled: boolean | undefined;
  private isGPUOptimized = false;

  // Depth data storage
  cpuDepthData: XRCPUDepthInformation[] = [];
  gpuDepthData: XRWebGLDepthInformation[] = [];
  private depthTextures?: DepthTextures;

  // Occlusion
  private occludableShaders = new Set<ShaderUniforms>();
  private entityShaderMap = new Map<Entity, Set<ShaderUniforms>>();

  /**
   * Get the raw value to meters conversion factor.
   */
  get rawValueToMeters(): number {
    if (this.cpuDepthData.length) {
      return this.cpuDepthData[0].rawValueToMeters;
    } else if (this.gpuDepthData.length) {
      return this.gpuDepthData[0].rawValueToMeters;
    }
    return 0;
  }

  init(): void {
    this.xrManager.addEventListener('sessionstart', () => {
      this.updateEnabledFeatures(this.xrManager.getSession());
    });

    this.xrManager.addEventListener('sessionend', () => {
      this.cleanup();
    });

    // React to config changes
    this.config.enableDepthTexture.subscribe((enabled) => {
      if (enabled && !this.depthTextures) {
        this.initializeDepthTextures();
      }
    });

    this.queries.occludables.subscribe('qualify', (entity: Entity) => {
      this.attachOcclusionToEntity(entity);
    });
    this.queries.occludables.subscribe('disqualify', (entity: Entity) => {
      this.detachOcclusionFromEntity(entity);
    });
  }

  private initializeDepthTextures(): void {
    this.depthTextures = new DepthTextures(this.config.useFloat32.value);
  }

  /**
   * Injects inline depth occlusion shader code into all materials of an entity.
   */
  private attachOcclusionToEntity(entity: Entity): void {
    const object3D = entity.object3D;
    if (!object3D) return;

    const entityUniforms = new Set<ShaderUniforms>();
    this.entityShaderMap.set(entity, entityUniforms);

    object3D.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material) continue;
        material.transparent = true;
        const existingCallback = material.onBeforeCompile?.bind(material);
        material.onBeforeCompile = (shader: any, renderer: any) => {
          if (existingCallback) {
            existingCallback(shader, renderer);
          }
          // Only inject occlusion if not already present
          if (!shader.uniforms.occlusionEnabled) {
            DepthSensingSystem.addOcclusionToShader(
              shader,
              this.isGPUOptimized,
            );
          }
          material.userData.shader = shader;
          entityUniforms.add(shader.uniforms);
          this.occludableShaders.add(shader.uniforms);
        };
        material.needsUpdate = true;
      }
    });
  }

  private detachOcclusionFromEntity(entity: Entity): void {
    const entityUniforms = this.entityShaderMap.get(entity);
    if (entityUniforms) {
      for (const uniforms of entityUniforms) {
        this.occludableShaders.delete(uniforms);
      }
      this.entityShaderMap.delete(entity);
    }
  }

  /**
   * Modifies a material's shader in-place to incorporate inline depth-based
   * occlusion. Compares the virtual fragment's view-space depth against the
   * real-world depth from the XR depth texture.
   * @param shader - The shader object provided by onBeforeCompile.
   * @param isGPUOptimized - Whether the depth data uses GPU-optimized texture arrays.
   */
  private static addOcclusionToShader(
    shader: Shader,
    isGPUOptimized: boolean,
  ): void {
    shader.uniforms.occlusionEnabled = { value: false };
    shader.uniforms.uXRDepthTexture = { value: null };
    shader.uniforms.uXRDepthTextureArray = { value: null };
    shader.uniforms.uRawValueToMeters = { value: 0.001 };
    shader.uniforms.uIsTextureArray = { value: false };
    shader.uniforms.uDepthNear = { value: 0 };
    shader.uniforms.uViewportSize = { value: new Vector2() };
    shader.uniforms.uOcclusionBlurRadius = { value: 20.0 };

    shader.defines = {
      ...(shader.defines ?? {}),
      USE_UV: true,
    };
    if (isGPUOptimized) {
      shader.defines.USE_DEPTH_TEXTURE_ARRAY = '';
    }

    // Vertex shader: compute view-space depth for occlusion comparison
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        ['varying float vOcclusionViewDepth;', '#include <common>'].join('\n'),
      )
      .replace(
        '#include <fog_vertex>',
        [
          '#include <fog_vertex>',
          'vec4 occlusion_view_pos = modelViewMatrix * vec4(position, 1.0);',
          'vOcclusionViewDepth = -occlusion_view_pos.z;',
        ].join('\n'),
      );

    // Fragment shader: sample XR depth and compare against virtual depth
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform vec3 diffuse;',
        [
          'uniform vec3 diffuse;',
          'uniform bool occlusionEnabled;',
          'uniform sampler2D uXRDepthTexture;',
          'uniform float uRawValueToMeters;',
          'uniform bool uIsTextureArray;',
          'uniform float uDepthNear;',
          'uniform vec2 uViewportSize;',
          'uniform float uOcclusionBlurRadius;',
          'varying float vOcclusionViewDepth;',
          '',
          '#ifdef USE_DEPTH_TEXTURE_ARRAY',
          'uniform sampler2DArray uXRDepthTextureArray;',
          '#endif',
          '',
          'float OcclusionDepthGetMeters(in vec2 uv) {',
          '  #ifdef USE_DEPTH_TEXTURE_ARRAY',
          '  if (uIsTextureArray) {',
          '    float textureValue = texture(uXRDepthTextureArray, vec3(uv.x, uv.y, float(VIEW_ID))).r;',
          '    return uRawValueToMeters * uDepthNear / (1.0 - textureValue);',
          '  }',
          '  #endif',
          '  vec2 packedDepth = texture2D(uXRDepthTexture, uv).rg;',
          '  return packedDepth.r * uRawValueToMeters;',
          '}',
          '',
          'float OcclusionGetSample(in vec2 depthUV, in vec2 offset) {',
          '  float sampleDepth = OcclusionDepthGetMeters(depthUV + offset);',
          '  return smoothstep(0.0, 0.05, sampleDepth - vOcclusionViewDepth);',
          '}',
        ].join('\n'),
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        [
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'if (occlusionEnabled) {',
          '  vec2 screenUV = gl_FragCoord.xy / uViewportSize;',
          '  vec2 depthUV = uIsTextureArray ? screenUV : vec2(screenUV.x, 1.0 - screenUV.y);',
          '  vec2 texelSize = uOcclusionBlurRadius / uViewportSize;',
          '  // 13-tap two-ring sampling pattern for smooth occlusion edges',
          '  // Center sample',
          '  float occlusion_value = OcclusionGetSample(depthUV, vec2(0.0));',
          '  // Inner ring: 6 samples at 40% radius, 60 degree intervals',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.4,  0.0));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.2,  0.346));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2(-0.2,  0.346));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2(-0.4,  0.0));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2(-0.2, -0.346));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.2, -0.346));',
          '  // Outer ring: 6 samples at full radius, offset 30 degrees',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.866,  0.5));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.0,    1.0));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2(-0.866,  0.5));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2(-0.866, -0.5));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.0,   -1.0));',
          '  occlusion_value += OcclusionGetSample(depthUV, texelSize * vec2( 0.866, -0.5));',
          '  occlusion_value /= 13.0;',
          '  diffuseColor.a *= occlusion_value;',
          '}',
        ].join('\n'),
      );
  }

  private cleanup(): void {
    this.depthFeatureEnabled = undefined;
    this.isGPUOptimized = false;
    this.cpuDepthData = [];
    this.gpuDepthData = [];
  }

  private updateEnabledFeatures(xrSession: XRSession | null): void {
    if (!xrSession) {
      return;
    }

    const enabledFeatures = xrSession.enabledFeatures;
    this.depthFeatureEnabled = enabledFeatures?.includes('depth-sensing');
    this.isGPUOptimized = xrSession.depthUsage === 'gpu-optimized';

    if (!this.depthFeatureEnabled) {
      console.log(
        'Warning: depth-sensing feature not enabled for WebXR session. Depth sensing features are disabled.',
      );
    }
  }

  update(): void {
    if (!this.depthFeatureEnabled) {
      return;
    }

    const frame = this.xrFrame;
    if (frame) {
      this.updateLocalDepth(frame);
    }

    if (this.config.enableOcclusion.value) {
      this.updateOcclusionUniforms();
    }
  }

  /**
   * Updates depth data from the XR frame.
   */
  private updateLocalDepth(frame: XRFrame): void {
    const session = frame.session;
    const binding = this.renderer.xr.getBinding();

    const xrRefSpace = this.renderer.xr.getReferenceSpace();
    if (xrRefSpace) {
      const pose = frame.getViewerPose(xrRefSpace);
      if (pose) {
        for (let viewId = 0; viewId < pose.views.length; ++viewId) {
          const view = pose.views[viewId];

          if (session.depthUsage === 'gpu-optimized') {
            const depthData = binding.getDepthInformation(view);
            if (!depthData) {
              return;
            }
            this.updateGPUDepthData(depthData, viewId);
          } else {
            const depthData = frame.getDepthInformation(view);
            if (!depthData) {
              return;
            }
            this.updateCPUDepthData(depthData, viewId);
          }
        }
      }
    }
  }

  /**
   * Update with CPU-optimized depth data.
   */
  private updateCPUDepthData(
    depthData: XRCPUDepthInformation,
    viewId = 0,
  ): void {
    this.cpuDepthData[viewId] = depthData;

    if (this.config.enableDepthTexture.value && this.depthTextures) {
      this.depthTextures.updateData(depthData, viewId);
    }
  }

  /**
   * Update with GPU-optimized depth data.
   */
  private updateGPUDepthData(
    depthData: XRWebGLDepthInformation,
    viewId = 0,
  ): void {
    this.gpuDepthData[viewId] = depthData;

    if (this.config.enableDepthTexture.value && this.depthTextures) {
      this.depthTextures.updateNativeTexture(depthData, this.renderer, viewId);
    }
  }

  /**
   * Get the depth texture for a specific view.
   * @param viewId - The view index (0 for left eye, 1 for right eye).
   */
  getTexture(viewId: number): Texture | undefined {
    if (!this.config.enableDepthTexture.value) return undefined;
    return this.depthTextures?.get(viewId);
  }

  /**
   * Updates depth texture uniforms on all occludable materials each frame.
   */
  private updateOcclusionUniforms(): void {
    const leftDepth = this.getTexture(0);
    const rightDepth = this.getTexture(1);
    const isTextureArray =
      leftDepth instanceof ExternalTexture ||
      rightDepth instanceof ExternalTexture;
    const depthNear =
      (this.gpuDepthData[0] as unknown as { depthNear: number } | undefined)
        ?.depthNear ?? 0;

    const viewportSize = new Vector2();
    this.renderer.getDrawingBufferSize(viewportSize);

    for (const uniforms of this.occludableShaders) {
      if (leftDepth) {
        uniforms.uXRDepthTexture.value = leftDepth;
      }
      if (rightDepth) {
        uniforms.uXRDepthTextureArray.value = rightDepth;
      }
      uniforms.uRawValueToMeters.value = this.rawValueToMeters;
      uniforms.uIsTextureArray.value = isTextureArray;
      uniforms.uDepthNear.value = depthNear;
      (uniforms.uViewportSize.value as Vector2).copy(viewportSize);
      uniforms.uOcclusionBlurRadius.value = this.config.blurRadius.value;
      uniforms.occlusionEnabled.value = true;
    }
  }
}
