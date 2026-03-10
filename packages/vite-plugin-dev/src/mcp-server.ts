/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { reportToolCall } from './hzdb-telemetry.js';

// Parse command line arguments
const args = process.argv.slice(2);
let port = 5173; // Default Vite port
let verbose = false;
let clientVersion: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    const parsedPort = parseInt(args[i + 1], 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      port = parsedPort;
    } else {
      console.error(
        `[IWSDK-MCP] Invalid port: ${args[i + 1]}, using default ${port}`,
      );
    }
    i++;
  } else if (args[i] === '--client-version' && args[i + 1]) {
    clientVersion = args[i + 1];
    i++;
  } else if (args[i] === '--verbose') {
    verbose = true;
  }
}

/**
 * MCP Tool definitions for IWER control.
 * These map 1:1 to RemoteControlInterface methods in IWER.
 */
export const TOOLS = [
  // =============================================================================
  // Session Management
  // =============================================================================
  {
    name: 'xr_get_session_status',
    description: 'Get XR session and device status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_accept_session',
    description:
      'Accept an offered XR session (equivalent to clicking "Enter XR" button)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_end_session',
    description: 'End the current active XR session',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // =============================================================================
  // Transform Control
  // =============================================================================
  {
    name: 'xr_get_transform',
    description: 'Get position and orientation of a tracked device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to query',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_transform',
    description:
      'Set position and/or orientation of a tracked device. Position is in meters, orientation can be quaternion or euler angles (degrees).',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to move',
        },
        position: {
          type: 'object',
          description: 'World position in meters',
          properties: {
            x: { type: 'number', description: 'X position (left/right)' },
            y: {
              type: 'number',
              description: 'Y position (up/down, 1.6 is standing height)',
            },
            z: {
              type: 'number',
              description: 'Z position (forward/back, negative is forward)',
            },
          },
        },
        orientation: {
          type: 'object',
          description:
            'Rotation as quaternion {x,y,z,w} or euler angles {pitch,yaw,roll} in degrees',
          properties: {
            // Quaternion format
            x: { type: 'number', description: 'Quaternion X component' },
            y: { type: 'number', description: 'Quaternion Y component' },
            z: { type: 'number', description: 'Quaternion Z component' },
            w: { type: 'number', description: 'Quaternion W component' },
            // Euler format (degrees)
            pitch: {
              type: 'number',
              description: 'Pitch in degrees (X rotation)',
            },
            yaw: { type: 'number', description: 'Yaw in degrees (Y rotation)' },
            roll: {
              type: 'number',
              description: 'Roll in degrees (Z rotation)',
            },
          },
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_look_at',
    description: 'Orient a device to look at a specific world position',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to orient',
        },
        target: {
          type: 'object',
          description: 'World position to look at',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        moveToDistance: {
          type: 'number',
          description: 'Optional: move device to this distance from target',
        },
      },
      required: ['device', 'target'],
    },
  },
  {
    name: 'xr_animate_to',
    description:
      'Smoothly animate a device to a new position/orientation over time',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to animate',
        },
        position: {
          type: 'object',
          description: 'Target world position in meters',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        orientation: {
          type: 'object',
          description:
            'Target rotation as quaternion {x,y,z,w} or euler angles {pitch,yaw,roll} in degrees',
          properties: {
            // Quaternion format
            x: { type: 'number', description: 'Quaternion X component' },
            y: { type: 'number', description: 'Quaternion Y component' },
            z: { type: 'number', description: 'Quaternion Z component' },
            w: { type: 'number', description: 'Quaternion W component' },
            // Euler format (degrees)
            pitch: {
              type: 'number',
              description: 'Pitch in degrees (X rotation)',
            },
            yaw: { type: 'number', description: 'Yaw in degrees (Y rotation)' },
            roll: {
              type: 'number',
              description: 'Roll in degrees (Z rotation)',
            },
          },
        },
        duration: {
          type: 'number',
          description: 'Animation duration in seconds (default: 0.5)',
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Input Mode
  // =============================================================================
  {
    name: 'xr_set_input_mode',
    description: 'Switch between controller and hand tracking input modes',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['controller', 'hand'],
          description: 'Input mode to switch to',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'xr_set_connected',
    description: 'Connect or disconnect an input device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        connected: {
          type: 'boolean',
          description: 'Whether the device should be connected',
        },
      },
      required: ['device', 'connected'],
    },
  },

  // =============================================================================
  // Select/Trigger Input
  // =============================================================================
  {
    name: 'xr_get_select_value',
    description:
      'Get the current select (trigger/pinch) value for an input device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_select_value',
    description:
      'Set the select (trigger/pinch) value for an input device. Use for grab-move-release patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        value: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Select value (0=released, 1=fully pressed/pinched)',
        },
      },
      required: ['device', 'value'],
    },
  },
  {
    name: 'xr_select',
    description:
      'Perform a complete select action (press and release). Dispatches selectstart, select, selectend events.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        duration: {
          type: 'number',
          description: 'How long to hold in seconds (default: 0.15)',
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Gamepad State (Controllers only)
  // =============================================================================
  {
    name: 'xr_get_gamepad_state',
    description:
      'Get full gamepad state including all buttons and axes. Button indices in the result: 0=trigger, 1=squeeze, 2=thumbstick, 3=A/X, 4=B/Y, 5=thumbrest.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: ['controller-left', 'controller-right'],
          description: 'The controller',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_gamepad_state',
    description: 'Set gamepad button and axis values by index',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: ['controller-left', 'controller-right'],
          description: 'The controller',
        },
        buttons: {
          type: 'array',
          description: 'Button states to set',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'number',
                description:
                  'Button index (0=trigger, 1=squeeze, 2=thumbstick, 3=A/X, 4=B/Y, 5=thumbrest)',
              },
              value: { type: 'number', description: 'Button value 0-1' },
              touched: {
                type: 'boolean',
                description: 'Whether button is touched',
              },
            },
            required: ['index', 'value'],
          },
        },
        axes: {
          type: 'array',
          description: 'Axis values to set',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'number',
                description: 'Axis index (0=thumbstick X, 1=thumbstick Y)',
              },
              value: { type: 'number', description: 'Axis value -1 to 1' },
            },
            required: ['index', 'value'],
          },
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Screenshot
  // =============================================================================
  {
    name: 'browser_screenshot',
    description:
      'Capture a screenshot of the browser. Returns the image directly.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // =============================================================================
  // Device State
  // =============================================================================
  {
    name: 'xr_get_device_state',
    description:
      'Get comprehensive state of the XR device including headset, controllers, and hands',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_set_device_state',
    description:
      'Set device state. When called with no state, resets everything to defaults.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'object',
          description:
            'Partial device state to apply. Omit to reset to defaults.',
          properties: {
            headset: {
              type: 'object',
              description: 'Headset transform',
              properties: {
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                  },
                },
                orientation: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                    w: { type: 'number' },
                  },
                },
              },
            },
            inputMode: {
              type: 'string',
              enum: ['controller', 'hand'],
              description: 'Input mode',
            },
            stereoEnabled: {
              type: 'boolean',
              description: 'Whether stereo rendering is enabled',
            },
            fov: {
              type: 'number',
              description: 'Field of view in degrees',
            },
            controllers: {
              type: 'object',
              description: 'Controller states',
              properties: {
                left: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
                right: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
              },
            },
            hands: {
              type: 'object',
              description: 'Hand states',
              properties: {
                left: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
                right: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // =============================================================================
  // Console Logs (Plugin-specific, not in IWER)
  // =============================================================================
  {
    name: 'browser_get_console_logs',
    description:
      'Get console logs from the browser with optional filtering. By default excludes debug level logs.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Maximum number of logs to return (most recent N)',
        },
        level: {
          oneOf: [
            {
              type: 'string',
              enum: ['log', 'info', 'warn', 'error', 'debug'],
            },
            {
              type: 'array',
              items: {
                type: 'string',
                enum: ['log', 'info', 'warn', 'error', 'debug'],
              },
            },
          ],
          description:
            'Filter by log level(s). Default: ["log", "info", "warn", "error"] (excludes debug)',
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter log messages',
        },
        since: {
          type: 'number',
          description: 'Return logs since this timestamp (ms since epoch)',
        },
      },
    },
  },
  {
    name: 'browser_reload_page',
    description:
      'Reload the browser page to reset application state. Use when the app enters an unrecoverable state or to apply code changes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // =============================================================================
  // Framework-Specific Tools (IWSDK or any framework with FRAMEWORK_MCP_RUNTIME)
  // =============================================================================
  {
    name: 'scene_get_hierarchy',
    description:
      'Get the Three.js scene hierarchy as a JSON tree. Returns object names, UUIDs, and entity indices where available. Requires IWSDK or a framework that provides FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description:
            'UUID of parent Object3D to start from. Defaults to scene root if omitted.',
        },
        maxDepth: {
          type: 'number',
          description:
            'Maximum depth to traverse (default: 5). Use to limit context size.',
        },
      },
    },
  },
  {
    name: 'scene_get_object_transform',
    description:
      'Get local and global transforms of an Object3D. Includes positionRelativeToXROrigin which can be used directly with xr_look_at tool. Requires IWSDK or a framework that provides FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description:
            'UUID of the Object3D (get this from scene_get_hierarchy)',
        },
      },
      required: ['uuid'],
    },
  },

  // =============================================================================
  // ECS Debugging (IWSDK — requires FRAMEWORK_MCP_RUNTIME)
  // =============================================================================
  {
    name: 'ecs_pause',
    description:
      'Pause ECS system updates. The render loop continues (XR session stays alive, screenshots still work) but no systems tick. Use ecs_step to advance individual frames while paused. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_resume',
    description:
      'Resume ECS system updates after pausing. The first frame after resume uses a capped delta to avoid physics explosions. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_step',
    description:
      'Advance N ECS frames with a fixed timestep while paused. Must call ecs_pause first. Useful for frame-by-frame debugging. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of frames to advance (1-120, default: 1)',
        },
        delta: {
          type: 'number',
          description:
            'Fixed timestep in seconds for each frame (default: 1/72 ≈ 0.0139, matching Quest refresh rate)',
        },
      },
    },
  },
  {
    name: 'ecs_query_entity',
    description:
      'Get all component data for an entity. Use entityIndex from scene_get_hierarchy or ecs_find_entities. Returns serialized component values including vectors, entity refs, and Object3D references. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        entityIndex: {
          type: 'number',
          description:
            'Entity index (get this from scene_get_hierarchy or ecs_find_entities)',
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of component IDs to include. If omitted, returns all components on the entity.',
        },
      },
      required: ['entityIndex'],
    },
  },
  {
    name: 'ecs_find_entities',
    description:
      'Find entities by component composition and/or name. Returns entity indices and component lists. Use the returned entityIndex values with ecs_query_entity for detailed inspection. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        withComponents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component IDs that entities must have (AND logic)',
        },
        withoutComponents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component IDs that entities must NOT have',
        },
        namePattern: {
          type: 'string',
          description:
            'Regex pattern to match against entity Object3D name (case-insensitive)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (1-50, default: 50)',
        },
      },
    },
  },
  {
    name: 'ecs_list_systems',
    description:
      'List all registered ECS systems with name, priority, pause state, config keys, and query entity counts. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_list_components',
    description:
      'List all registered ECS components with their field schemas (type, default). Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_toggle_system',
    description:
      'Pause or resume a specific ECS system by name. Use ecs_list_systems to discover system names. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "System class name (e.g. 'OrbSystem', 'RobotSystem')",
        },
        paused: {
          type: 'boolean',
          description:
            'Set to true to pause, false to resume. If omitted, toggles current state.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'ecs_set_component',
    description:
      'Set a component field value on an entity. Scalars use setValue (with validation), vectors accept arrays. Use ecs_query_entity to inspect current values first. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        entityIndex: {
          type: 'number',
          description:
            'Entity index (from ecs_find_entities or scene_get_hierarchy)',
        },
        componentId: {
          type: 'string',
          description: "Component ID (e.g. 'Orb', 'RobotMood', 'Transform')",
        },
        field: {
          type: 'string',
          description:
            "Field name within the component (e.g. 'orbitSpeed', 'mood')",
        },
        value: {
          description:
            'New value. Scalars: number/string/boolean. Vectors: array of numbers (e.g. [1,2,3] for Vec3).',
        },
      },
      required: ['entityIndex', 'componentId', 'field', 'value'],
    },
  },
  {
    name: 'ecs_snapshot',
    description:
      'Capture a snapshot of all ECS entity/component state. Stores up to 2 snapshots. Use with ecs_diff to compare. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description:
            'Label for this snapshot (default: auto-generated). Use to reference in ecs_diff.',
        },
      },
    },
  },
  {
    name: 'ecs_diff',
    description:
      'Compare two ECS snapshots. Shows added/removed/changed entities and field-level diffs. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: "Label of the 'before' snapshot",
        },
        to: {
          type: 'string',
          description: "Label of the 'after' snapshot",
        },
      },
      required: ['from', 'to'],
    },
  },
];

/**
 * Map MCP tool names → browser-side WS method names.
 * The browser (IWER RemoteControlInterface) uses the original unprefixed names.
 * ECS tools pass through unchanged (name === method).
 */
const TOOL_TO_METHOD: Record<string, string> = {
  xr_get_session_status: 'get_session_status',
  xr_accept_session: 'accept_session',
  xr_end_session: 'end_session',
  xr_get_transform: 'get_transform',
  xr_set_transform: 'set_transform',
  xr_look_at: 'look_at',
  xr_animate_to: 'animate_to',
  xr_set_input_mode: 'set_input_mode',
  xr_set_connected: 'set_connected',
  xr_get_select_value: 'get_select_value',
  xr_set_select_value: 'set_select_value',
  xr_select: 'select',
  xr_get_gamepad_state: 'get_gamepad_state',
  xr_set_gamepad_state: 'set_gamepad_state',
  xr_get_device_state: 'get_device_state',
  xr_set_device_state: 'set_device_state',
  browser_screenshot: 'screenshot',
  browser_get_console_logs: 'get_console_logs',
  browser_reload_page: 'reload_page',
  scene_get_hierarchy: 'get_scene_hierarchy',
  scene_get_object_transform: 'get_object_transform',
};

/**
 * Tab-change tracker: processes raw browser responses and produces
 * MCP-formatted content blocks with tab-change warnings and _tab metadata.
 * Extracted for testability.
 */
export interface TabTracker {
  /** Process a raw browser response into MCP content blocks. */
  processResponse(rawResponse: {
    result?: unknown;
    _tabId?: string;
    _tabGeneration?: number;
  }): { content: Array<{ type: string; text: string }> };
  /** Get the last known tab ID. */
  getLastTabId(): string | null;
}

export function createTabTracker(): TabTracker {
  let lastTabId: string | null = null;

  function processResponse(rawResponse: {
    result?: unknown;
    _tabId?: string;
    _tabGeneration?: number;
  }): { content: Array<{ type: string; text: string }> } {
    const result = rawResponse?.result ?? rawResponse;
    const tabId = rawResponse?._tabId;
    const tabGeneration = rawResponse?._tabGeneration;
    const previousTabId = lastTabId;
    const tabChanged =
      previousTabId !== null && tabId != null && tabId !== previousTabId;
    if (tabId) {
      lastTabId = tabId;
    }

    const content: Array<{ type: string; text: string }> = [];
    if (tabChanged) {
      content.push({
        type: 'text',
        text: `WARNING: Active browser tab changed (previous: ${previousTabId}, current: ${tabId}). All previously cached state (device positions, scene hierarchy, ECS snapshots) is now invalid. Re-query any state you need before proceeding.`,
      });
    }
    content.push({
      type: 'text',
      text: JSON.stringify(
        {
          ...(typeof result === 'object' && result !== null
            ? result
            : { value: result }),
          ...(tabId ? { _tab: { id: tabId, generation: tabGeneration } } : {}),
        },
        null,
        2,
      ),
    });

    return { content };
  }

  function getLastTabId(): string | null {
    return lastTabId;
  }

  return { processResponse, getLastTabId };
}

// WebSocket connection to Vite dev server
let ws: WebSocket | null = null;
let pendingRequests: Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutHandle: ReturnType<typeof setTimeout>;
  }
> = new Map();
let requestId = 0;
let isConnected = false;

function tryConnect(protocol: 'wss' | 'ws'): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = `${protocol}://localhost:${port}/__iwer_mcp`;

    if (verbose) {
      console.error(`[IWSDK-MCP] Trying ${wsUrl}...`);
    }

    const socket = new WebSocket(wsUrl, {
      rejectUnauthorized: false,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Connection timeout for ${protocol}`));
    }, 3000);

    socket.on('open', () => {
      clearTimeout(timeout);
      ws = socket;
      isConnected = true;
      if (verbose) {
        console.error(`[IWSDK-MCP] Connected via ${protocol.toUpperCase()}`);
      }

      socket.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          const pending = pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timeoutHandle);
            pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response);
            }
          }
        } catch (error) {
          if (verbose) {
            console.error('[IWSDK-MCP] Failed to parse response:', error);
          }
        }
      });

      socket.on('close', () => {
        isConnected = false;
        if (verbose) {
          console.error('[IWSDK-MCP] Disconnected');
        }
        pendingRequests.forEach((pending) => {
          clearTimeout(pending.timeoutHandle);
          pending.reject(new Error('WebSocket connection closed'));
        });
        pendingRequests.clear();
      });

      resolve();
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      if (verbose) {
        console.error(
          `[IWSDK-MCP] ${protocol.toUpperCase()} error:`,
          error.message,
        );
      }
      reject(error);
    });
  });
}

async function connectWebSocket(): Promise<void> {
  try {
    await tryConnect('wss');
    return;
  } catch {
    if (verbose) {
      console.error('[IWSDK-MCP] WSS failed, trying WS...');
    }
  }

  try {
    await tryConnect('ws');
    return;
  } catch {
    throw new Error(
      `Failed to connect to Vite dev server on port ${port}. Is it running with MCP enabled?`,
    );
  }
}

async function sendCommand(method: string, params: unknown): Promise<unknown> {
  if (!ws || !isConnected) {
    throw new Error('Not connected to Vite dev server');
  }

  const id = `${++requestId}`;

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timeoutHandle });

    const request = {
      id,
      method,
      params: params || {},
    };

    if (verbose) {
      console.error(`[IWSDK-MCP] Sending: ${method}`, params);
    }

    ws!.send(JSON.stringify(request));
  });
}

async function main() {
  const tabTracker = createTabTracker();

  const server = new Server(
    {
      name: 'iwsdk-dev-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    // Ensure WebSocket is connected
    if (!isConnected) {
      try {
        await connectWebSocket();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        reportToolCall(
          name,
          false,
          Date.now() - startTime,
          errorMsg.slice(0, 30),
          undefined,
          clientVersion ?? undefined,
        );
        return {
          content: [
            {
              type: 'text',
              text: `Failed to connect to IWSDK dev server: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Forward the tool call — map prefixed MCP tool name to browser-side method name
    try {
      const method = TOOL_TO_METHOD[name] ?? name;
      const rawResponse = (await sendCommand(method, args)) as {
        result?: unknown;
        _tabId?: string;
        _tabGeneration?: number;
      };

      reportToolCall(
        name,
        true,
        Date.now() - startTime,
        undefined,
        undefined,
        clientVersion ?? undefined,
      );

      // Special handling for screenshot - return inline image
      const result = rawResponse?.result ?? rawResponse;
      if (
        name === 'browser_screenshot' &&
        result &&
        typeof result === 'object' &&
        'imageData' in result
      ) {
        const { imageData, mimeType } = result as {
          imageData: string;
          mimeType: string;
        };
        return {
          content: [
            {
              type: 'image' as const,
              data: imageData,
              mimeType,
            },
          ],
        };
      }

      // Standard tool response — use tabTracker for tab-change detection + _tab metadata
      return tabTracker.processResponse(rawResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      reportToolCall(
        name,
        false,
        Date.now() - startTime,
        errorMsg.slice(0, 30),
        undefined,
        clientVersion ?? undefined,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Try to connect on startup
  try {
    await connectWebSocket();
  } catch {
    if (verbose) {
      console.error(
        '[IWSDK-MCP] Initial connection failed, will retry on tool use',
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (verbose) {
    console.error('[IWSDK-MCP] MCP server started');
  }
}

main().catch((error) => {
  console.error('[IWSDK-MCP] Fatal error:', error);
  process.exit(1);
});
