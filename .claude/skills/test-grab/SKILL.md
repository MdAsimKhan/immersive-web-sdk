---
name: test-grab
description: Automated end-to-end test for the grab system (distance grab, one-hand grab, two-hand grab). Targets the grab example. Uses dynamic entity discovery — no hardcoded positions or indices. All three grab types exist in the GLXF level.
argument-hint: [--suite distance|onehand|twohand|all]
---

# Grab System Test

**Target Example:** `examples/grab`

Automated test suite for verifying distance grab, one-hand grab, and two-hand grab using the IWER MCP emulator tools.

Run all suites in order. Report a summary table at the end with pass/fail per suite.

## Server Lifecycle

### Start the dev server (if not already running)

```bash
cd examples/grab && npm run dev &
```

Wait for port 8081 to be ready:
```bash
for i in $(seq 1 30); do lsof -i :8081 -sTCP:LISTEN > /dev/null 2>&1 && break; sleep 1; done
```

### At the end of all tests, kill the dev server

```bash
kill $(lsof -t -i :8081) 2>/dev/null
```

## About the Grab Example

The grab example uses a GLXF-based level (`./glxf/Composition.glxf`) with `grabbing: { useHandPinchForGrab: true }`. All grab entities are defined in the GLXF composition — no code modification needed. Use `ecs_find_entities` to discover entities dynamically by their grab component type.

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

### Entity Discovery

Discover all grab entities dynamically:

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["DistanceGrabbable"])
→ At least 1 entity. Save first as <distance>.

mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["OneHandGrabbable"])
→ At least 1 entity. Save first as <onehand>.

mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["TwoHandsGrabbable"])
→ At least 1 entity. Save first as <twohand>.
```

Get entity positions via scene hierarchy:
```
mcp__iwsdk-dev-mcp__scene_get_hierarchy(maxDepth: 3)
```
Find Object3D UUIDs for each grab entity, then:
```
mcp__iwsdk-dev-mcp__scene_get_object_transform(uuid: "<entity-uuid>")
```
Save `positionRelativeToXROrigin` as `<distance-pos>`, `<onehand-pos>`, `<twohand-pos>`.

Verify GrabSystem is active:
```
mcp__iwsdk-dev-mcp__ecs_list_systems → GrabSystem at priority -3
```

---

## Component Reference

| Component | Pointer Type | Activation |
|-----------|-------------|------------|
| `DistanceGrabbable` | Ray (trigger) | `xr_set_select_value` |
| `OneHandGrabbable` | Grip sphere (squeeze) | `xr_set_gamepad_state` button 1 |
| `TwoHandsGrabbable` | Grip sphere (squeeze) | `xr_set_gamepad_state` button 1, both hands |

### Critical Distinction: Trigger vs Squeeze

| Grab Type | Button | How to Activate |
|-----------|--------|----------------|
| Distance grab | Trigger (select) | `mcp__iwsdk-dev-mcp__xr_set_select_value(device, value: 1)` |
| One-hand grab | Squeeze (button 1) | `mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device, buttons: [{index: 1, value: 1, touched: true}])` |
| Two-hand grab | Squeeze (button 1) on BOTH | Same as one-hand, on both controllers |

---

## Test Suites

### Suite 1: Distance Grab (Ray + Trigger)

**What we're testing**: Ray-based distance grab using trigger/select.

#### Test 1.1: Ray Hover

**Action**: Point controller at the distance-grabbable entity
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: <distance-pos>, moveToDistance: 0.8)
```

**Assert**: Entity `<distance>` has `Hovered`

#### Test 1.2: Trigger to Grab

**Action**: Snapshot, then hold trigger
```
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "before-grab")
mcp__iwsdk-dev-mcp__xr_set_select_value(device: "controller-right", value: 1)
```

**Assert**: Entity has `Hovered` + `Pressed`

#### Test 1.3: Move While Grabbed

**Action**: Move controller to new position while trigger held
```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right", position: {x: 0.5, y: 1.5, z: -1.0}, duration: 1.0)
```

**Assert**: Entity Transform position changed
```
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "after-move")
mcp__iwsdk-dev-mcp__ecs_diff(from: "before-grab", to: "after-move")
→ Entity's Transform.position must differ from initial
```

#### Test 1.4: Release Trigger

```
mcp__iwsdk-dev-mcp__xr_set_select_value(device: "controller-right", value: 0)
```

**Assert**: `Pressed` removed, entity stops moving. `Handle` persists (it's permanent).

#### Test 1.5: Point Away — Clean State

```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: {x: 0, y: 1.6, z: -5})
```

**Assert**: `Hovered` removed

---

### Suite 2: One-Hand Grab (Squeeze)

**What we're testing**: Near-field grab using grip sphere. One-hand grab does NOT produce `Hovered` or `Pressed` tags. Verify via Transform changes.

#### Test 2.1: Ray Isolation — Ray Cannot Interact

**Action**: Point ray directly at the one-hand grabbable from distance
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: <onehand-pos>, moveToDistance: 0.5)
```

**Assert**: No `Hovered` or `Pressed` on entity (ray is denied by `pointerEventsType`)

#### Test 2.2: Position Controller at Object + Squeeze

```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: <onehand-pos>,
  orientation: {pitch: 0, roll: 0, yaw: 0})
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 1, value: 1, touched: true}])
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "before-onehand")
```

#### Test 2.3: Move While Squeezing

```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: <onehand-pos.x>, y: <onehand-pos.y> + 0.3, z: <onehand-pos.z> + 0.3}, duration: 1.0)
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "after-onehand-move")
mcp__iwsdk-dev-mcp__ecs_diff(from: "before-onehand", to: "after-onehand-move")
```

**Assert**: Entity's Transform.position must have changed to follow the controller.

#### Test 2.4: Release Squeeze

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 1, value: 0, touched: false}])
```

**Assert**: Entity stops moving (Transform remains at released position).

---

### Suite 3: Two-Hand Grab (Both Controllers Squeeze)

**What we're testing**: Two-hand grab with scaling.

#### Test 3.1: Position Both Controllers Near Object

```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-left",
  position: {x: <twohand-pos.x> - 0.15, y: <twohand-pos.y>, z: <twohand-pos.z>},
  orientation: {pitch: 0, roll: 0, yaw: 0})
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: <twohand-pos.x> + 0.15, y: <twohand-pos.y>, z: <twohand-pos.z>},
  orientation: {pitch: 0, roll: 0, yaw: 0})
```

#### Test 3.2: Both Squeeze + Snapshot

```
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "before-twohand")
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-left",
  buttons: [{index: 1, value: 1, touched: true}])
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 1, value: 1, touched: true}])
```

#### Test 3.3: Spread Hands — Scale Up

```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-left",
  position: {x: <twohand-pos.x> - 0.5, y: <twohand-pos.y>, z: <twohand-pos.z>}, duration: 1.0)
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: <twohand-pos.x> + 0.5, y: <twohand-pos.y>, z: <twohand-pos.z>}, duration: 1.0)
```

**Assert**: Entity Transform.scale increased
```
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "after-twohand-scale")
mcp__iwsdk-dev-mcp__ecs_diff(from: "before-twohand", to: "after-twohand-scale")
→ scale should be larger than initial
```

#### Test 3.4: Release Both

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-left",
  buttons: [{index: 1, value: 0, touched: false}])
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 1, value: 0, touched: false}])
```

---

### Suite 4: System & Component Registration

#### Test 4.1: GrabSystem at Correct Priority

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ GrabSystem present at priority -3
```

#### Test 4.2: Components Registered

```
mcp__iwsdk-dev-mcp__ecs_list_components
→ Must include: OneHandGrabbable, TwoHandsGrabbable, DistanceGrabbable, Handle
```

---

### Suite 5: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"])
→ Must return empty
```

---

## Results Summary

```
| Suite                         | Result    |
|-------------------------------|-----------|
| 1. Distance Grab              | PASS/FAIL |
| 2. One-Hand Grab              | PASS/FAIL |
| 3. Two-Hand Grab              | PASS/FAIL |
| 4. System/Component Reg.      | PASS/FAIL |
| 5. Stability                  | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### No Hovered/Pressed for near-field grabs
OneHandGrabbable and TwoHandsGrabbable entities do NOT get `Hovered` or `Pressed` tags. Only distance grab (via ray) gets these tags. Use `ecs_snapshot`/`ecs_diff` to verify near-field grabs.

### Handle component is permanent
`Handle` is added by `GrabSystem` at init time and never removed. Grab state is tracked inside `Handle.instance.outputState`.

### Trigger vs Squeeze confusion
Distance grab uses **trigger** (`set_select_value`), not squeeze. One-hand and two-hand grab use **squeeze** (`set_gamepad_state` button index 1). Wrong button silently fails.

### Grab sphere radius is 0.07m
The grab sphere intersector has a default radius of 7cm. Position the controller at the object's center for reliable detection.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
