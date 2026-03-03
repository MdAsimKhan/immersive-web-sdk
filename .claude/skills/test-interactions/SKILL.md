---
name: test-interactions
description: Automated end-to-end test for the XR interaction system (ray, poke/touch, dual-mode). Tests all interaction modes using IWER MCP tools against the poke example. Dynamic entity discovery — no hardcoded indices. Run from examples/poke/ with the dev server running.
argument-hint: [--suite ray|poke|dual|audio|ui|all]
---

# XR Interaction System Test

Automated test suite for verifying ray, poke/touch, and dual-mode interactions using the IWER MCP emulator tools.

**Target Example:** `examples/poke`

Run this skill from the `examples/poke/` directory with the dev server running (`npm run dev`).

## Pre-test Setup

1. Reload the page to get a clean state:
   `mcp__iwsdk-dev-mcp__browser_reload_page`

2. Wait 2 seconds for assets to load, then accept the XR session:
   `mcp__iwsdk-dev-mcp__xr_accept_session`

3. Verify zero startup errors:
   `mcp__iwsdk-dev-mcp__browser_get_console_logs` with `count: 20, level: ["error"]`
   **Expected:** No error-level logs. Warnings about audio autoplay policy are acceptable.

---

## Suite 1: Entity Discovery

Discover all testable entities dynamically. These entity indices are used by all subsequent suites.

1. Find the robot entity:
   `mcp__iwsdk-dev-mcp__ecs_find_entities` with `withComponents: ["Robot"]`
   **Expected:** Exactly 1 entity. Save its `entityIndex` as `<robot>`.

2. Find the panel entity:
   `mcp__iwsdk-dev-mcp__ecs_find_entities` with `withComponents: ["PanelUI"]`
   **Expected:** Exactly 1 entity. Save its `entityIndex` as `<panel>`.

3. Get the robot's world position:
   Use `mcp__iwsdk-dev-mcp__scene_get_hierarchy` with `maxDepth: 3` to find the robot's Object3D UUID (match `entityIndex` = `<robot>`).
   Then `mcp__iwsdk-dev-mcp__scene_get_object_transform` with that UUID.
   Save `positionRelativeToXROrigin` as `<robot-pos>`. Expected near `(0, 0.95, -1.5)`.

4. Get the panel's world position:
   Same approach — find panel's UUID from hierarchy, query transform.
   Save `positionRelativeToXROrigin` as `<panel-pos>`. Expected near `(0, 1.5, -1.4)`.

---

## Suite 2: ECS Registration

1. List all registered systems:
   `mcp__iwsdk-dev-mcp__ecs_list_systems`
   **Expected:** These systems must be present:
   - `RobotSystem`
   - `PanelSystem`
   - `InputSystem`
   - `AudioSystem`
   - `PanelUISystem`

2. Verify component schemas:
   `mcp__iwsdk-dev-mcp__ecs_list_components`
   **Expected:** These components must be registered:
   - `Robot`
   - `PanelUI` (with fields: `config`, `maxWidth`, `maxHeight`)
   - `AudioSource` (with fields: `src`, `loop`, `_loaded`, `_isPlaying`, `_playRequested`)
   - `RayInteractable`
   - `PokeInteractable`
   - `ScreenSpace`

---

## Suite 3: Ray Interaction on Robot

Test the full ray interaction lifecycle on the robot entity (which has both `RayInteractable` and `PokeInteractable`).

#### Test 3.1: Ray Hover

**Action**: Point controller-right at the robot:
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: <robot-pos>, moveToDistance: 1.0)
```

Wait 0.5 seconds, then:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <robot>, components: ["Hovered", "Pressed"])
```
**Expected:** `Hovered` present, `Pressed` absent.

#### Test 3.2: Ray Select

**Action**: Press the trigger:
```
mcp__iwsdk-dev-mcp__xr_set_select_value(device: "controller-right", value: 1)
```
Wait 0.3 seconds, then query `<robot>` for `["Hovered", "Pressed"]`.
**Expected:** Both `Hovered` and `Pressed` present.

#### Test 3.3: Ray Release

**Action**: Release the trigger:
```
mcp__iwsdk-dev-mcp__xr_set_select_value(device: "controller-right", value: 0)
```
Wait 0.3 seconds, then query `<robot>` for `["Hovered", "Pressed"]`.
**Expected:** `Hovered` present (controller still aimed), `Pressed` absent.

#### Test 3.4: Ray Unhover

**Action**: Point controller away:
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: {x: 5, y: 1.5, z: 0})
```
Wait 0.5 seconds, then query `<robot>` for `["Hovered"]`.
**Expected:** `Hovered` absent.

---

## Suite 4: Poke Interaction on Robot

Test near-field poke/touch interaction on the robot.

**Key mechanism**: The touch pointer uses a `SphereIntersector` with two thresholds:
- `hoverRadius: 0.2m` (20cm) — triggers hover
- `downRadius: 0.02m` (2cm) — triggers auto-select (pointerdown)

#### Test 4.1: Position Controller Near Robot

Calculate a position 0.3m in front of the robot: `<robot-pos>` with z offset +0.3.
```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> + 0.3},
  orientation: {pitch: 0, yaw: 180, roll: 0})
```

#### Test 4.2: Slow Animate Through Robot Mesh

Animate slowly through the robot mesh surface (must be slow to hit the 2cm downRadius):
```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> - 0.3},
  duration: 2.5)
```

Wait 1.5 seconds, then:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <robot>, components: ["Hovered", "Pressed"])
```
**Expected:** At least `Hovered` present. `Pressed` may also be present if the controller has penetrated past the downRadius threshold.

#### Test 4.3: Pull Back

```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: 0.3, y: 1.5, z: -0.3}, duration: 0.3)
```
Wait 0.5 seconds, then query `<robot>` for `["Hovered", "Pressed"]`.
**Expected:** Neither `Hovered` nor `Pressed` present.

---

## Suite 5: Ray Interaction on Panel

Test ray interaction on the UI panel entity.

#### Test 5.1: Ray Hover

Point controller at panel:
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: <panel-pos>, moveToDistance: 0.8)
```
Wait 0.5 seconds. Query `<panel>` for `["Hovered"]`.
**Expected:** `Hovered` present.

#### Test 5.2: Click

Perform a quick select:
```
mcp__iwsdk-dev-mcp__xr_select(device: "controller-right", duration: 0.2)
```
Wait 0.3 seconds. Query `<panel>` for `["Hovered"]`.
**Expected:** `Hovered` still present (controller didn't move).

#### Test 5.3: Unhover

Point controller away:
```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right", target: {x: 5, y: 1.5, z: 0})
```
Wait 0.5 seconds. Query `<panel>` for `["Hovered"]`.
**Expected:** `Hovered` absent.

---

## Suite 6: Dual-Mode Interaction (Panel — Ray + Poke)

Test that both ray and poke work on the panel entity, which has both `RayInteractable` and `PokeInteractable`.

#### Test 6.1: Ray Hover from Distance

```
mcp__iwsdk-dev-mcp__xr_look_at(device: "controller-right",
  target: <panel-pos>, moveToDistance: 0.8)
```
Wait 0.5 seconds. Query `<panel>` for `["Hovered"]`.
**Expected:** `Hovered` present.

#### Test 6.2: Poke on Panel

Position controller close to panel and animate through slowly:
```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: <panel-pos.x>, y: <panel-pos.y>, z: <panel-pos.z> + 0.2},
  orientation: {pitch: 0, roll: 0, yaw: 0})
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: <panel-pos.x>, y: <panel-pos.y>, z: <panel-pos.z> - 0.1},
  duration: 3)
```

Wait 2 seconds, then query `<panel>` for `["Hovered", "Pressed"]`.
**Expected:** Both `Hovered` and `Pressed` present.

#### Test 6.3: Poke Release

Pull back:
```
mcp__iwsdk-dev-mcp__xr_animate_to(device: "controller-right",
  position: {x: 0.3, y: 1.5, z: -0.3}, duration: 0.3)
```
Wait 0.5 seconds. Query `<panel>` for `["Hovered", "Pressed"]`.
**Expected:** Neither present.

---

## Suite 7: Cross-Entity Isolation

**What we're testing**: Interacting with one entity does NOT affect others.

#### Test 7.1: Only Target Entity Gets Hovered

Position controller near robot (poke hover range):
```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: <robot-pos.x> + 0.1, y: <robot-pos.y>, z: <robot-pos.z> + 0.3},
  orientation: {pitch: 0, roll: 0, yaw: 180})
```

**Assert**:
- Robot entity has `Hovered`
- Panel entity has NO interaction components

---

## Suite 8: Input Mode Switching

#### Test 8.1: Hand Hover After Switch

Switch to hand mode, position hand near robot:
```
mcp__iwsdk-dev-mcp__xr_set_input_mode(mode: "hand")
mcp__iwsdk-dev-mcp__xr_set_transform(device: "hand-right",
  position: {x: <robot-pos.x> + 0.1, y: <robot-pos.y>, z: <robot-pos.z> + 0.3})
```

Wait 0.5 seconds. Query `<robot>` for `["Hovered"]`.
**Expected:** `Hovered` present.

#### Test 8.2: Switch Back to Controllers

```
mcp__iwsdk-dev-mcp__xr_set_input_mode(mode: "controller")
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: 0.3, y: 1.5, z: -0.3},
  orientation: {pitch: 0, roll: 0, yaw: 0})
```

Wait 0.5 seconds. Query `<robot>` for `["Hovered"]`.
**Expected:** `Hovered` absent (clean transition).

---

## Suite 9: Rapid Poke Cycles (Regression)

**What we're testing**: The stuck Pressed bug doesn't regress. Multiple poke-release cycles must all clean up properly.

#### Test 9.1: Three Consecutive Poke Cycles

For each of 3 cycles:
1. Position at `{x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> + 0.4}` with yaw 180°
2. Animate to `{x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> - 0.3}` over 1.5s
3. Wait 1.5s, assert `Hovered` or `Pressed` is present
4. Animate back to `{x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> + 0.5}` over 0.3s
5. Wait 0.5s, assert entity has NO interaction components

All 3 cycles must pass — no stuck state accumulation.

---

## Suite 10: Audio

Test that audio components are loaded and can be triggered.

#### Test 10.1: Find Audio Entities

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["AudioSource"])
```
**Expected:** At least 1 entity found. Use the first as `<audio>`.

#### Test 10.2: Verify Audio Loaded

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <audio>, components: ["AudioSource"])
```
**Expected:** `_loaded` = `true`, `src` contains `chime.mp3`.

#### Test 10.3: Trigger Playback

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "loop", value: "true")
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "_playRequested", value: "true")
```
Note: `_playRequested` is consumed within one frame. The response may already show `false`.

#### Test 10.4: Verify Playback State

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <audio>, components: ["AudioSource"])
```
**Expected:** `_isPlaying` = `true` (loop is on).

#### Test 10.5: Stop Playback

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "_stopRequested", value: "true")
```

---

## Suite 11: UI Panel Verification

#### Test 11.1: Panel Loading

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <panel>, components: ["PanelUI", "PanelDocument", "ScreenSpace"])
```

**Expected:**
- `PanelUI.config` contains `welcome.json`
- `PanelUI.maxWidth` ≈ `0.5`, `PanelUI.maxHeight` ≈ `0.4`
- `PanelDocument` component IS present (proves async panel loading succeeded)
- `ScreenSpace` component IS present with expected positioning fields

#### Test 11.2: Visual Confirmation

```
mcp__iwsdk-dev-mcp__browser_screenshot
```
**Expected:** The panel should be visible in the scene.

---

## Suite 12: Stability Check

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 50, level: ["error", "warn"])
```
**Expected:** No error-level logs. Warnings about `AudioContext` autoplay policy are acceptable.

---

## Results Summary

After all suites complete, print a summary table:

```
| Suite                         | Result    |
|-------------------------------|-----------|
| 1. Entity Discovery           | PASS/FAIL |
| 2. ECS Registration           | PASS/FAIL |
| 3. Ray Interaction (Robot)    | PASS/FAIL |
| 4. Poke Interaction (Robot)   | PASS/FAIL |
| 5. Ray Interaction (Panel)    | PASS/FAIL |
| 6. Dual-Mode (Panel)          | PASS/FAIL |
| 7. Cross-Entity Isolation     | PASS/FAIL |
| 8. Input Mode Switching       | PASS/FAIL |
| 9. Rapid Poke Cycles          | PASS/FAIL |
| 10. Audio                     | PASS/FAIL |
| 11. UI Panel                  | PASS/FAIL |
| 12. Stability                 | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### Poke timing sensitivity
The slow animation in poke suites (2-2.5 seconds) is critical. The poke system uses a 2cm `downRadius` threshold — if the controller moves too fast, it can skip past the threshold between frames.

### Audio autoplay
Browsers block audio autoplay until user gesture. The `_playRequested` flag may silently fail on the first attempt. If `_isPlaying` is false, this is a browser policy issue, not a bug.

### One-shot flags consumed immediately
`_playRequested` and `_stopRequested` are processed and reset to `false` within a single frame.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.

### Touch pointer not enabled
**Symptom**: Touch hover doesn't work — no Hovered on poke-only entities.
**Cause**: `toggleSubPointer('touch', true)` was only called at `InputSystem.init()` time, before entities were created.
**Fix**: Added `toggleSubPointer` calls in the `pokeInteractables` qualify/disqualify handlers.

### Pressed stuck after poke pull-back
**Symptom**: `Pressed` component remains after moving controller away.
**Cause**: `processTouchLifecycle` didn't dispatch `pointer.up()` when intersection was lost in SELECT state.
**Fix**: Added `entry.pointer.up(this.buttonEvent)` when touch loses intersection while in SELECT state.

## Architecture Notes

### Pointer Priority Order
`PRIORITY_ORDER: ['touch', 'grab', 'ray']`. Touch wins over grab, grab wins over ray.

### Touch Auto-Select
`createTouchPointer` uses a `SphereIntersector`. During `pointer.move()`, it calls `pointer.down()` when distance crosses `downRadius` (0.02m), and `pointer.up()` when it crosses back.

### Poke Example Entities
- **Robot** (at ~(0, 0.95, -1.5), scale 0.5): `RayInteractable` + `PokeInteractable` + `Robot` + `AudioSource`
- **Panel** (at ~(0, 1.5, -1.4)): `PanelUI` + `RayInteractable` + `PokeInteractable` + `ScreenSpace` + `AudioSource`
- **Environment** (desk mesh): `LocomotionEnvironment`
- **Logo banner**: plain mesh, no interaction components
