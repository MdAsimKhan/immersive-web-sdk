/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  XRAnchor,
  AssetType,
  Color,
  XRMesh,
  XRPlane,
  SessionMode,
  World,
  createSystem,
  Interactable,
  DistanceGrabbable,
  IBLTexture,
  DomeTexture,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  FrontSide,
  MovementMode,
  Vector3,
  ReferenceSpaceType,
  eq,
} from '@iwsdk/core';

export class SceneShowSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
  meshEntities: {
    required: [XRMesh],
    where: [eq(XRMesh, 'isBounded3D', true)],
  },
}) {
  init() {
    this.worldRotation = new Vector3();
    this.anchoredMesh = new Mesh(
      new SphereGeometry(0.2),
      new MeshStandardMaterial({
        side: FrontSide,
        color: new Color(Math.random(), Math.random(), Math.random()),
      }),
    );
    this.anchoredMesh.position.set(0, 1, -1);
    this.scene.add(this.anchoredMesh);
    const anchoredEntity = this.world.createTransformEntity(this.anchoredMesh);
    anchoredEntity.addComponent(Interactable);
    anchoredEntity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    anchoredEntity.addComponent(XRAnchor);

    this.queries.planeEntities.subscribe('qualify', (planeEntity) => {
      if (!planeEntity.hasComponent(Interactable)) {
        console.log(
          'SceneShowSystem configure + planeEntity ' + planeEntity.index,
        );
        planeEntity.object3D.visible = false;
        planeEntity.addComponent(Interactable);
        planeEntity.object3D.addEventListener('pointerenter', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = true;
          }
        });
        planeEntity.object3D.addEventListener('pointerleave', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = false;
          }
        });
      }
    });

    this.queries.meshEntities.subscribe('qualify', (meshEntity) => {
      if (!meshEntity.hasComponent(Interactable)) {
        meshEntity.addComponent(Interactable);
        meshEntity.object3D.visible = false;
        meshEntity.object3D.addEventListener('pointerenter', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = true;
          }
        });
        meshEntity.object3D.addEventListener('pointerleave', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = false;
          }
        });
      }
    });
  }
}

World.create(document.getElementById('scene-container'), {
  assets: {
    veniceSunset: {
      url: './textures/venice_sunset_1k.exr',
      type: AssetType.HDRTexture,
      priority: 'critical',
    },
  },
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      hitTest: { required: true },
      planeDetection: { required: true },
      meshDetection: { required: true },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
  features: {
    grabbing: true,
    sceneUnderstanding: true,
  },
}).then((world) => {
  const { scene } = world;

  scene.background = new Color(0x808080);

  const root = world.activeLevel.value;
  root.addComponent(IBLTexture, { src: 'veniceSunset' });
  root.addComponent(DomeTexture, { src: 'veniceSunset' });

  world.registerSystem(SceneShowSystem);
});
