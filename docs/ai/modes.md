---
outline: [2, 4]
---

# Modes

IWSDK's AI integration supports three modes, each tailored to a different development workflow. The mode determines how the Playwright browser behaves, whether DevUI is shown, and whether your normal browser opens alongside it.

## Agent Mode

**Config:** `ai: { mode: 'agent' }` (default)

The AI works autonomously in a headless Playwright browser while you develop in your normal browser. This is the default and most common mode.

| Setting        | Value                                       |
| -------------- | ------------------------------------------- |
| Headless       | Yes                                         |
| Viewport       | Fixed to `screenshotSize` (default 800x800) |
| DevUI          | Off in Playwright, on in normal browser     |
| Normal browser | Opens via `server.open`                     |

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      ai: { mode: 'agent', screenshotSize: { width: 500, height: 500 } },
    }),
  ],
});
```

**Best for:** Day-to-day AI-assisted development. You write code and test in your browser; the agent operates independently in the background.

### How it works

The Playwright browser runs headlessly with a fixed viewport matching your `screenshotSize`. Screenshots are captured at exactly that resolution — no resizing needed. This keeps token usage predictable.

Your normal browser opens separately with its own XR session. It always has DevUI enabled so you can manually interact with the emulated XR runtime. The two sessions are independent.

## Oversight Mode

**Config:** `ai: { mode: 'oversight' }`

The Playwright browser is visible so you can watch the AI agent operate in real time. Useful when you want to see what the agent is doing without interfering.

| Setting        | Value                                             |
| -------------- | ------------------------------------------------- |
| Headless       | No                                                |
| Viewport       | Freely resizable                                  |
| DevUI          | Off                                               |
| Normal browser | Does not open (Playwright is the visible browser) |

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      ai: { mode: 'oversight' },
    }),
  ],
});
```

**Best for:** Watching the agent work, verifying visual behavior, debugging agent actions.

### Screenshot behavior

Since the viewport is freely resizable, screenshots may be larger than needed. IWSDK automatically downscales them to fit within the `screenshotSize` bounds (default 800x800), preserving aspect ratio. A 1920x1080 window with an 800x800 bound produces an 800x450 screenshot.

## Collaborate Mode

**Config:** `ai: { mode: 'collaborate' }`

You and the AI share the same Playwright browser session. DevUI is enabled so you can use it to position controllers, adjust transforms, and interact with the emulated XR runtime — then ask the agent to observe, learn, or continue from where you left off.

| Setting        | Value                                             |
| -------------- | ------------------------------------------------- |
| Headless       | No                                                |
| Viewport       | Freely resizable                                  |
| DevUI          | On                                                |
| Normal browser | Does not open (Playwright is the visible browser) |

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      ai: { mode: 'collaborate' },
    }),
  ],
});
```

**Best for:** Complex interactions where the human needs to help the agent. For example, manually positioning a controller with DevUI, then asking the agent to snapshot the transform and remember it for future use.

### Screenshot behavior

Same as oversight mode — screenshots are downscaled to fit within `screenshotSize`, preserving aspect ratio.

## Per-Session DevUI

Any non-Playwright browser tab you open manually will always show DevUI, regardless of mode. The mode's DevUI setting only controls whether DevUI appears in the Playwright-managed browser.

In agent mode, a normal browser opens automatically via `server.open`, so you get DevUI there by default. In oversight and collaborate modes, Playwright is the visible browser and `server.open` is suppressed — but if you navigate to the dev server URL in a separate browser window, that tab will still have DevUI enabled.

## Settings Matrix

|               | Agent                    | Oversight          | Collaborate        |
| ------------- | ------------------------ | ------------------ | ------------------ |
| `headless`    | `true`                   | `false`            | `false`            |
| `viewport`    | Fixed (`screenshotSize`) | `null` (resizable) | `null` (resizable) |
| `devUI`       | `false`                  | `false`            | `true`             |
| `server.open` | Unchanged                | `false`            | `false`            |
| Screenshot    | Exact size               | Downscaled to fit  | Downscaled to fit  |

## Configuration Reference

```typescript
interface AiOptions {
  mode?: 'agent' | 'oversight' | 'collaborate'; // default: 'agent'
  tools?: AiTool[]; // default: ['claude']
  screenshotSize?: { width?: number; height?: number }; // default: 800x800
}
```

- **`mode`** — Selects the usage mode. All internal settings (headless, devUI, viewport, server.open) are derived from the mode.
- **`tools`** — Which AI tools to generate MCP config files for. Options: `'claude'`, `'cursor'`, `'copilot'`, `'codex'`.
- **`screenshotSize`** — In agent mode, this sets the Playwright viewport directly. In oversight/collaborate, screenshots are downscaled to fit within this bounding box. If only one dimension is provided, the other mirrors it (producing a square).

Omit `ai` entirely to disable all AI features (no Playwright, no MCP configs).
