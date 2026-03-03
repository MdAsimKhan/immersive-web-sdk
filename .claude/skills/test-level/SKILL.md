---
name: test-level
description: Automated test for the level system (LevelRoot, LevelTag, default lighting, scene hierarchy). Targets any running example (default poke). Uses dynamic entity discovery — no hardcoded indices.
argument-hint: [--suite root|tags|lighting|hierarchy|all]
---

# Level System Test

**Target Example:** `examples/poke` (or any running example)

Automated test suite for verifying LevelRoot, LevelTag membership, default lighting, and scene hierarchy using IWER MCP tools.

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

### Suite 1: LevelRoot

**What we're testing**: Exactly one entity has the `LevelRoot` marker component.

#### Test 1.1: Find LevelRoot Entity

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelRoot"])
→ Exactly 1 entity. Save its entityIndex as <root>.
→ Entity should have name "LevelRoot"
→ Entity should also have: Transform, LevelTag, DomeGradient, IBLGradient
```

#### Test 1.2: LevelRoot Transform at Identity

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <root>, components: ["Transform"])
→ position: [0, 0, 0] (approximately)
→ orientation: [0, 0, 0, 1]
→ scale: [1, 1, 1]
```

The LevelSystem enforces identity transform on the level root every frame.

---

### Suite 2: LevelTag Membership

**What we're testing**: All non-persistent entities have `LevelTag` with matching `id`.

#### Test 2.1: All Level Entities Tagged

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelTag"])
→ Multiple entities — all entities except entity 0 (scene root, which is persistent)
```

#### Test 2.2: LevelTag ID Matches

Pick any tagged entity from the results above:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <any-tagged>, components: ["LevelTag"])
→ id: "level:default"
```

All tagged entities should have the same `id` value (`"level:default"` for the initial level).

#### Test 2.3: Persistent Entities Excluded

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["Transform"], withoutComponents: ["LevelTag"])
→ Only entity 0 (scene root — created with persistent: true internally)
```

---

### Suite 3: Default Lighting

**What we're testing**: When `defaultLighting: true` (default), LevelRoot gets `DomeGradient` + `IBLGradient`.

#### Test 3.1: LevelRoot Has Both Environment Components

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <root>, components: ["DomeGradient", "IBLGradient"])
→ Both present with default color values
```

See test-environment skill for expected default color values.

#### Test 3.2: LevelSystem Config

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ LevelSystem has config key: defaultLighting
```

---

### Suite 4: Scene Hierarchy

#### Test 4.1: LevelRoot is Child of Scene Root

```
mcp__iwsdk-dev-mcp__scene_get_hierarchy(maxDepth: 2)
→ Scene root children include "LevelRoot"
→ LevelRoot children include all level entities (env mesh, robot, panel, logo, etc.)
```

#### Test 4.2: Entity Count

```
mcp__iwsdk-dev-mcp__ecs_find_entities(limit: 50)
→ Total entity count should be ≥ 5
```

---

### Suite 5: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"]) → empty
```

---

## Results Summary

```
| Suite                  | Result    |
|------------------------|-----------|
| 1. LevelRoot           | PASS/FAIL |
| 2. LevelTag Membership | PASS/FAIL |
| 3. Default Lighting    | PASS/FAIL |
| 4. Scene Hierarchy     | PASS/FAIL |
| 5. Stability           | PASS/FAIL |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### LevelTag id for default level
When no GLXF level URL is provided, the level id is `"level:default"`. All entities created via `world.createTransformEntity()` (without `persistent: true`) automatically receive `LevelTag` with this id.

### Level root identity enforcement
`LevelSystem.update()` checks and resets the level root's transform to identity every frame. If you modify the level root's position via `ecs_set_component`, it will be reset on the next frame.

### Entity 0 is special
Entity 0 wraps the Three.js `Scene` object. It has `Transform` but no `LevelTag` — it's the persistent root that survives level changes.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
