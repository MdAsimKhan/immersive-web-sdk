---
name: test-physics
description: Automated test for the Havok physics system (gravity, rigid bodies, static vs dynamic). Targets the physics example. Uses dynamic entity discovery and ecs_pause/step for deterministic frame advance. The example creates a dynamic sphere with PhysicsBody + PhysicsShape, and the GLXF level provides static geometry.
argument-hint: [--suite gravity|static|force|all]
---

# Physics System Test

**Target Example:** `examples/physics`

Automated test suite for verifying Havok physics simulation — gravity, rigid bodies, static vs dynamic, and force application using IWER MCP tools with deterministic frame stepping.

Run all suites in order. Report a summary table at the end with pass/fail per suite.

## Server Lifecycle

### Start the dev server (if not already running)

```bash
cd examples/physics && npm run dev &
```

Wait for port 8081 to be ready:
```bash
for i in $(seq 1 30); do lsof -i :8081 -sTCP:LISTEN > /dev/null 2>&1 && break; sleep 1; done
```

### At the end of all tests, kill the dev server

```bash
kill $(lsof -t -i :8081) 2>/dev/null
```

## About the Physics Example

The physics example uses a GLXF-based level (`./glxf/Composition.glxf`) with `physics: true`. It imperatively creates a dynamic sphere (`SphereGeometry(0.2)` at `(-1, 1.5, 0.5)`) with `PhysicsBody(DYNAMIC)` + `PhysicsShape(Sphere)` and applies an initial `PhysicsManipulation` force of `[10, 1, 1]`. The GLXF level provides static floor/environment geometry.

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

### Verify physics setup

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["PhysicsBody"])
→ At least 1 entity. Identify dynamic vs static by querying each.
```

For each entity found:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <N>, components: ["PhysicsBody"])
→ Check state field: "DYNAMIC" or "STATIC"
```

Save the dynamic entity as `<sphere>` and any static entity as `<floor>`.

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ PhysicsSystem at priority -2
→ physicsEntities count ≥ 1
```

---

## Test Suites

### Suite 1: Gravity — Dynamic Body Falls

**What we're testing**: A dynamic body falls under gravity (default -9.81 m/s²).

#### Test 1.1: Verify Dynamic Entity Exists

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <sphere>, components: ["PhysicsBody", "Transform"])
→ state: "DYNAMIC"
→ _engineBody: > 0 (Havok body created)
→ gravityFactor: 1
```

**Note**: By the time you query, the sphere may have already fallen and come to rest.

#### Test 1.2: Deterministic Gravity Test

Reset the sphere position, then use pause/step to observe fall:

```
mcp__iwsdk-dev-mcp__ecs_pause
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <sphere>, componentId: "Transform",
  field: "position", value: "[0, 3, -1.5]")
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "before-fall")
mcp__iwsdk-dev-mcp__ecs_step(count: 50)
mcp__iwsdk-dev-mcp__ecs_snapshot(label: "after-fall")
mcp__iwsdk-dev-mcp__ecs_diff(from: "before-fall", to: "after-fall")
```

**Assert**:
- Sphere's `Transform.position[1]` (Y) decreased from `3.0`
- Only the dynamic sphere entity changed significantly

```
mcp__iwsdk-dev-mcp__ecs_resume
```

---

### Suite 2: Static Body Doesn't Move

#### Test 2.1: Static Floor Stays Put (if static entity found)

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <floor>, components: ["PhysicsBody", "Transform"])
→ state: "STATIC"
→ _linearVelocity: [0, 0, 0]
→ _angularVelocity: [0, 0, 0]
```

**Note**: If no separate static PhysicsBody entity exists (environment geometry may not use PhysicsBody), skip this suite and report SKIP.

---

### Suite 3: PhysicsBody State Values

#### Test 3.1: Inspect Dynamic Body Fields

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <sphere>, components: ["PhysicsBody"])
→ state: "DYNAMIC"
→ linearDamping: 0
→ angularDamping: 0
→ gravityFactor: 1
→ _engineBody: > 0 (non-zero Havok handle)
```

---

### Suite 4: System & Component Registration

#### Test 4.1: PhysicsSystem at Correct Priority

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ PhysicsSystem at priority -2
→ Config keys: gravity
```

#### Test 4.2: Physics Components Registered

```
mcp__iwsdk-dev-mcp__ecs_list_components
```

**Assert**:
- `PhysicsBody`: state (Enum), linearDamping (Float32), angularDamping (Float32), gravityFactor (Float32), _linearVelocity (Vec3), _angularVelocity (Vec3), _engineBody (Float64)
- `PhysicsShape`: shape (Enum), dimensions (Vec3), density (Float32), restitution (Float32), friction (Float32), _engineShape (Float64)
- `PhysicsManipulation`: force (Vec3), linearVelocity (Vec3), angularVelocity (Vec3)

---

### Suite 5: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"]) → empty
```

---

## Results Summary

```
| Suite                     | Result         |
|---------------------------|----------------|
| 1. Gravity                | PASS/FAIL      |
| 2. Static Body            | PASS/FAIL/SKIP |
| 3. PhysicsBody State      | PASS/FAIL      |
| 4. System/Component Reg.  | PASS/FAIL      |
| 5. Stability              | PASS/FAIL      |
```

If any suite fails, include details about which assertion failed and the actual vs expected values.

---

## Known Issues & Workarounds

### Sphere falls immediately
The dynamic sphere starts falling as soon as the Havok body is created. Use `ecs_pause` immediately after reload to catch it, or use the deterministic reset approach.

### PhysicsManipulation is one-shot
`PhysicsManipulation` is automatically removed after forces are applied in a single frame. You cannot query it after processing.

### ecs_set_component on Transform doesn't always override physics
While PhysicsSystem is running, it may overwrite your position on the next frame. Use `ecs_pause` before modifying positions.

### Havok WASM initialization is async
Bodies may not be created on the first frame. The `_engineBody` field transitions from 0 to non-zero once Havok processes the entity.

### Entity indices change on reload
Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
