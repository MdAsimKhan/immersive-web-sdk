---
name: test-ecs-core
description: Automated test for ECS core functionality (system registration, component schemas, Transform sync, Visibility, pause/step/resume, system toggle). Targets any running example (default poke). Uses dynamic entity discovery — no hardcoded indices.
argument-hint: [--suite systems|components|transform|visibility|lifecycle|all]
---

# ECS Core Test

**Target Example:** `examples/poke` (or any running example)

Automated test suite for verifying ECS system registration, component schemas, Transform sync, Visibility, and ECS lifecycle (pause/step/resume) using the IWER MCP emulator tools.

Run all suites in order. Report a summary table at the end with pass/fail per suite.

## Server Lifecycle

### Start the dev server (if not already running)

```bash
cd examples/poke && npm run dev &
```

Wait for port 8081 to be ready:
```bash
for i in $(seq 1 30); do lsof -i :8081 -sTCP:LISTEN > /dev/null 2>&1 && break; sleep 1; done
```

### At the end of all tests, kill the dev server

```bash
kill $(lsof -t -i :8081) 2>/dev/null
```

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

---

## Test Suites

### Suite 1: System Registration

**What we're testing**: All expected systems are registered with correct priorities and config keys.

#### Test 1.1: List All Systems

```
mcp__iwsdk-dev-mcp__ecs_list_systems
```

**Assert** — Framework systems present with priorities:

| System | Priority | Required Config Keys |
|--------|----------|---------------------|
| `LocomotionSystem` | -5 | `useWorker`, `slidingSpeed`, `turningMethod`, `enableJumping`, ... |
| `InputSystem` | -4 | (none) |
| `GrabSystem` | -3 | `useHandPinchForGrab` |
| `TransformSystem` | 0 | (none) |
| `VisibilitySystem` | 0 | (none) |
| `EnvironmentSystem` | 0 | (none) |
| `LevelSystem` | 0 | `defaultLighting` |
| `AudioSystem` | 0 | `enableDistanceCulling`, `cullingDistanceMultiplier` |
| `PanelUISystem` | 0 | `forwardHtmlEvents`, `kits`, `preferredColorScheme` |

**Note**: Systems with priority < 0 run first. Among priority-0 systems, order is determined by registration order.

#### Test 1.2: Verify Query Entity Counts

```
InputSystem.entityCounts:
  rayInteractables: ≥ 1
  pokeInteractables: ≥ 1
TransformSystem.entityCounts:
  transform: ≥ 5 (all entities have Transform)
LevelSystem.entityCounts:
  levelEntities: ≥ 4 (all non-persistent entities have LevelTag)
```

---

### Suite 2: Component Registration

**What we're testing**: All expected components are registered with correct field schemas.

#### Test 2.1: List All Components

```
mcp__iwsdk-dev-mcp__ecs_list_components
```

**Assert** — key components present with expected fields:

| Component | Key Fields |
|-----------|-----------|
| `Transform` | `position` (Vec3), `orientation` (Vec4), `scale` (Vec3), `parent` (Entity) |
| `Visibility` | `isVisible` (Boolean, default: true) |
| `LevelRoot` | (no fields — marker) |
| `LevelTag` | `id` (String) |
| `DomeGradient` | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32) |
| `IBLGradient` | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32) |
| `PanelUI` | `config` (String), `maxWidth` (Float32), `maxHeight` (Float32) |
| `AudioSource` | `src` (FilePath), `volume` (Float32), `_isPlaying` (Boolean), `_loaded` (Boolean) |

#### Test 2.2: Transform Default Values

```
Transform fields:
  position default: [NaN, NaN, NaN]  — preserves Object3D's existing value
  orientation default: [NaN, NaN, NaN, NaN]
  scale default: [NaN, NaN, NaN]
  parent default: undefined
```

---

### Suite 3: Transform Sync (ECS ↔ Object3D)

**What we're testing**: Modifying Transform component values via ECS immediately updates the Object3D in Three.js (zero-copy sync).

#### Test 3.1: Modify Transform Position

1. Find an entity with a Transform component:
   `mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelTag"])` → pick the first entity
2. Get its Object3D UUID from `mcp__iwsdk-dev-mcp__scene_get_hierarchy(maxDepth: 3)` — find the node matching the entity index.
3. Record initial position:
   `mcp__iwsdk-dev-mcp__scene_get_object_transform(uuid: "<entity-uuid>")` → note localPosition
4. Change position via ECS:
   `mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <N>, componentId: "Transform", field: "position", value: "[0, 2, -1]")`
5. Verify Object3D moved:
   `mcp__iwsdk-dev-mcp__scene_get_object_transform(uuid: "<entity-uuid>")` → localPosition must be [0, 2, -1]

**Assert**: The Object3D's `localPosition` matches the value set via `ecs_set_component`.

---

### Suite 4: ECS Pause / Step / Resume

#### Test 4.1: Pause

```
mcp__iwsdk-dev-mcp__ecs_pause
→ { paused: true, frame: <N>, systemCount: ≥ 12 }
```

#### Test 4.2: Step

```
mcp__iwsdk-dev-mcp__ecs_step(count: 5)
→ { framesAdvanced: 5, totalFrame: <N+5> }
```

#### Test 4.3: Resume

```
mcp__iwsdk-dev-mcp__ecs_resume
→ { paused: false, framesWhilePaused: <N> }
```

---

### Suite 5: System Toggle

#### Test 5.1: Pause a System

```
mcp__iwsdk-dev-mcp__ecs_toggle_system(name: "GrabSystem", paused: true)
→ { name: "GrabSystem", isPaused: true }
```

#### Test 5.2: Resume a System

```
mcp__iwsdk-dev-mcp__ecs_toggle_system(name: "GrabSystem", paused: false)
→ { name: "GrabSystem", isPaused: false }
```

---

### Suite 6: Entity Discovery

#### Test 6.1: Find by Component

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelRoot"])
→ Exactly 1 entity (the level root)

mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["Transform"])
→ All entities (every entity has Transform)

mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelTag"])
→ All non-persistent entities
```

#### Test 6.2: Find by Name Pattern

```
mcp__iwsdk-dev-mcp__ecs_find_entities(namePattern: "LevelRoot")
→ Matches entity with name "LevelRoot"
```

#### Test 6.3: Exclude Components

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["Transform"], withoutComponents: ["LevelTag"])
→ Only persistent entities (scene root entity 0)
```

---

### Suite 7: Snapshot & Diff

#### Test 7.1: Snapshot

```
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "baseline")
→ { label: "baseline", entityCount: ≥ 5, componentCount: ≥ 20 }
```

#### Test 7.2: Modify and Diff

1. Find an entity with `LevelTag` via `ecs_find_entities(withComponents: ["LevelTag"])`. Use its `entityIndex`.
2. Modify its Transform:
   `mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <found>, componentId: "Transform", field: "position", value: "[1, 1, 1]")`
3. Snapshot and diff:
   ```
   mcp__iwsdk-dev-mcp__ecs_snapshot(label: "modified")
   mcp__iwsdk-dev-mcp__ecs_diff(from: "baseline", to: "modified")
   → Shows entity's Transform.position changed to [1, 1, 1]
   ```

---

### Suite 8: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"])
→ Must return empty
```

---

## Results Summary

```
| Suite                    | Result    |
|--------------------------|-----------|
| 1. System Registration   | PASS/FAIL |
| 2. Component Registration| PASS/FAIL |
| 3. Transform Sync        | PASS/FAIL |
| 4. Pause/Step/Resume     | PASS/FAIL |
| 5. System Toggle         | PASS/FAIL |
| 6. Entity Discovery      | PASS/FAIL |
| 7. Snapshot & Diff       | PASS/FAIL |
| 8. Stability             | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### Transform NaN defaults
Transform fields default to `[NaN, NaN, NaN]` — this is by design. When an entity has an Object3D with existing transforms, adding the Transform component preserves those values. The NaN sentinel means "don't overwrite".

### UUIDs change on reload
Three.js Object3D UUIDs are regenerated on every page reload. Always call `scene_get_hierarchy` after reload to get fresh UUIDs.

### ecs_step timeout
`ecs_step` has a 5-second timeout per step. If the render loop is inactive (e.g., tab not focused), steps may fail.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.

## Architecture Notes

### System Priority Ordering
Lower priority numbers run first. Framework systems use negative priorities (-5 to -1) to ensure they run before user systems (priority 0+).

### Transform Zero-Copy Sync
The Transform component replaces `Object3D.position`, `Object3D.quaternion`, and `Object3D.scale` with `SyncedVector3`/`SyncedQuaternion` instances that read/write directly from the ECS `Float32Array` storage.

### ECS Pause vs System Toggle
- `ecs_pause`: Stops ALL systems, render loop continues for screenshots
- `ecs_toggle_system`: Stops ONE system, all others keep running
- `ecs_step`: Only works while globally paused, advances N frames with fixed delta
