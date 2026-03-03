---
name: test-environment
description: Automated test for the environment system (DomeGradient, IBLGradient, default lighting). Tests environment component registration and default values using IWER MCP tools. Run from any example directory (default: examples/poke) with the dev server running.
argument-hint: [--suite gradient|ibl|defaults|all]
---

# Environment System Test

Automated test suite for verifying environment dome gradients, IBL lighting, and default lighting using IWER MCP tools.

**Target Example:** `examples/poke` (or any running example — these tests are generic)

Run this skill from any example directory with the dev server running (`npm run dev`).

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(level: ["error", "warn"]) → must be empty
```

---

## Test Suites

### Suite 1: Default Lighting Verification

**What we're testing**: LevelRoot entity has DomeGradient + IBLGradient with correct default colors.

#### Test 1.1: Find LevelRoot Dynamically

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["LevelRoot"])
→ Exactly 1 entity. Save its entityIndex as <root>.
```

#### Test 1.2: LevelRoot Has Environment Components

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <root>, components: ["DomeGradient", "IBLGradient"])
```

**Assert**: Both components present with default values:

**DomeGradient defaults:**
| Field | Expected Value |
|-------|---------------|
| `sky` | `[0.2423, 0.6172, 0.8308, 1.0]` (soft blue) |
| `equator` | `[0.6584, 0.7084, 0.7913, 1.0]` (gray-blue) |
| `ground` | `[0.807, 0.7758, 0.7454, 1.0]` (warm beige) |
| `intensity` | `1.0` |
| `_needsUpdate` | `false` (already processed) |

**IBLGradient defaults:**
| Field | Expected Value |
|-------|---------------|
| `sky` | `[0.6902, 0.749, 0.7843, 1.0]` (soft blue-gray — different from DomeGradient!) |
| `equator` | `[0.6584, 0.7084, 0.7913, 1.0]` (same as DomeGradient) |
| `ground` | `[0.807, 0.7758, 0.7454, 1.0]` (same as DomeGradient) |
| `intensity` | `1.0` |
| `_needsUpdate` | `false` |

**Key detail**: DomeGradient and IBLGradient have **different** `sky` defaults.

---

### Suite 2: System Registration

#### Test 2.1: EnvironmentSystem Present

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ EnvironmentSystem at priority 0
→ Query entity counts: domeGradients: 1, iblGradients: 1, domeTextures: 0, iblTextures: 0
```

---

### Suite 3: Component Registration

#### Test 3.1: All Environment Components Registered

```
mcp__iwsdk-dev-mcp__ecs_list_components
```

**Assert** these components exist with correct schemas:

| Component | Key Fields |
|-----------|-----------|
| `DomeGradient` | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32), `_needsUpdate` (Boolean) |
| `DomeTexture` | `src` (String), `blurriness` (Float32), `intensity` (Float32), `rotation` (Vec3), `_needsUpdate` (Boolean) |
| `IBLGradient` | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32), `_needsUpdate` (Boolean) |
| `IBLTexture` | `src` (String, default: "room"), `intensity` (Float32), `rotation` (Vec3), `_needsUpdate` (Boolean) |

---

### Suite 4: Scene Hierarchy

#### Test 4.1: Dome Mesh in Scene

```
mcp__iwsdk-dev-mcp__scene_get_hierarchy(maxDepth: 2)
```

The gradient dome mesh is added directly to the scene (not under LevelRoot). Look for an unnamed mesh node at the scene root level.

---

### Suite 5: ECS Data Modification

#### Test 5.1: Modify DomeGradient Sky Color

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <root>, componentId: "DomeGradient",
  field: "sky", value: "[1.0, 0.0, 0.0, 1.0]")
```

**Assert**: ECS value updates correctly
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <root>, components: ["DomeGradient"])
→ sky: [1.0, 0.0, 0.0, 1.0]
```

**Known limitation**: Setting `_needsUpdate: true` after changing colors does NOT visually update the dome gradient shader. Visual verification of color changes is NOT possible via MCP tools alone.

#### Test 5.2: Modify IBLGradient Intensity

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <root>, componentId: "IBLGradient",
  field: "intensity", value: "2.0")
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <root>, componentId: "IBLGradient",
  field: "_needsUpdate", value: "true")
```

**Assert**: ECS value updates.

---

### Suite 6: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"]) → empty
```

---

## Results Summary

```
| Suite                    | Result    |
|--------------------------|-----------|
| 1. Default Lighting      | PASS/FAIL |
| 2. System Registration   | PASS/FAIL |
| 3. Component Registration| PASS/FAIL |
| 4. Scene Hierarchy       | PASS/FAIL |
| 5. ECS Data Modification | PASS/FAIL |
| 6. Stability             | PASS/FAIL |
```

---

## Known Issues & Workarounds

### Live gradient color changes don't update visuals
Setting DomeGradient/IBLGradient color fields via `ecs_set_component` updates the ECS data but does NOT update the Three.js shader uniforms. Testing is limited to **data verification**.

### _needsUpdate consumed immediately
The `_needsUpdate` flag is consumed by the EnvironmentSystem and reset to `false`. The response may already show `newValue: false`.

### Default lighting auto-attach
`LevelSystem` attaches `DomeGradient` + `IBLGradient` to the LevelRoot ONLY if `defaultLighting: true` (default) AND the level root doesn't already have dome/IBL components.

## Architecture Notes

### Environment System Queries
Environment components must be on the level root entity, not on arbitrary entities.

### Dome Gradient Rendering
The gradient dome is a physical mesh in the scene (NOT `scene.background`). It's a `SphereGeometry` with `BackSide` rendering, scaled to `camera.far * 0.95`, `renderOrder: -1e9`.
