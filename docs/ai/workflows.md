---
outline: [2, 4]
---

# Workflows

This page covers practical agent workflow patterns — common sequences of MCP tool calls that accomplish real tasks. Use these as building blocks when instructing your AI agent.

## Screenshot-Driven Development

The most basic workflow: make a change, take a screenshot, verify the result.

```text
1. xr_get_session_status       → verify MCP connection is live
2. Agent modifies code (e.g., changes a material color)
3. browser_reload_page         → reset the app
4. xr_accept_session           → enter XR
5. browser_screenshot          → capture the result
6. Agent evaluates the screenshot and iterates
```

::: tip Always call `xr_get_session_status` first
Before doing anything else, call `xr_get_session_status` to confirm the MCP connection is live and the dev server is running. This avoids acting before the bridge is ready or accidentally starting a duplicate dev server.
:::

::: tip
In agent mode, screenshots are captured at the fixed `screenshotSize` resolution (default 800x800). Keep this small to reduce token usage — 500x500 is usually sufficient for visual verification.
:::

## Controller Positioning and Interaction

Position a controller near a target object, then interact with it.

### Point at an object

```text
1. scene_get_hierarchy         → find the object's UUID
2. scene_get_object_transform  → get its world position (use positionRelativeToXROrigin)
3. xr_look_at                  → orient the right controller toward the object
   device: "controller-right"
   target: { x: 0.5, y: 1.2, z: -1.0 }
   moveToDistance: 0.3          → also move the controller 0.3m from the target
4. browser_screenshot          → verify the controller is pointing at the object
```

### Select (click/tap)

```text
5. xr_select                   → perform a complete select (press + release)
   device: "controller-right"
```

### Grab, move, and release

```text
1. xr_set_transform            → position controller near the grabbable object
2. xr_set_select_value          → value: 1.0 (grab)
3. xr_animate_to                → move controller to the target position (carries the object)
   duration: 0.5
4. xr_set_select_value          → value: 0.0 (release)
5. browser_screenshot           → verify the object was moved
```

## ECS Debugging

Pause the simulation, step through frames, and compare state before and after.

### Frame-by-frame inspection

```text
1. ecs_pause                   → freeze the simulation
2. ecs_snapshot                → label: "before"
3. ecs_step                    → advance 1 frame
   count: 1
4. ecs_snapshot                → label: "after"
5. ecs_diff                    → compare the two snapshots
   from: "before", to: "after"
6. ecs_resume                  → unfreeze when done
```

The diff shows added/removed/changed entities and field-level value changes — useful for understanding exactly what a system does each frame.

### Find and inspect entities

```text
1. ecs_list_components         → see all registered component types
2. ecs_find_entities           → find entities with specific components
   withComponents: ["Grabbable", "Transform"]
   namePattern: "cube"
3. ecs_query_entity            → get full component data for a specific entity
   entityIndex: 42
```

### Toggle a system

```text
1. ecs_list_systems            → see all systems with their pause state
2. ecs_toggle_system           → pause a specific system
   name: "PhysicsSystem"
   paused: true
3. browser_screenshot          → observe the effect
4. ecs_toggle_system           → resume it
   name: "PhysicsSystem"
   paused: false
```

### Modify component values at runtime

```text
1. ecs_find_entities           → find the entity
   namePattern: "orb"
2. ecs_query_entity            → inspect its components
   entityIndex: 7
3. ecs_set_component           → change a field value
   entityIndex: 7
   componentId: "Orb"
   field: "orbitSpeed"
   value: 2.0
4. browser_screenshot          → observe the change
```

## Scene Inspection

Navigate the Three.js scene hierarchy to understand the scene structure.

```text
1. scene_get_hierarchy         → get the top-level scene tree
   maxDepth: 3
2. scene_get_hierarchy         → drill into a specific subtree
   parentId: "uuid-of-interesting-group"
   maxDepth: 5
3. scene_get_object_transform  → get transforms for a specific object
   uuid: "uuid-of-object"
```

The `positionRelativeToXROrigin` field in the transform result can be passed directly to `xr_look_at` or `xr_set_transform` to point devices at scene objects.

## Collaborate Mode: Teaching the Agent

In [collaborate mode](./modes#collaborate-mode), the human and agent share the same browser. This enables a powerful teaching workflow:

```text
1. Human uses DevUI to manually position the right controller
   (e.g., finding the exact angle to poke a button)
2. Human tells the agent: "snapshot this controller position"
3. Agent calls xr_get_transform → device: "controller-right"
   Agent records: { x: 0.32, y: 1.15, z: -0.48 }, orientation: { ... }
4. Next time the agent needs to poke that button, it uses the saved transform
   directly with xr_set_transform — no trial and error needed
```

This is especially useful for complex interactions where precise positioning matters (e.g., reaching specific UI elements, poking small buttons, or interacting with objects at awkward angles).

## Console Log Monitoring

Check for errors after performing actions:

```text
1. browser_get_console_logs    → get recent errors
   level: "error"
   count: 10
2. browser_get_console_logs    → check logs since last action
   since: 1709900000000
   level: ["warn", "error"]
3. browser_get_console_logs    → search for specific patterns
   pattern: "physics|collision"
```

## Full Workflow Example

A complete workflow for verifying a grab interaction:

```text
 1. xr_accept_session                → enter XR
 2. browser_screenshot               → verify the scene loaded
 3. scene_get_hierarchy              → find the grabbable cube
 4. scene_get_object_transform       → get its position
 5. xr_look_at                       → point right controller at the cube
    moveToDistance: 0.05
 6. browser_screenshot               → verify controller is near the cube
 7. xr_set_select_value              → grab (value: 1.0)
 8. xr_animate_to                    → move controller up 0.5m
    position: { x: 0.3, y: 1.7, z: -0.5 }
    duration: 0.3
 9. browser_screenshot               → verify the cube moved with the controller
10. xr_set_select_value              → release (value: 0.0)
11. browser_screenshot               → verify the cube dropped
12. browser_get_console_logs         → check for errors
    level: "error"
```
