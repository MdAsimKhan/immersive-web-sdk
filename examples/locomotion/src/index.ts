import {
  AssetManager,
  AssetManifest,
  AssetType,
  EnvironmentType,
  Follower,
  FollowBehavior,
  FollowSystem,
  LocomotionEnvironment,
  PanelUI,
  PanelDocument,
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  World,
  createSystem,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { LogInIcon, RectangleGogglesIcon } from '@pmndrs/uikit-lucide';
import { Elevator, ElevatorSystem } from './elevator.js';
import { SettingsSystem } from './panel.js';

const assets: AssetManifest = {
  switchSound: {
    url: './audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  environmentDesk: {
    url: './gltf/environmentDesk/environmentDesk.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

/**
 * System to drive the Emergency First Responder HUD.
 * Handles compass tracking, vitals simulation, and telemetry updates.
 */
class EmergencyHUDSystem extends createSystem({
  hud: { required: [PanelUI, Follower, PanelDocument] },
}) {
  update(delta: number, time: number): void {
    this.queries.hud.entities.forEach((entity) => {
      const config = PanelUI.data.config[entity.index];
      if (!config || !config.includes('hud.json')) {
        return;
      }

      const doc = PanelDocument.data.document[entity.index] as any;
      if (!doc) {
        return;
      }

      // 1. Simulate Compass based on head orientation
      const compassPivoter = doc.getElementById('compass-pivoter');
      if (compassPivoter) {
        const rotationY = this.camera.rotation.y;
        const pixelsPerRadian = 300 / (Math.PI / 2);
        const offset = (rotationY * pixelsPerRadian) % 1200;
        compassPivoter.setProperties({ left: -offset - 100 });
      }

      // 2. Simulate Vitals and Sensor Readings (every second)
      if (Math.floor(time) > Math.floor(time - delta)) {
        const hr = doc.getElementById('hr-value');
        if (hr) {
          hr.setProperties({
            children: [`HR: ${105 + Math.floor(Math.random() * 10)}`],
          });
        }

        const exit = doc.getElementById('exit-info');
        if (exit) {
          const dist = 12 - (time % 12);
          exit.setProperties({
            children: [
              `EXIT: ${dist.toFixed(1)}m (${Math.floor(dist * 3.3)}s)`,
            ],
          });
        }

        const threat = doc.getElementById('threat-fill');
        if (threat) {
          const level = 40 + Math.sin(time * 0.5) * 20;
          threat.setProperties({
            height: `${level}%`,
            backgroundColor: level > 50 ? 0xff5f1f : 0x39ff14,
          });
        }
      }

      // 3. Telemetry tracking
      const vel = doc.getElementById('vel-text');
      if (vel) {
        const speed = Math.sin(time) > 0 ? Math.sin(time) * 2 : 0;
        vel.setProperties({ children: [`VEL: ${speed.toFixed(1)} m/s`] });
      }

      const coords = doc.getElementById('coords-text');
      if (coords) {
        const pos = this.camera.position;
        coords.setProperties({
          children: [
            `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
          ],
        });
      }
    });
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  render: {
    near: 0.001,
    far: 300,
  },
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: {
      handTracking: { required: true },
    },
  },
  features: {
    grabbing: true,
    locomotion: true,
    spatialUI: {
      kits: [horizonKit, { LogInIcon, RectangleGogglesIcon }],
    },
  },
}).then((world) => {
  const { camera } = world;
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  // Static environment floor
  const { scene: envMesh } = AssetManager.getGLTF('environmentDesk')!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.107, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Elevator platform (cloned from same GLTF)
  const elevatorMesh = envMesh.clone();
  elevatorMesh.rotation.set(0, 0, 0);
  elevatorMesh.position.set(13, 0, -7.5);
  world
    .createTransformEntity(elevatorMesh)
    .addComponent(Elevator, { speed: 0.5, deltaY: 4 })
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.KINEMATIC });

  // Welcome panel (screen-space)
  world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxWidth: 1.8,
      maxHeight: 1.0,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
      right: 'auto',
      bottom: 'auto',
      width: 'auto',
      zOffset: 0.2,
    });

  // Settings panel (in-world)
  const settingsPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/settings.json',
      maxWidth: 1.8,
      maxHeight: 1.0,
    })
    .addComponent(RayInteractable);
  settingsPanel.object3D!.position.set(0, 1.182, 1.856);
  settingsPanel.object3D!.rotateY(Math.PI);

  // Iron Man / Emergency HUD (camera-tracked)
  world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/hud.json',
      maxWidth: 1.0,
      maxHeight: 1.0,
    })
    .addComponent(Follower, {
      target: world.camera,
      offsetPosition: [0, 0, -0.3], // Locked in front of camera
      behavior: FollowBehavior.FaceTarget,
      speed: 20, // Very fast to minimize lag
      tolerance: 0,
    });

  world
    .registerSystem(SettingsSystem)
    .registerSystem(ElevatorSystem)
    .registerSystem(FollowSystem)
    .registerSystem(EmergencyHUDSystem);
});
