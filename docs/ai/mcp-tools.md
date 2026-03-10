---
outline: [2, 4]
---

# MCP Tools Reference

The IWSDK MCP server exposes 32 tools organized into 9 categories. These tools give AI agents full control over the emulated XR runtime, the browser, the Three.js scene, and the ECS simulation.

## Session Management

### `xr_get_session_status`

Get the current XR session and device status.

**Parameters:** None

### `xr_accept_session`

Accept an offered XR session — equivalent to clicking the "Enter XR" button.

**Parameters:** None

### `xr_end_session`

End the current active XR session.

**Parameters:** None

## Transform Control

### `xr_get_transform`

Get the position and orientation of a tracked device.

| Parameter | Type     | Required | Description                                                                 |
| --------- | -------- | -------- | --------------------------------------------------------------------------- |
| `device`  | `string` | Yes      | `headset`, `controller-left`, `controller-right`, `hand-left`, `hand-right` |

### `xr_set_transform`

Set the position and/or orientation of a tracked device. Position is in meters, orientation can be a quaternion or euler angles in degrees.

| Parameter     | Type                              | Required | Description                                         |
| ------------- | --------------------------------- | -------- | --------------------------------------------------- |
| `device`      | `string`                          | Yes      | Device to move                                      |
| `position`    | `{x, y, z}`                       | No       | World position in meters. Y=1.6 is standing height. |
| `orientation` | `{x,y,z,w}` or `{pitch,yaw,roll}` | No       | Quaternion or euler angles (degrees)                |

### `xr_look_at`

Orient a device to look at a specific world position.

| Parameter        | Type        | Required | Description                                           |
| ---------------- | ----------- | -------- | ----------------------------------------------------- |
| `device`         | `string`    | Yes      | Device to orient                                      |
| `target`         | `{x, y, z}` | Yes      | World position to look at                             |
| `moveToDistance` | `number`    | No       | Also move the device to this distance from the target |

### `xr_animate_to`

Smoothly animate a device to a new position and/or orientation over time.

| Parameter     | Type                              | Required | Description                                  |
| ------------- | --------------------------------- | -------- | -------------------------------------------- |
| `device`      | `string`                          | Yes      | Device to animate                            |
| `position`    | `{x, y, z}`                       | No       | Target world position in meters              |
| `orientation` | `{x,y,z,w}` or `{pitch,yaw,roll}` | No       | Target rotation                              |
| `duration`    | `number`                          | No       | Animation duration in seconds (default: 0.5) |

## Input Mode

### `xr_set_input_mode`

Switch between controller and hand tracking input modes.

| Parameter | Type     | Required | Description            |
| --------- | -------- | -------- | ---------------------- |
| `mode`    | `string` | Yes      | `controller` or `hand` |

### `xr_set_connected`

Connect or disconnect an input device.

| Parameter   | Type      | Required | Description                                                      |
| ----------- | --------- | -------- | ---------------------------------------------------------------- |
| `device`    | `string`  | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |
| `connected` | `boolean` | Yes      | Whether the device should be connected                           |

## Select / Trigger

### `xr_get_select_value`

Get the current select (trigger/pinch) value for an input device.

| Parameter | Type     | Required | Description                                                      |
| --------- | -------- | -------- | ---------------------------------------------------------------- |
| `device`  | `string` | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |

### `xr_set_select_value`

Set the select (trigger/pinch) value. Use for grab-move-release patterns: set to 1.0 to grab, move the controller, then set to 0.0 to release.

| Parameter | Type     | Required | Description                               |
| --------- | -------- | -------- | ----------------------------------------- |
| `device`  | `string` | Yes      | Input device                              |
| `value`   | `number` | Yes      | 0 (released) to 1 (fully pressed/pinched) |

### `xr_select`

Perform a complete select action (press and release). Dispatches `selectstart`, `select`, and `selectend` events.

| Parameter  | Type     | Required | Description                                 |
| ---------- | -------- | -------- | ------------------------------------------- |
| `device`   | `string` | Yes      | Input device                                |
| `duration` | `number` | No       | How long to hold in seconds (default: 0.15) |

## Gamepad

Controllers only — not available for hand tracking.

### `xr_get_gamepad_state`

Get the full gamepad state including all buttons and axes.

Button indices: 0=trigger, 1=squeeze, 2=thumbstick press, 3=A/X, 4=B/Y, 5=thumbrest.

| Parameter | Type     | Required | Description                             |
| --------- | -------- | -------- | --------------------------------------- |
| `device`  | `string` | Yes      | `controller-left` or `controller-right` |

### `xr_set_gamepad_state`

Set gamepad button and axis values by index.

| Parameter | Type                         | Required | Description                                         |
| --------- | ---------------------------- | -------- | --------------------------------------------------- |
| `device`  | `string`                     | Yes      | `controller-left` or `controller-right`             |
| `buttons` | `[{index, value, touched?}]` | No       | Button states to set                                |
| `axes`    | `[{index, value}]`           | No       | Axis values to set (0=thumbstick X, 1=thumbstick Y) |

## Device State

### `xr_get_device_state`

Get comprehensive state of the XR device including headset position, controller/hand transforms, input mode, FOV, and stereo settings.

**Parameters:** None

### `xr_set_device_state`

Set device state. When called with no `state` parameter, resets everything to defaults.

| Parameter | Type     | Required | Description                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------ |
| `state`   | `object` | No       | Partial device state with `headset`, `inputMode`, `stereoEnabled`, `fov`, `controllers`, `hands` |

## Browser

### `browser_screenshot`

Capture a screenshot of the browser. Returns the image as inline base64 PNG.

**Parameters:** None

### `browser_get_console_logs`

Get console logs from the browser with optional filtering. Excludes debug level by default.

| Parameter | Type                   | Required | Description                                              |
| --------- | ---------------------- | -------- | -------------------------------------------------------- |
| `count`   | `number`               | No       | Maximum number of logs to return (most recent N)         |
| `level`   | `string` or `string[]` | No       | Filter by level: `log`, `info`, `warn`, `error`, `debug` |
| `pattern` | `string`               | No       | Regex pattern to filter log messages                     |
| `since`   | `number`               | No       | Return logs since this timestamp (ms since epoch)        |

### `browser_reload_page`

Reload the browser page to reset application state.

**Parameters:** None

## Scene Inspection

These tools require IWSDK's `MCPRuntime` (automatically available in IWSDK projects).

### `scene_get_hierarchy`

Get the Three.js scene hierarchy as a JSON tree. Returns object names, UUIDs, types, and entity indices where available.

| Parameter  | Type     | Required | Description                                                    |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| `parentId` | `string` | No       | UUID of parent Object3D to start from (defaults to scene root) |
| `maxDepth` | `number` | No       | Maximum depth to traverse (default: 5)                         |

### `scene_get_object_transform`

Get local and global transforms of an Object3D. Includes `positionRelativeToXROrigin` which can be used directly with `xr_look_at`.

| Parameter | Type     | Required | Description                                       |
| --------- | -------- | -------- | ------------------------------------------------- |
| `uuid`    | `string` | Yes      | UUID of the Object3D (from `scene_get_hierarchy`) |

## ECS Debugging

These tools require IWSDK's `MCPRuntime`.

### `ecs_pause`

Pause ECS system updates. The render loop continues (XR session stays alive, screenshots still work) but no systems tick.

**Parameters:** None

### `ecs_resume`

Resume ECS system updates after pausing. The first frame uses a capped delta to avoid physics explosions.

**Parameters:** None

### `ecs_step`

Advance N ECS frames with a fixed timestep while paused. Must call `ecs_pause` first.

| Parameter | Type     | Required | Description                                                            |
| --------- | -------- | -------- | ---------------------------------------------------------------------- |
| `count`   | `number` | No       | Number of frames to advance (1-120, default: 1)                        |
| `delta`   | `number` | No       | Fixed timestep in seconds (default: 1/72, matching Quest refresh rate) |

### `ecs_query_entity`

Get all component data for an entity.

| Parameter     | Type       | Required | Description                                                      |
| ------------- | ---------- | -------- | ---------------------------------------------------------------- |
| `entityIndex` | `number`   | Yes      | Entity index (from `scene_get_hierarchy` or `ecs_find_entities`) |
| `components`  | `string[]` | No       | Specific component IDs to include (defaults to all)              |

### `ecs_find_entities`

Find entities by component composition and/or name.

| Parameter           | Type       | Required | Description                                  |
| ------------------- | ---------- | -------- | -------------------------------------------- |
| `withComponents`    | `string[]` | No       | Component IDs entities must have (AND logic) |
| `withoutComponents` | `string[]` | No       | Component IDs entities must NOT have         |
| `namePattern`       | `string`   | No       | Regex to match against entity Object3D name  |
| `limit`             | `number`   | No       | Maximum results (1-50, default: 50)          |

### `ecs_list_systems`

List all registered ECS systems with name, priority, pause state, config keys, and query entity counts.

**Parameters:** None

### `ecs_list_components`

List all registered ECS components with their field schemas (type and default value).

**Parameters:** None

### `ecs_toggle_system`

Pause or resume a specific ECS system by name.

| Parameter | Type      | Required | Description                                         |
| --------- | --------- | -------- | --------------------------------------------------- |
| `name`    | `string`  | Yes      | System class name (e.g., `OrbSystem`)               |
| `paused`  | `boolean` | No       | `true` to pause, `false` to resume. Omit to toggle. |

### `ecs_set_component`

Set a component field value on an entity.

| Parameter     | Type     | Required | Description                                                                           |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| `entityIndex` | `number` | Yes      | Entity index                                                                          |
| `componentId` | `string` | Yes      | Component ID (e.g., `Orb`, `Transform`)                                               |
| `field`       | `string` | Yes      | Field name within the component                                                       |
| `value`       | `any`    | Yes      | New value. Scalars: number/string/boolean. Vectors: array (e.g., `[1,2,3]` for Vec3). |

### `ecs_snapshot`

Capture a snapshot of all ECS entity/component state. Stores up to 2 snapshots.

| Parameter | Type     | Required | Description                                         |
| --------- | -------- | -------- | --------------------------------------------------- |
| `label`   | `string` | No       | Label for this snapshot (auto-generated if omitted) |

### `ecs_diff`

Compare two ECS snapshots. Shows added/removed/changed entities and field-level diffs.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| `from`    | `string` | Yes      | Label of the "before" snapshot |
| `to`      | `string` | Yes      | Label of the "after" snapshot  |
