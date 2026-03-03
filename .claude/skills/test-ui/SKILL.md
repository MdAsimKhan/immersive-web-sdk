---
name: test-ui
description: Automated test for the UI system (PanelUI, ScreenSpace, Follower). Targets the poke example. Uses dynamic entity discovery. Tests panel loading, screen-space positioning, and system registration. Follower suite is skipped (poke has no Follower entity).
argument-hint: [--suite panel|screenspace|follower|all]
---

# UI System Test

**Target Example:** `examples/poke`

Automated test suite for verifying PanelUI loading, ScreenSpace positioning, and Follower behavior using IWER MCP tools.

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

## About the Poke Example's UI

The poke example creates a panel entity with:
- `PanelUI` config: `./ui/welcome.json`, `maxHeight: 0.4`, `maxWidth: 0.5`
- `RayInteractable` + `PokeInteractable` (dual interaction mode)
- `ScreenSpace` with `top: '20px'`, `left: '20px'`, `height: '50%'`
- `AudioSource` for click sounds
- Position: `(0, 1.5, -1.4)`

The example does NOT have a Follower entity. The Follower suite is optional and will be skipped.

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

---

## Test Suites

### Suite 1: Panel Loading

**What we're testing**: PanelUI config JSON loads and produces a PanelDocument.

#### Test 1.1: Find Panel Entity

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["PanelUI"])
→ At least 1 entity. Save its entityIndex as <panel>.
```

#### Test 1.2: PanelDocument Added After Load

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <panel>, components: ["PanelUI", "PanelDocument"])
```

**Assert**:
- `PanelUI.config` contains `welcome.json`
- `PanelUI.maxWidth` = `0.5`
- `PanelUI.maxHeight` = `0.4`
- `PanelDocument` component IS present (proves async panel loading succeeded)
- `PanelDocument.document` is an Object3D reference (loaded UIKitDocument)

**Key behavior**: `PanelDocument` is added automatically by `PanelUISystem` after the config JSON is fetched and interpreted. If `PanelDocument` is absent, the panel hasn't finished loading yet.

#### Test 1.3: PanelUISystem Query Counts

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ PanelUISystem:
  unconfiguredPanels: 0 (all panels loaded)
  configuredPanels: 1 (panel has PanelDocument)
```

If `unconfiguredPanels > 0`, a panel is still loading or failed to load.

---

### Suite 2: ScreenSpace

**What we're testing**: ScreenSpace component configures CSS-like positioning for the panel.

#### Test 2.1: ScreenSpace Values

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <panel>, components: ["ScreenSpace"])
```

**Assert**:
- `height` = `"50%"` (CSS expression)
- `width` = `"auto"`
- `top` = `"20px"`
- `left` = `"20px"`
- `bottom` = `"auto"`
- `right` = `"auto"`
- `zOffset` = `0.2` (distance in front of camera near plane)

#### Test 2.2: Panel Visible in Screenshot

```
mcp__iwsdk-dev-mcp__browser_screenshot
```

**Assert**: Screenshot shows the "Poke Interactions" panel rendered in the scene.

#### Test 2.3: ScreenSpaceUISystem Active

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ ScreenSpaceUISystem: panels: 1
```

---

### Suite 3: Follower (SKIP — poke has no Follower)

The poke example does not include a Follower entity. This suite is skipped.

To test Follower, run against an example that includes a Follower entity, or add one to the example code.

**Result**: SKIP

---

### Suite 4: System Registration

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ PanelUISystem at priority 0, config: forwardHtmlEvents, kits, preferredColorScheme
→ ScreenSpaceUISystem at priority 0
→ FollowSystem at priority 0
```

---

### Suite 5: Component Registration

```
mcp__iwsdk-dev-mcp__ecs_list_components
→ PanelUI: config (String), maxWidth (Float32), maxHeight (Float32)
→ PanelDocument: document (Object)
→ ScreenSpace: height, width, top, bottom, left, right (all String), zOffset (Float32)
→ Follower: target (Object), offsetPosition (Vec3), behavior (Enum, default "pivot-y"),
           maxAngle (Float32), tolerance (Float32), speed (Float32), needsPositionSync (Boolean)
```

---

### Suite 6: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"]) → empty
```

---

## Results Summary

```
| Suite                  | Result    |
|------------------------|-----------|
| 1. Panel Loading       | PASS/FAIL |
| 2. ScreenSpace         | PASS/FAIL |
| 3. Follower            | SKIP      |
| 4. System Registration | PASS/FAIL |
| 5. Component Reg.      | PASS/FAIL |
| 6. Stability           | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### PanelDocument loading is async
`PanelDocument` is added asynchronously after `fetch()` completes. If you query immediately after reload, the panel might not have loaded yet. Check that `unconfiguredPanels: 0` in PanelUISystem before asserting PanelDocument presence.

### ScreenSpace re-parenting in XR
When XR is presenting, `ScreenSpaceUISystem` re-parents the panel from the camera back to the entity's Object3D (world space). CSS positioning only applies outside XR.

### Panel interaction
The panel entity also has `RayInteractable` + `PokeInteractable`, so it participates in ray/touch interaction. The panel's `Hovered` component may be present if the default controller ray is pointing at it.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
