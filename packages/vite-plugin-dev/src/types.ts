/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Synthetic Environment Module configuration
 * @deprecated Use `emulator.environment` instead
 */
export interface SEMOptions {
  /**
   * Default scene to load
   * @default 'living_room'
   */
  defaultScene?:
    | 'living_room'
    | 'meeting_room'
    | 'music_room'
    | 'office_large'
    | 'office_small';
}

export type AiTool = 'claude' | 'cursor' | 'copilot' | 'codex';

export type AiMode = 'agent' | 'oversight' | 'collaborate';

/**
 * AI agent tooling configuration.
 * Enables AI agent control of the emulated XR runtime via MCP + WebSocket.
 */
export interface AiOptions {
  /**
   * Usage mode:
   * - `'agent'`: Headless Playwright, fixed viewport, no DevUI. Normal browser opens for the human.
   * - `'oversight'`: Visible Playwright, freely resizable, no DevUI. Human watches the agent.
   * - `'collaborate'`: Visible Playwright, freely resizable, DevUI on. Human and agent share the session.
   * @default 'agent'
   */
  mode?: AiMode;

  /**
   * Which AI tools this workspace targets.
   * The dev server publishes this in project-local runtime session metadata.
   * The CLI uses the same tool set when it syncs canonical MCP adapter configs.
   * @default ['claude']
   */
  tools?: AiTool[];

  /**
   * Screenshot size constraint.
   * - In agent mode: sets the Playwright viewport dimensions directly.
   * - In oversight/collaborate: screenshots are downscaled to fit within
   *   this bounding box, preserving aspect ratio.
   * @default { width: 800, height: 800 }
   */
  screenshotSize?: { width?: number; height?: number };
}

/**
 * XR emulator configuration
 */
export interface EmulatorOptions {
  /**
   * XR device to emulate
   * @default 'metaQuest3'
   */
  device?: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';

  /**
   * When to activate the WebXR emulation
   * 'localhost' - only activate when running on localhost (127.0.0.1, localhost)
   * 'always' - always activate the emulation
   * RegExp - activate when hostname matches the provided regex pattern
   * @default 'localhost'
   */
  activation?: 'localhost' | 'always' | RegExp;

  /**
   * Synthetic environment to load in the emulator
   * @default undefined (no environment)
   */
  environment?:
    | 'living_room'
    | 'meeting_room'
    | 'music_room'
    | 'office_large'
    | 'office_small';

  /**
   * Inject script during build phase (in addition to dev)
   * @default false
   */
  injectOnBuild?: boolean;

  /**
   * User-Agent exception pattern. If the UA matches this RegExp, the
   * runtime will NOT be injected even if activation passes.
   * Useful to avoid injecting on real XR browsers like OculusBrowser.
   * @default /OculusBrowser/
   */
  userAgentException?: RegExp;
}

/**
 * Main plugin options interface
 */
export interface DevPluginOptions {
  /**
   * XR emulator configuration
   */
  emulator?: EmulatorOptions;

  /**
   * AI agent tooling configuration.
   * Enables AI agent control of the emulated XR runtime via MCP + WebSocket.
   * Omit to disable AI features entirely (no Playwright, no MCP bridge, no
   * runtime session publication).
   */
  ai?: AiOptions;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

/** @deprecated Use `DevPluginOptions` instead */
export type IWERPluginOptions = DevPluginOptions;

/**
 * Internal processed options with all defaults applied
 */
export interface ProcessedDevOptions {
  device: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';
  sem?: {
    defaultScene: string;
  };
  ai?: {
    mode: AiMode;
    tools: AiTool[];
    headless: boolean;
    devUI: boolean;
    viewport: { width: number; height: number } | null;
    screenshotSize: { width: number; height: number };
  };
  injectOnBuild: boolean;
  activation: 'localhost' | 'always' | RegExp;
  verbose: boolean;
  userAgentException?: RegExp | string;
}

/** @deprecated Use `ProcessedDevOptions` instead */
export type ProcessedIWEROptions = ProcessedDevOptions;

/**
 * Injection bundle result
 */
export interface InjectionBundleResult {
  code: string;
  size: number;
}
