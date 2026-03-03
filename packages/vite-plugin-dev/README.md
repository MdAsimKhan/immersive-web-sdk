# @iwsdk/vite-plugin-dev

Vite plugin for IWSDK development — XR emulation, AI agent tooling, and Playwright browser.

## Features

- 🥽 **Device Emulation** — Emulate Meta Quest 2, Quest 3, Quest Pro, or Quest 1 via [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime)
- 🏠 **Synthetic Environments** — Optional room-scale environments for AR testing
- 🤖 **AI Agent Tooling** — MCP-based tools for Claude Code, Cursor, Copilot, and Codex
- 🖥️ **Managed Browser** — Playwright browser for screenshots and console capture
- 🔧 **Zero Config** — Works out of the box with sensible defaults

## Installation

```bash
npm install -D @iwsdk/vite-plugin-dev
```

## Quick Start

```javascript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      verbose: true,
    }),
  ],
});
```

## Configuration Options

```javascript
iwsdkDev({
  emulator: {
    // XR device to emulate
    // Options: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1'
    device: 'metaQuest3', // default

    // Synthetic environment for AR room simulation
    // Options: 'living_room' | 'meeting_room' | 'music_room' | 'office_large' | 'office_small'
    environment: 'living_room',

    // When to activate emulation
    // 'localhost' - only on localhost/127.0.0.1 (default)
    // 'always' - always activate
    // RegExp - custom hostname pattern
    activation: 'localhost',

    // Inject during production build (not just dev)
    injectOnBuild: false, // default

    // User-Agent pattern to skip (avoids injection on real XR browsers)
    userAgentException: /OculusBrowser/, // default
  },

  ai: {
    // Run browser in headless mode
    headless: false, // default

    // Which AI tools to generate MCP config for
    tools: ['claude', 'cursor', 'copilot', 'codex'], // default

    // Browser viewport / screenshot resolution
    viewport: { width: 800, height: 800 }, // default
  },

  // Enable verbose logging
  verbose: false, // default
});
```

## Usage Examples

### Basic VR Development

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
});
```

### AR Development with Synthetic Environment

```javascript
iwsdkDev({
  emulator: {
    device: 'metaQuest3',
    environment: 'living_room',
  },
});
```

### Headless AI Agent Mode

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
  ai: { headless: true },
});
```

### Disable AI Tooling

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
  ai: false,
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  iwsdkDev,
  type DevPluginOptions,
  type EmulatorOptions,
  type AiOptions,
} from '@iwsdk/vite-plugin-dev';
```

## License

MIT © Meta Platforms, Inc.
