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
 * - Text: use setProperties({ text: '...' }) NOT children
 * - Colors: use numeric hex (0xRRGGBB) NOT string — strings silently fail in setProperties
 */
class EmergencyHUDSystem extends createSystem({
  hud: { required: [PanelUI, Follower, PanelDocument] },
}) {
  private smoothedYaw = 0;
  private lastGuidanceIndex = -1;
  private guidancePool = ['KEEP CALM', 'CRAWL LOW', 'FIND EXIT', 'CHECK OXYGEN'];
  private guidanceColors = [0x00FFC8, 0xFF3C00, 0xF39C12, 0x00FFC8];
  private simTemp = 94;
  private simSpo2 = 97.5;

  update(delta: number, time: number): void {
    this.queries.hud.entities.forEach((entity) => {
      const doc = PanelDocument.data.document[entity.index] as any;
      if (!doc) return;

      // ─── 1. REAL-TIME CLOCK  ───────────────────────────────────────────────
      // Use `text` property — NOT `children` — to update Text node content.
      const clock = doc.getElementById('clock-text');
      if (clock) {
        const now = new Date();
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const h = hours.toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        clock.setProperties({ text: `${h}:${m} ${ampm}` });
      }

      // ─── 2. COMPASS — smooth parallax via camera yaw ──────────────────────
      const compassPivoter = doc.getElementById('compass-pivoter');
      if (compassPivoter) {
        const targetYaw = this.camera.rotation.y;
        this.smoothedYaw += (targetYaw - this.smoothedYaw) * 0.15;
        // Full 360° = 1480px ribbon width; keep offset positive
        const pxPerRadian = 1480 / (Math.PI * 2);
        const raw = this.smoothedYaw * pxPerRadian;
        const offset = ((raw % 1480) + 1480) % 1480;
        compassPivoter.setProperties({ left: -offset });
      }

      // ─── 3. MAP ROTATION (IMU-driven) ─────────────────────────────────────
      const mapPivoter = doc.getElementById('map-pivoter');
      if (mapPivoter) {
        const deg = (-this.smoothedYaw * 180) / Math.PI;
        mapPivoter.setProperties({ transform: `rotate(${deg}deg)` });
      }

      // ─── 4. SEQUENTIAL GUIDANCE (every 4 s, colour-coded) ─────────────────
      const guidanceEl = doc.getElementById('guidance-text');
      if (guidanceEl) {
        const idx = Math.floor(time / 4) % this.guidancePool.length;
        if (idx !== this.lastGuidanceIndex) {
          this.lastGuidanceIndex = idx;
          guidanceEl.setProperties({
            text: this.guidancePool[idx],
            color: this.guidanceColors[idx],
          });
        }
      }

      // ─── 5. VITALS + SENSORS  (100 ms snappy gate) ────────────────────────
      if (Math.floor(time * 10) > Math.floor((time - delta) * 10)) {

        // BPM — slower wave (4 s period), gentle jitter
        const bpm = Math.round(
          88 + Math.sin(time * (Math.PI * 2 / 4)) * 10
             + Math.sin(time * 11.3) * 1.5,
        );

        // SpO2 — stochastic drift 94-99
        this.simSpo2 += (Math.random() - 0.5) * 0.08;
        this.simSpo2 += (96.5 + Math.sin(time * (Math.PI * 2 / 3)) * 2.5 - this.simSpo2) * 0.08;
        this.simSpo2 = Math.max(94, Math.min(99, this.simSpo2));
        const spo2 = Math.round(this.simSpo2);

        // Temp — incremental climb (fire proximity), 0.4 °F/s
        this.simTemp = Math.min(180, this.simTemp + 0.4 * delta);
        const tempDisplay = Math.round(this.simTemp + Math.sin(time * 47.3) * 0.5);

        // ── Update text (use numeric hex for colors) ──
        const bpmEl = doc.getElementById('ui_element_bpm');
        if (bpmEl) bpmEl.setProperties({ text: `${bpm} BPM` });

        const spo2El = doc.getElementById('ui_element_spo2');
        if (spo2El) spo2El.setProperties({ text: `${Math.round(this.simSpo2)}%` });

        // Heart icon pulse at ~BPM rate
        const heartIcon = doc.getElementById('heart-icon');
        if (heartIcon) {
          heartIcon.setProperties({ opacity: 0.5 + Math.abs(Math.sin(time * Math.PI * 1.33)) * 0.5 });
        }

        const tempEl = doc.getElementById('temp-value');
        if (tempEl) {
          tempEl.setProperties({
            text: `${Math.round(this.simTemp)}°F`,
            color: this.simTemp > 120 ? 0xFF3C00 : 0x00FFC8,
          });
        }

        // ─── 7. THREAT METER V2 — smooth fill & color shift ────────────────
        // Fill level: layered sines → natural random-looking rise/fall
        const fillLevel = Math.max(0, Math.min(1,
          0.5
          + Math.sin(time * 0.4) * 0.3
          + Math.sin(time * 1.1) * 0.15
          + Math.sin(time * 2.7) * 0.05,
        ));
        
        // ─── 7. THERMAL GAUGE (THREAT V3) — 20-segment non-linear gradient ──
        const segsToFill = Math.ceil(fillLevel * 20);
        const palette = [
          0x800020, 0x800020, 0x800020, 0x800020, 0x800020, // 0-4: Burgundy
          0xFF3C00, 0xFF3C00, 0xFF3C00, 0xFF3C00,           // 5-8: Red
          0xF39C12, 0xFFA500, 0xFFFF00, 0xFFA500,           // 9-12: Orange/Yellow
          0xFF3C00, 0xFF3C00, 0xFF3C00, 0xFF3C00,           // 13-16: Red
          0x5C4033, 0x5C4033, 0x5C4033                      // 17-19: Dark Red
        ];

        for (let i = 0; i < 20; i++) {
          const seg = doc.getElementById(`t-seg-${i}`);
          if (!seg) continue;

          if (i < segsToFill) {
            const color = palette[i];
            seg.setProperties({
              backgroundColor: color,
              boxShadow: `0px 0px 8px ${color.toString(16).padStart(6, '0')}`,
              opacity: 1.0
            });
          } else {
            seg.setProperties({
              backgroundColor: 0x222222,
              boxShadow: 'none',
              opacity: 0.1
            });
          }
        }
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
      config: '/public/ui/welcome.json',
      maxWidth: 1.8,
      maxHeight: 1.0,
    })
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
      config: '/public/ui/settings.json',
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
      config: '/public/ui/hud.json',
      maxWidth: 1.5,
      maxHeight: 1.0,
    })
    .addComponent(Follower, {
      target: world.camera,
      offsetPosition: [0, -0.01, -0.5], // Moved further back for testing visibility
      behavior: FollowBehavior.FaceTarget,
      speed: 20,
      tolerance: 0,
    });

  world
    .registerSystem(SettingsSystem)
    .registerSystem(ElevatorSystem)
    .registerSystem(FollowSystem)
    .registerSystem(EmergencyHUDSystem);
});
