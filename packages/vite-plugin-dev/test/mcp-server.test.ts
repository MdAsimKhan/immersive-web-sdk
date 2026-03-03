/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, test, expect } from 'vitest';

// Import the TOOLS array to test schema definitions
// We need to import from the source file
import { TOOLS, createTabTracker } from '../src/mcp-server.js';

describe('MCP Server Tool Schemas', () => {
  // Helper to find a tool by name
  const findTool = (name: string) => TOOLS.find((t) => t.name === name);

  describe('xr_set_transform', () => {
    test('should define orientation as object type', () => {
      const tool = findTool('set_transform');
      expect(tool).toBeDefined();

      const orientation = tool!.inputSchema.properties.orientation;
      expect(orientation).toBeDefined();
      expect(orientation.type).toBe('object');
    });

    test('should define orientation properties for quaternion format', () => {
      const tool = findTool('set_transform');
      const orientation = tool!.inputSchema.properties.orientation;

      expect(orientation.properties).toBeDefined();
      expect(orientation.properties.x).toBeDefined();
      expect(orientation.properties.y).toBeDefined();
      expect(orientation.properties.z).toBeDefined();
      expect(orientation.properties.w).toBeDefined();
    });

    test('should define orientation properties for euler format', () => {
      const tool = findTool('set_transform');
      const orientation = tool!.inputSchema.properties.orientation;

      expect(orientation.properties).toBeDefined();
      expect(orientation.properties.pitch).toBeDefined();
      expect(orientation.properties.yaw).toBeDefined();
      expect(orientation.properties.roll).toBeDefined();
    });

    test('should define position as object type with x, y, z properties', () => {
      const tool = findTool('set_transform');
      const position = tool!.inputSchema.properties.position;

      expect(position).toBeDefined();
      expect(position.type).toBe('object');
      expect(position.properties.x).toBeDefined();
      expect(position.properties.y).toBeDefined();
      expect(position.properties.z).toBeDefined();
    });
  });

  describe('xr_animate_to', () => {
    test('should define orientation as object type', () => {
      const tool = findTool('animate_to');
      expect(tool).toBeDefined();

      const orientation = tool!.inputSchema.properties.orientation;
      expect(orientation).toBeDefined();
      expect(orientation.type).toBe('object');
    });

    test('should define orientation properties for quaternion and euler formats', () => {
      const tool = findTool('animate_to');
      const orientation = tool!.inputSchema.properties.orientation;

      expect(orientation.properties).toBeDefined();
      // Quaternion
      expect(orientation.properties.x).toBeDefined();
      expect(orientation.properties.y).toBeDefined();
      expect(orientation.properties.z).toBeDefined();
      expect(orientation.properties.w).toBeDefined();
      // Euler
      expect(orientation.properties.pitch).toBeDefined();
      expect(orientation.properties.yaw).toBeDefined();
      expect(orientation.properties.roll).toBeDefined();
    });
  });

  describe('xr_set_device_state', () => {
    test('should define state as object type', () => {
      const tool = findTool('set_device_state');
      expect(tool).toBeDefined();

      const state = tool!.inputSchema.properties.state;
      expect(state).toBeDefined();
      expect(state.type).toBe('object');
    });

    test('should define state.properties with expected fields', () => {
      const tool = findTool('set_device_state');
      const state = tool!.inputSchema.properties.state;

      expect(state.properties).toBeDefined();
      expect(state.properties.headset).toBeDefined();
      expect(state.properties.inputMode).toBeDefined();
      expect(state.properties.stereoEnabled).toBeDefined();
      expect(state.properties.fov).toBeDefined();
      expect(state.properties.controllers).toBeDefined();
      expect(state.properties.hands).toBeDefined();
    });

    test('should define headset with position and orientation', () => {
      const tool = findTool('set_device_state');
      const headset = tool!.inputSchema.properties.state.properties.headset;

      expect(headset.type).toBe('object');
      expect(headset.properties.position).toBeDefined();
      expect(headset.properties.orientation).toBeDefined();
    });

    test('should define controllers with left and right', () => {
      const tool = findTool('set_device_state');
      const controllers =
        tool!.inputSchema.properties.state.properties.controllers;

      expect(controllers.type).toBe('object');
      expect(controllers.properties.left).toBeDefined();
      expect(controllers.properties.right).toBeDefined();
      expect(controllers.properties.left.properties.position).toBeDefined();
      expect(controllers.properties.left.properties.orientation).toBeDefined();
      expect(controllers.properties.left.properties.connected).toBeDefined();
    });

    test('should define hands with left and right', () => {
      const tool = findTool('set_device_state');
      const hands = tool!.inputSchema.properties.state.properties.hands;

      expect(hands.type).toBe('object');
      expect(hands.properties.left).toBeDefined();
      expect(hands.properties.right).toBeDefined();
      expect(hands.properties.left.properties.position).toBeDefined();
      expect(hands.properties.left.properties.orientation).toBeDefined();
      expect(hands.properties.left.properties.connected).toBeDefined();
    });
  });

  describe('browser_get_console_logs', () => {
    test('should document that debug is excluded by default', () => {
      const tool = findTool('get_console_logs');
      expect(tool).toBeDefined();

      // Description should mention debug exclusion
      expect(tool!.description).toContain('excludes debug');
    });

    test('should support array of levels', () => {
      const tool = findTool('get_console_logs');
      const level = tool!.inputSchema.properties.level;

      // Should have oneOf with string and array options
      expect(level.oneOf).toBeDefined();
      expect(level.oneOf.length).toBe(2);

      // First option is single string
      expect(level.oneOf[0].type).toBe('string');

      // Second option is array
      expect(level.oneOf[1].type).toBe('array');
    });
  });

  describe('browser_reload_page', () => {
    test('should exist with empty properties schema', () => {
      const tool = findTool('reload_page');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('reload_page');
      expect(tool!.inputSchema.type).toBe('object');
      expect(Object.keys(tool!.inputSchema.properties)).toHaveLength(0);
    });

    test('should mention unrecoverable state use case in description', () => {
      const tool = findTool('reload_page');
      expect(tool!.description).toContain('unrecoverable');
    });
  });

  describe('All tools with object parameters', () => {
    test('orientation parameters should be typed as object, not string', () => {
      // This is a regression test to prevent the bug where
      // orientation parameters are accidentally typed as strings
      const toolsWithOrientation = ['set_transform', 'animate_to'];

      for (const toolName of toolsWithOrientation) {
        const tool = findTool(toolName);
        expect(tool, `Tool ${toolName} should exist`).toBeDefined();

        const orientation = tool!.inputSchema.properties.orientation;
        expect(
          orientation.type,
          `${toolName}.orientation should be object type`,
        ).toBe('object');
        expect(
          orientation.properties,
          `${toolName}.orientation should have properties defined`,
        ).toBeDefined();
      }
    });

    test('state parameter in xr_set_device_state should be typed as object, not string', () => {
      const tool = findTool('set_device_state');
      expect(tool).toBeDefined();

      const state = tool!.inputSchema.properties.state;
      expect(state.type, 'state should be object type').toBe('object');
      expect(
        state.properties,
        'state should have properties defined',
      ).toBeDefined();
    });
  });

  // =============================================================================
  // Framework-Specific Tools (IWSDK)
  // =============================================================================
  describe('scene_get_hierarchy', () => {
    test('should exist and have correct schema', () => {
      const tool = findTool('get_scene_hierarchy');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('get_scene_hierarchy');
    });

    test('should have optional parentId parameter', () => {
      const tool = findTool('get_scene_hierarchy');
      const parentId = tool!.inputSchema.properties.parentId;

      expect(parentId).toBeDefined();
      expect(parentId.type).toBe('string');
      expect(tool!.inputSchema.required).toBeUndefined();
    });

    test('should have optional maxDepth parameter', () => {
      const tool = findTool('get_scene_hierarchy');
      const maxDepth = tool!.inputSchema.properties.maxDepth;

      expect(maxDepth).toBeDefined();
      expect(maxDepth.type).toBe('number');
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('get_scene_hierarchy');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  describe('scene_get_object_transform', () => {
    test('should exist and have correct schema', () => {
      const tool = findTool('get_object_transform');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('get_object_transform');
    });

    test('should require uuid parameter', () => {
      const tool = findTool('get_object_transform');
      const uuid = tool!.inputSchema.properties.uuid;

      expect(uuid).toBeDefined();
      expect(uuid.type).toBe('string');
      expect(tool!.inputSchema.required).toContain('uuid');
    });

    test('should mention positionRelativeToXROrigin in description', () => {
      const tool = findTool('get_object_transform');
      expect(tool!.description).toContain('positionRelativeToXROrigin');
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('get_object_transform');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  // =============================================================================
  // ECS Debugging Tools (IWSDK)
  // =============================================================================
  describe('ecs_pause', () => {
    test('should exist with empty properties schema', () => {
      const tool = findTool('ecs_pause');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('ecs_pause');
      expect(tool!.inputSchema.type).toBe('object');
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('ecs_pause');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  describe('ecs_resume', () => {
    test('should exist with empty properties schema', () => {
      const tool = findTool('ecs_resume');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('ecs_resume');
      expect(tool!.inputSchema.type).toBe('object');
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('ecs_resume');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  describe('ecs_step', () => {
    test('should exist with optional count and delta parameters', () => {
      const tool = findTool('ecs_step');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.type).toBe('object');

      const count = tool!.inputSchema.properties.count;
      expect(count).toBeDefined();
      expect(count.type).toBe('number');

      const delta = tool!.inputSchema.properties.delta;
      expect(delta).toBeDefined();
      expect(delta.type).toBe('number');
    });

    test('should not require any parameters', () => {
      const tool = findTool('ecs_step');
      expect(tool!.inputSchema.required).toBeUndefined();
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('ecs_step');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  describe('ecs_query_entity', () => {
    test('should exist and require entityIndex', () => {
      const tool = findTool('ecs_query_entity');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.type).toBe('object');
      expect(tool!.inputSchema.required).toContain('entityIndex');

      const entityIndex = tool!.inputSchema.properties.entityIndex;
      expect(entityIndex).toBeDefined();
      expect(entityIndex.type).toBe('number');
    });

    test('should have optional components array parameter', () => {
      const tool = findTool('ecs_query_entity');
      const components = tool!.inputSchema.properties.components;

      expect(components).toBeDefined();
      expect(components.type).toBe('array');
      expect(components.items).toEqual({ type: 'string' });
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('ecs_query_entity');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  describe('ecs_find_entities', () => {
    test('should exist with optional filter parameters', () => {
      const tool = findTool('ecs_find_entities');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.type).toBe('object');

      const props = tool!.inputSchema.properties;
      expect(props.withComponents).toBeDefined();
      expect(props.withComponents.type).toBe('array');
      expect(props.withoutComponents).toBeDefined();
      expect(props.withoutComponents.type).toBe('array');
      expect(props.namePattern).toBeDefined();
      expect(props.namePattern.type).toBe('string');
      expect(props.limit).toBeDefined();
      expect(props.limit.type).toBe('number');
    });

    test('should not require any parameters', () => {
      const tool = findTool('ecs_find_entities');
      expect(tool!.inputSchema.required).toBeUndefined();
    });

    test('should mention FRAMEWORK_MCP_RUNTIME in description', () => {
      const tool = findTool('ecs_find_entities');
      expect(tool!.description).toContain('FRAMEWORK_MCP_RUNTIME');
    });
  });

  // =============================================================================
  // Gamepad Button Index Regression Tests (Fix #1)
  // =============================================================================
  describe('gamepad button indices', () => {
    test('xr_get_gamepad_state description contains correct button index mapping', () => {
      const tool = findTool('get_gamepad_state');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('0=trigger');
      expect(tool!.description).toContain('1=squeeze');
      expect(tool!.description).toContain('2=thumbstick');
      expect(tool!.description).toContain('3=A/X');
      expect(tool!.description).toContain('4=B/Y');
      expect(tool!.description).toContain('5=thumbrest');
    });

    test('xr_set_gamepad_state button index description has correct mapping (no 2=unused, no index 6)', () => {
      const tool = findTool('set_gamepad_state');
      expect(tool).toBeDefined();

      const buttonIndex = tool!.inputSchema.properties.buttons.items.properties.index;
      expect(buttonIndex.description).toContain('0=trigger');
      expect(buttonIndex.description).toContain('1=squeeze');
      expect(buttonIndex.description).toContain('2=thumbstick');
      expect(buttonIndex.description).toContain('3=A/X');
      expect(buttonIndex.description).toContain('4=B/Y');
      expect(buttonIndex.description).toContain('5=thumbrest');
      // Regression: must NOT contain old incorrect mappings
      expect(buttonIndex.description).not.toContain('2=unused');
      expect(buttonIndex.description).not.toContain('6=');
    });
  });

  // =============================================================================
  // Select Tool Duration Regression Tests
  // =============================================================================
  describe('xr_select tool', () => {
    test('xr_select duration description says 0.15', () => {
      const tool = findTool('select');
      expect(tool).toBeDefined();

      const duration = tool!.inputSchema.properties.duration;
      expect(duration).toBeDefined();
      expect(duration.description).toContain('0.15');
    });
  });
});

describe('createTabTracker', () => {
  test('first response with _tabId does not emit WARNING', () => {
    const tracker = createTabTracker();
    const result = tracker.processResponse({
      result: { position: { x: 0, y: 0, z: 0 } },
      _tabId: 'tab-abc',
      _tabGeneration: 1,
    });

    // Only one content block (the result), no WARNING
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).not.toContain('WARNING');
  });

  test('same _tabId on consecutive responses does not emit WARNING', () => {
    const tracker = createTabTracker();

    // First call
    tracker.processResponse({
      result: { a: 1 },
      _tabId: 'tab-same',
      _tabGeneration: 1,
    });

    // Second call with same tabId
    const result = tracker.processResponse({
      result: { b: 2 },
      _tabId: 'tab-same',
      _tabGeneration: 2,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).not.toContain('WARNING');
  });

  test('different _tabId emits WARNING as first content block', () => {
    const tracker = createTabTracker();

    // First call sets the baseline
    tracker.processResponse({
      result: { a: 1 },
      _tabId: 'tab-old',
      _tabGeneration: 1,
    });

    // Second call with DIFFERENT tabId
    const result = tracker.processResponse({
      result: { b: 2 },
      _tabId: 'tab-new',
      _tabGeneration: 1,
    });

    // Should have 2 content blocks: WARNING + result
    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toContain('WARNING');
    expect(result.content[0].text).toContain('previously cached state');
  });

  test('WARNING text mentions both previous and current tab IDs correctly', () => {
    const tracker = createTabTracker();

    tracker.processResponse({
      result: {},
      _tabId: 'tab-alpha',
      _tabGeneration: 1,
    });

    const result = tracker.processResponse({
      result: {},
      _tabId: 'tab-beta',
      _tabGeneration: 1,
    });

    const warning = result.content[0].text;
    expect(warning).toContain('previous: tab-alpha');
    expect(warning).toContain('current: tab-beta');
  });

  test('_tab metadata (id + generation) included when _tabId present', () => {
    const tracker = createTabTracker();
    const result = tracker.processResponse({
      result: { value: 42 },
      _tabId: 'tab-xyz',
      _tabGeneration: 3,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._tab).toEqual({ id: 'tab-xyz', generation: 3 });
  });

  test('_tab metadata absent when _tabId not in response', () => {
    const tracker = createTabTracker();
    const result = tracker.processResponse({
      result: { value: 42 },
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._tab).toBeUndefined();
  });

  test('scalar result is wrapped in { value: ... }', () => {
    const tracker = createTabTracker();
    const result = tracker.processResponse({
      result: 'hello',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.value).toBe('hello');
  });

  test('object result fields are spread directly', () => {
    const tracker = createTabTracker();
    const result = tracker.processResponse({
      result: { x: 1, y: 2 },
      _tabId: 'tab-1',
      _tabGeneration: 1,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.x).toBe(1);
    expect(parsed.y).toBe(2);
    expect(parsed._tab).toBeDefined();
  });

  test('result with _tabId includes _tab metadata', () => {
    const tracker = createTabTracker();
    // processResponse extracts _tabId/_tabGeneration and adds _tab to the result
    const result = tracker.processResponse({
      result: {
        someData: 'test',
      },
      _tabId: 'tab-abc',
      _tabGeneration: 2,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.someData).toBe('test');
    expect(parsed._tab).toEqual({ id: 'tab-abc', generation: 2 });
  });

  test('tab change across calls emits WARNING', () => {
    const tracker = createTabTracker();

    // First call from tab A
    tracker.processResponse({
      result: { data: 'first' },
      _tabId: 'tab-A',
      _tabGeneration: 1,
    });

    // Second call from tab B
    const result = tracker.processResponse({
      result: { data: 'second' },
      _tabId: 'tab-B',
      _tabGeneration: 1,
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toContain('WARNING');
    expect(result.content[0].text).toContain('previous: tab-A');
    expect(result.content[0].text).toContain('current: tab-B');
  });

  test('getLastTabId returns null initially', () => {
    const tracker = createTabTracker();
    expect(tracker.getLastTabId()).toBeNull();
  });

  test('getLastTabId returns the most recent tabId after processing', () => {
    const tracker = createTabTracker();
    tracker.processResponse({
      result: {},
      _tabId: 'tab-latest',
      _tabGeneration: 5,
    });
    expect(tracker.getLastTabId()).toBe('tab-latest');
  });
});