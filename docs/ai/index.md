---
outline: [2, 4]
---

# AI-Native Development

IWSDK is built from the ground up for AI-assisted immersive web development. AI agents can see, interact with, and debug your WebXR experience through 32 [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) tools — screenshots, controller input, scene inspection, ECS (Entity-Component-System) debugging, and more.

## How It Works

When you enable AI in your Vite config and start the app through the `iwsdk` CLI, the stack sets up three things automatically:

1. **[Playwright](https://playwright.dev/) Browser** — A managed Chromium instance that loads your app and provides screenshots and console capture for the AI agent.
2. **Runtime-Resolved MCP Server** — `iwsdk mcp stdio` exposes 32 tools for controlling the emulated XR runtime, inspecting the scene, and debugging ECS state by resolving the active workspace runtime created by `iwsdk dev up`.
3. **MCP Config Files** — `iwsdk adapter sync` writes workspace-based config files (for example `.mcp.json` for Claude) so your AI tool discovers that server on startup.

```text
┌──────────────────────┐
│  AI Tool             │
│  (Claude, Cursor...) │
└──────────┬───────────┘
           │ MCP protocol (stdio)
┌──────────▼───────────┐
│  iwsdk mcp stdio     │◄── screenshots, console logs
└──────────┬───────────┘
           │ WebSocket
┌──────────▼───────────┐     ┌──────────────────────┐
│  Vite Dev Server     │────►│  Normal Browser      │
│                      │     │  (developer)         │
└──────────┬───────────┘     └──────────────────────┘
           │
┌──────────▼───────────┐
│  Playwright Browser  │
│  (managed)           │
└──────────────────────┘
```

The AI agent communicates with `iwsdk mcp stdio` over stdio. `iwsdk dev up` records the active workspace runtime, and `iwsdk mcp stdio` resolves that runtime before relaying commands to the Playwright browser via WebSocket, where the IWER runtime processes them (move controllers, trigger inputs, query state). Screenshots and console logs are captured server-side through Playwright's CDP integration — no browser round-trip needed.

Your normal browser runs independently with its own XR session, so you can develop and test manually while the agent works in the background.

### Additional MCP Servers

The runtime-first adapter sync can also register optional MCP servers alongside `iwsdk`:

- **`iwsdk-rag-local`** — If `@felixtz/iwsdk-rag-mcp` is installed, a local RAG server is registered that provides semantic code search and IWSDK API knowledge. The embedding model is downloaded and cached on first startup.
- **`hzdb`** — If `@meta-quest/hzdb` is installed, the hzdb MCP server is registered. This provides Meta Quest device management, 3D asset search from Meta's asset library, and IWSDK documentation lookup.

These appear automatically in the generated MCP config files when the corresponding packages are present in `node_modules`.

## Three Modes

IWSDK supports three usage modes, each optimized for a different workflow:

| Mode            | Description                             | Playwright               | DevUI | Browser                   |
| --------------- | --------------------------------------- | ------------------------ | ----- | ------------------------- |
| **Agent**       | AI works autonomously in the background | Headless, fixed viewport | Off   | Normal browser opens      |
| **Oversight**   | You watch the AI work in real time      | Visible, resizable       | Off   | Playwright is the browser |
| **Collaborate** | You and the AI share the same session   | Visible, resizable       | On    | Playwright is the browser |

Agent mode is the default — the AI operates in a headless browser optimized for screenshots while you develop in your normal browser. Switch to oversight or collaborate when you need visibility or hands-on interaction with the agent's session.

See [Modes](./modes) for the full deep dive.

## What Can the Agent Do?

The `iwsdk` MCP server exposes tools across several categories:

- **Session** — Accept, monitor, and end XR sessions
- **Transforms** — Position and orient the headset, controllers, and hands
- **Input** — Trigger selects, manipulate gamepad buttons and axes, switch input modes
- **Browser** — Take screenshots, read console logs, reload the page
- **Scene** — Inspect the Three.js scene hierarchy and object transforms
- **ECS** — Pause/step the simulation, query entities, diff state snapshots

See [MCP Tools Reference](./mcp-tools) for the complete list.

## Next Steps

- [Getting Started](./getting-started) — Set up AI in 5 minutes
- [Modes](./modes) — Understand agent, oversight, and collaborate
- [MCP Tools Reference](./mcp-tools) — All 32 tools documented
- [Workflows](./workflows) — Practical agent workflow patterns
