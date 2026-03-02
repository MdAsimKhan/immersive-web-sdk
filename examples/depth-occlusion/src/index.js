/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  AssetType,
  BoxGeometry,
  CylinderGeometry,
  Color,
  createSystem,
  DepthOccludable,
  OcclusionShadersMode,
  DepthSensingSystem,
  DistanceGrabbable,
  Interactable,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  ReferenceSpaceType,
  SessionMode,
  SphereGeometry,
  Vector3,
  World,
  XRAnchor,
} from '@iwsdk/core';

/**
 * Demo system that creates occludable objects and configures occlusion materials.
 * Virtual objects will be hidden when they pass behind real-world surfaces.
 */
export class OcclusionDemoSystem extends createSystem({
  occludables: { required: [DepthOccludable] },
}) {
  init() {
    // Create several occludable objects at different positions
    this.createOccludableSphere(new Vector3(0, 0.8, -0.8), 0xff4444);
    this.createHardModeOccludableCube(new Vector3(-0.4, 0.8, -0.6), 0x44ff44);
    this.createNonOccludableCylinder(new Vector3(0.4, 0.8, -0.6), 0x4444ff);
    this.createOccludablePlant(new Vector3(-0.6, 0, -1.0));
    this.createOccludableRobot(new Vector3(0.6, 0, -1.0));
  }

  /**
   * Creates an occludable sphere with depth occlusion support.
   */
  createOccludableSphere(position, color, radius = 0.5) {
    const geometry = new SphereGeometry(radius);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable);

    return entity;
  }

  /**
   * Creates an occludable cube with depth occlusion support.
   */
  createHardModeOccludableCube(position, color, size = 0.25) {
    const geometry = new BoxGeometry(size, size, size);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable, {
      mode: OcclusionShadersMode.HardOcclusion,
    });

    return entity;
  }

  /**
   * Creates an occludable cylinder with depth occlusion support.
   */
  createNonOccludableCylinder(position, color, radius = 0.05, height = 0.2) {
    const geometry = new CylinderGeometry(radius, radius, height, 32);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    return entity;
  }

  /**
   * Creates an occludable plant using a GLTF model.
   */
  createOccludablePlant(position) {
    const { scene: plantMesh } = AssetManager.getGLTF('plantSansevieria');
    plantMesh.position.copy(position);
    this.scene.add(plantMesh);

    const entity = this.world.createTransformEntity(plantMesh);
    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable);

    return entity;
  }

  /**
   * Creates an occludable robot using a GLTF model.
   */
  createOccludableRobot(position) {
    const { scene: robotMesh } = AssetManager.getGLTF('robot');
    robotMesh.position.copy(position);
    this.scene.add(robotMesh);

    const entity = this.world.createTransformEntity(robotMesh);
    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable);

    return entity;
  }

  update() {
    // Animate the objects slightly to make them more visually interesting
    const time = performance.now() * 0.001;
    for (const entity of this.queries.occludables.entities) {
      if (entity.object3D) {
        entity.object3D.rotation.y = time * 0.5;
        entity.object3D.rotation.x = Math.sin(time * 0.3) * 0.2;
      }
    }
  }
}

const assets = {
  robot: {
    url: '/gltf/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  plantSansevieria: {
    url: '/gltf/plantSansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

// Create the world with depth sensing and AR configuration
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      // Enable depth sensing with GPU optimization and float32 format
      depthSensing: {
        required: true,
        usage: 'gpu-optimized',
        format: 'float32',
      },
      hitTest: { required: true },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
  features: {
    grabbing: true,
  },
}).then((world) => {
  const { scene, camera } = world;

  // Set transparent background for AR
  scene.background = null;

  // Position camera
  camera.position.set(0, 1.6, 0);

  // Register the depth sensing system with occlusion enabled
  world
    .registerSystem(DepthSensingSystem, {
      configData: {
        enableDepthTexture: true,
        enableOcclusion: true,
        useFloat32: true,
        blurRadius: 20.0,
      },
    })
    .registerComponent(DepthOccludable);

  // Register the demo system
  world.registerSystem(OcclusionDemoSystem);

  console.log('Depth Occlusion Demo initialized');
  console.log('Virtual objects will be hidden when behind real-world surfaces');
});
