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

/**
 * AI agent tooling configuration.
 * Enables AI agent control of the emulated XR runtime via MCP + WebSocket.
 */
export interface AiOptions {
  /**
   * Override the Vite dev server port used for the MCP WebSocket connection.
   * If not specified, the actual Vite dev server port is auto-detected.
   * You should NOT normally need to set this.
   */
  port?: number;

  /**
   * Enable verbose logging for MCP operations
   * @default false
   */
  verbose?: boolean;

  /**
   * Which AI tools to generate MCP config files for.
   * @default ['claude', 'cursor', 'copilot', 'codex']
   */
  tools?: AiTool[];

  /**
   * Run the Playwright-managed browser in headless mode (no visible window).
   * When false, the browser window is visible so you can watch the agent
   * interact with the scene.
   * @default false
   */
  headless?: boolean;

  /**
   * Browser viewport dimensions. Controls the screenshot resolution.
   * @default { width: 800, height: 800 }
   */
  viewport?: { width?: number; height?: number };
}

/** @deprecated Use `AiOptions` instead */
export type MCPOptions = AiOptions;

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
   * Pass `true` for defaults, `false` to disable, or an object for fine-grained control.
   * @default true
   */
  ai?: boolean | AiOptions;

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
  mcp?: {
    port?: number;
    verbose: boolean;
    tools: AiTool[];
    headless: boolean;
    viewport: { width: number; height: number };
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
