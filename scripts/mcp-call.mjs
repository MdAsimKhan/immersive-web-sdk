#!/usr/bin/env node --no-warnings
/**
 * Thin CLI wrapper to call dev server tools via WebSocket, bypassing MCP.
 * Uses Node 22+ built-in WebSocket (browser-style API).
 *
 * Usage:
 *   node scripts/mcp-call.mjs --port 8081 --tool get_session_status
 *   node scripts/mcp-call.mjs --port 8081 --tool set_transform --args '{"device":"headset","position":{"x":0,"y":1.6,"z":0}}'
 *   node scripts/mcp-call.mjs --port 8081 --tool browser_reload_page  # MCP-style names accepted
 *   node scripts/mcp-call.mjs --port 8081 --tool browser_screenshot   # saves PNG to /tmp
 *   node scripts/mcp-call.mjs --port 8081 --tool ecs_list_systems --timeout 20000
 */

import { writeFileSync } from 'node:fs';

/**
 * Map MCP-style tool names to browser-side WS method names.
 * ECS tools (ecs_*) pass through unchanged.
 * Copied from packages/vite-plugin-dev/src/mcp-server.ts:853-875.
 */
const TOOL_TO_METHOD = {
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

const args = process.argv.slice(2);
let port = '8081';
let tool = '';
let toolArgs = '{}';
let timeoutMs = 15000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') port = args[++i];
  else if (args[i] === '--tool') tool = args[++i];
  else if (args[i] === '--args') toolArgs = args[++i];
  else if (args[i] === '--timeout') timeoutMs = parseInt(args[++i], 10);
}

if (!tool) {
  console.error('Usage: node mcp-call.mjs --port <port> --tool <method> [--args <json>] [--timeout <ms>]');
  process.exit(1);
}

// Resolve MCP-style name to WS method name
const method = TOOL_TO_METHOD[tool] ?? tool;

// Dev server uses HTTPS (mkcert), so connect via WSS
// NODE_TLS_REJECT_UNAUTHORIZED=0 for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const url = `wss://localhost:${port}/__iwer_mcp`;
const ws = new WebSocket(url);
const requestId = String(Date.now());

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ error: `timeout after ${timeoutMs}ms` }));
  ws.close();
  process.exit(1);
}, timeoutMs);

ws.addEventListener('open', () => {
  const msg = {
    id: requestId,
    method,
    params: JSON.parse(toolArgs),
  };
  ws.send(JSON.stringify(msg));
});

ws.addEventListener('message', (event) => {
  const parsed = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
  if (parsed.id === requestId) {
    clearTimeout(timeout);

    const result = parsed.result ?? parsed.error ?? parsed;

    // Screenshot: save base64 PNG to /tmp and output path instead of raw data
    if (
      (tool === 'browser_screenshot' || tool === 'screenshot') &&
      result &&
      typeof result === 'object' &&
      'imageData' in result
    ) {
      const timestamp = Date.now();
      const filePath = `/tmp/screenshot-${port}-${timestamp}.png`;
      writeFileSync(filePath, Buffer.from(result.imageData, 'base64'));
      console.log(JSON.stringify({ screenshotPath: filePath }, null, 2));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    ws.close();
    process.exit(0);
  }
});

ws.addEventListener('error', (event) => {
  clearTimeout(timeout);
  console.error(JSON.stringify({ error: event.message ?? 'WebSocket error' }));
  process.exit(1);
});
