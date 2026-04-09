---
outline: [2, 4]
---

# Getting Started with AI

This guide gets you from zero to a working AI-assisted dev session in about 5 minutes.

## Prerequisites

- An IWSDK project (see [Chapter 1: Project Setup](/guides/01-project-setup) if you don't have one)
- An AI tool that supports MCP: [Claude Code](https://claude.ai), [Cursor](https://cursor.sh), [GitHub Copilot](https://github.com/features/copilot), or [Codex](https://openai.com/codex)

## Enable AI

Add `ai: {}` to your `iwsdkDev()` plugin config in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: {
        device: 'metaQuest3',
      },
      ai: {}, // enables AI in agent mode with defaults
      verbose: true, // shows startup details (optional, helpful for first run)
    }),
  ],
});
```

That's it. No extra packages, no separate server — everything is handled by the plugin/runtime stack, and starter projects already ship the `iwsdk` CLI through `@iwsdk/cli`.

## Start the Dev Server

```bash
npm run dev
```

::: tip
Starter `npm run dev` routes through `iwsdk dev up --open --foreground`, which lets the CLI manage the dev-server lifecycle, MCP adapter sync, and browser opening. Vite still chooses the real port, so treat the reported runtime URL as the source of truth. The internal runtime script is `dev:runtime`; use the CLI path as the supported entrypoint.
:::

When the server starts, several things happen automatically:

1. Your normal browser opens with the app (for manual development)
2. A headless Playwright browser launches in the background (for the AI agent)
3. Canonical project-local MCP configs are synced for the configured AI tools
4. The MCP WebSocket endpoint is registered at `/__iwer_mcp`

If you need the resolved runtime URL, want to inspect adapter state explicitly, or need to confirm that the managed browser bridge is actually connected, run `npx iwsdk dev status`. The `state.browserConnected` field and `state.session.browser` block are the source of truth for browser readiness.

::: tip MCP config files are refreshed, not deleted
The managed config files (`.mcp.json`, `.cursor/mcp.json`, etc.) are intentionally left on disk and refreshed on the next run. `npm run dev` and `iwsdk adapter sync` both write the same canonical workspace-based entries.
:::

## Connect Your AI Tool

### Claude Code

Claude Code automatically discovers the `.mcp.json` file in your project root. Just open Claude Code in your project directory and it will discover the MCP server entry.

In environments that lazily load MCP tool schemas, discovery is not the same as runtime readiness:

1. Load the `mcp__iwsdk__*` tool schemas with your editor's tool-search/discovery step if needed.
2. Call `xr_get_session_status` as the first runtime check once the tool is available.
3. If MCP tools are still deferred, fall back to the CLI (`npx iwsdk xr status`, `npx iwsdk browser screenshot`, etc.) until the schemas are hydrated.

### Cursor

Cursor reads from `.cursor/mcp.json`. Set `tools` to include `'cursor'`:

```typescript
ai: { tools: ['cursor'] },
```

### GitHub Copilot

Copilot reads from `.vscode/mcp.json`:

```typescript
ai: { tools: ['copilot'] },
```

### Codex

Codex reads from `.codex/config.toml`:

```typescript
ai: { tools: ['codex'] },
```

You can also list multiple tools if you use more than one:

```typescript
ai: { tools: ['claude', 'cursor'] },
```

::: tip Important: tools default
By default, `tools` is set to `['claude']`, which means only `.mcp.json` (for Claude) is generated. If you use Cursor, Copilot, or Codex, you must add them to the `tools` array — otherwise no config file will be generated for your tool and it won't discover the MCP server.
:::

## First Interaction

Once your AI tool is connected, try these prompts:

**Take a screenshot:**

> "Take a screenshot of the current scene."

The agent will call `browser_screenshot` and show you what the headless browser sees.

**Accept the XR session:**

> "Accept the XR session so we can see the immersive experience."

The agent will call `xr_accept_session`, which is equivalent to clicking the "Enter XR" button.

**Move a controller:**

> "Position the right controller at (0.3, 1.2, -0.5) and take a screenshot."

The agent will call `xr_set_transform` to move the controller, then `browser_screenshot` to verify.

## Customize the Screenshot Size

By default, screenshots are 800x800 pixels. You can adjust this to control token usage:

```typescript
ai: {
  mode: 'agent',
  screenshotSize: { width: 500, height: 500 },  // smaller = fewer tokens
},
```

## What's Next

- [Modes](./modes) — Learn about oversight and collaborate modes
- [MCP Tools Reference](./mcp-tools) — See all 32 tools available to the agent
- [Workflows](./workflows) — Common agent workflow patterns
