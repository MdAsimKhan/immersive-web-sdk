---
name: test-locomotion
description: Automated end-to-end test for the locomotion system (slide, snap turn, teleport, jump). Targets the locomotion example. Uses dynamic entity discovery. The example already has LocomotionEnvironment, Elevator, and settings panel via GLXF level.
argument-hint: [--suite slide|turn|teleport|jump|all]
---

# Locomotion System Test

**Target Example:** `examples/locomotion`

Automated test suite for verifying slide movement, snap turn, teleport, and jump using the IWER MCP emulator tools.

Run all suites in order. Report a summary table at the end with pass/fail per suite.

## Server Lifecycle

### Start the dev server (if not already running)

```bash
cd examples/locomotion && npm run dev &
```

Wait for port 8081 to be ready:
```bash
for i in $(seq 1 30); do lsof -i :8081 -sTCP:LISTEN > /dev/null 2>&1 && break; sleep 1; done
```

### At the end of all tests, kill the dev server

```bash
kill $(lsof -t -i :8081) 2>/dev/null
```

## About the Locomotion Example

The locomotion example uses a GLXF-based level (`./glxf/Composition.glxf`) with `grabbing: true` and `locomotion: true`. It registers `SettingsSystem` (settings panel) and `ElevatorSystem` (an oscillating platform with the custom `Elevator` component). Entities including `LocomotionEnvironment` are defined in the GLXF composition.

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

### Verify locomotion setup

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LocomotionEnvironment"])
→ Must return at least 1 entity. Save as <env>.
```

Inspect the environment entity:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <env>, components: ["LocomotionEnvironment"])
→ _initialized: true, _envHandle > 0
```

Verify all locomotion systems are registered:
```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ LocomotionSystem (priority -5)
→ TurnSystem (priority 0)
→ SlideSystem (priority 0)
→ TeleportSystem (priority 0)
```

---

## Test Suites

### Suite 1: Slide Movement (Left Thumbstick)

**What we're testing**: Left thumbstick forward/back/strafe causes player position to change.

**Observation method**: Locomotion moves the XR origin, NOT the headset. Verify movement via **screenshots** (scene appears to move).

#### Test 1.1: Slide Forward

```
mcp__iwsdk-dev-mcp__browser_screenshot  → save as "before slide"
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-left",
  axes: [{index: 0, value: 0}, {index: 1, value: -1}])
```

Wait ~1 second for movement to accumulate.

```
mcp__iwsdk-dev-mcp__browser_screenshot → save as "after slide"
```

**Assert**: Screenshots show scene moving closer (player moved forward).

#### Test 1.2: Stop Sliding

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-left",
  axes: [{index: 0, value: 0}, {index: 1, value: 0}])
```

**Assert**: Player stops moving (subsequent screenshots are identical).

#### Test 1.3: Slide Backward

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-left",
  axes: [{index: 0, value: 0}, {index: 1, value: 1}])
```

Wait ~1 second, then screenshot.

**Assert**: Scene moves away (player retreated).

Release: `axes: [{index: 0, value: 0}, {index: 1, value: 0}]`

---

### Suite 2: Snap Turn (Right Thumbstick Left/Right)

**What we're testing**: Right thumbstick left or right triggers a 45-degree snap rotation. Edge-triggered.

#### Test 2.1: Snap Turn Right

```
mcp__iwsdk-dev-mcp__browser_screenshot → save as "before turn"
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  axes: [{index: 0, value: 1}, {index: 1, value: 0}])
```

Wait ~0.3s.

```
mcp__iwsdk-dev-mcp__browser_screenshot → save as "after turn right"
```

**Assert**: View rotated ~45 degrees clockwise.

#### Test 2.2: Release + Snap Turn Left

**IMPORTANT**: Must release first for edge trigger reset.
```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  axes: [{index: 0, value: 0}, {index: 1, value: 0}])
```

Wait ~0.3s, then push left:
```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  axes: [{index: 0, value: -1}, {index: 1, value: 0}])
```

Wait ~0.3s, then screenshot.

**Assert**: View rotated ~45 degrees counter-clockwise (back to roughly original heading).

Release thumbstick after test.

---

### Suite 3: Teleport (Right Thumbstick Down)

**What we're testing**: Right thumbstick down activates teleport arc. Release confirms teleport.

**Precondition**: The right controller must NOT be pointing at any interactable entity.

#### Test 3.1: Setup — Point Controller at Floor

```
mcp__iwsdk-dev-mcp__xr_set_transform(device: "controller-right",
  position: {x: 0.25, y: 1.5, z: -0.3},
  orientation: {pitch: -45, roll: 0, yaw: 0})
```

#### Test 3.2: Activate Teleport Arc

```
mcp__iwsdk-dev-mcp__browser_screenshot → save as "before teleport"
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  axes: [{index: 0, value: 0}, {index: 1, value: 1}])
```

Wait ~1 second.

#### Test 3.3: Release to Teleport

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  axes: [{index: 0, value: 0}, {index: 1, value: 0}])
```

Wait ~0.5s, then screenshot.

**Assert**: Player position changed (view is from a different location).

---

### Suite 4: Jump (A Button on Right Controller)

#### Test 4.1: Press A Button

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 3, value: 1, touched: true}])
```

Wait ~0.3s, take screenshot.

```
mcp__iwsdk-dev-mcp__xr_set_gamepad_state(device: "controller-right",
  buttons: [{index: 3, value: 0, touched: false}])
```

**Assert**: View may show momentary elevation change.

---

### Suite 5: System Registration & Config

```
mcp__iwsdk-dev-mcp__ecs_list_systems
```

**Assert**:
- `LocomotionSystem` at priority -5
- `TurnSystem` at priority 0 with config keys: `turningMethod`, `turningAngle`, `turningSpeed`
- `SlideSystem` at priority 0 with config keys: `locomotor`, `maxSpeed`, `comfortAssist`, `jumpButton`, `enableJumping`
- `TeleportSystem` at priority 0 with config keys: `rayGravity`, `locomotor`

Also verify the `Elevator` component and `ElevatorSystem` are registered (example-specific):
```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["Elevator"])
→ At least 1 entity (the oscillating platform)
```

---

### Suite 6: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"])
→ Must return empty
```

---

## Results Summary

```
| Suite                     | Result    |
|---------------------------|-----------|
| 1. Slide Movement         | PASS/FAIL |
| 2. Snap Turn              | PASS/FAIL |
| 3. Teleport               | PASS/FAIL |
| 4. Jump                   | PASS/FAIL |
| 5. System Registration    | PASS/FAIL |
| 6. Stability              | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Input Mapping Reference

| Action | Controller | Input | IWER Tool |
|--------|-----------|-------|-----------|
| Slide forward | Left | Thumbstick Y = -1 | `set_gamepad_state` axes `[{0, 0}, {1, -1}]` |
| Slide backward | Left | Thumbstick Y = 1 | `set_gamepad_state` axes `[{0, 0}, {1, 1}]` |
| Strafe right | Left | Thumbstick X = 1 | `set_gamepad_state` axes `[{0, 1}, {1, 0}]` |
| Snap turn right | Right | Thumbstick X = 1 (edge) | `set_gamepad_state` axes `[{0, 1}, {1, 0}]` |
| Snap turn left | Right | Thumbstick X = -1 (edge) | `set_gamepad_state` axes `[{0, -1}, {1, 0}]` |
| Teleport activate | Right | Thumbstick Y = 1 (down) | `set_gamepad_state` axes `[{0, 0}, {1, 1}]` |
| Jump | Right | A button (index 3) | `set_gamepad_state` buttons `[{3, 1, true}]` |

## Known Issues & Workarounds

### Locomotion moves XR origin, not headset
Headset position stays constant (relative to XR origin). Verify movement via screenshots.

### Teleport blocked by interactable hover
Position controller away from interactables before testing teleport.

### Snap turn is edge-triggered
Must reset to center between turns. Holding the stick only fires one turn.

### Thumbstick Y axis convention
Y = -1 is forward, Y = 1 is backward. For teleport, Y = 1 activates the arc.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
