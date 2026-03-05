#!/usr/bin/env node --no-warnings
/**
 * Dev server lifecycle script for the IWSDK test orchestrator.
 *
 * Usage:
 *   node scripts/test-servers.mjs start   — start 9 dev servers, wait for ready, output port map JSON
 *   node scripts/test-servers.mjs ports   — read .mcp.json files, output port map JSON
 *   node scripts/test-servers.mjs stop    — kill all dev servers by port
 */

import { existsSync, readFileSync, unlinkSync, openSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXAMPLES = join(ROOT, 'examples');

const ALL_DIRS = [
  'poke',
  'poke-ecs',
  'poke-environment',
  'poke-level',
  'poke-ui',
  'audio',
  'grab',
  'locomotion',
  'physics',
];

const command = process.argv[2];

if (!command || !['start', 'ports', 'stop'].includes(command)) {
  console.error('Usage: node scripts/test-servers.mjs <start|ports|stop>');
  process.exit(1);
}

/**
 * Read .mcp.json for a given example dir and extract the port.
 * Returns the port number or null if not found.
 */
function readPort(dir) {
  const mcpPath = join(EXAMPLES, dir, '.mcp.json');
  if (!existsSync(mcpPath)) return null;
  try {
    const data = JSON.parse(readFileSync(mcpPath, 'utf8'));
    const server = Object.values(data.mcpServers)[0];
    const args = server.args;
    const portIdx = args.indexOf('--port');
    return portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Read ports from all dirs, return { dir: port } map.
 */
function readAllPorts() {
  const ports = {};
  for (const dir of ALL_DIRS) {
    const port = readPort(dir);
    if (port) ports[dir] = port;
  }
  return ports;
}

if (command === 'ports') {
  const ports = readAllPorts();
  const missing = ALL_DIRS.filter((d) => !ports[d]);
  if (missing.length > 0) {
    console.error(`Missing .mcp.json for: ${missing.join(', ')}`);
  }
  // Output to stdout as JSON (this is what the orchestrator parses)
  console.log(JSON.stringify(ports, null, 2));
}

if (command === 'start') {
  // Remove existing .mcp.json files
  for (const dir of ALL_DIRS) {
    const mcpPath = join(EXAMPLES, dir, '.mcp.json');
    if (existsSync(mcpPath)) unlinkSync(mcpPath);
  }

  // Start all servers
  console.error('Starting 9 dev servers...');
  const children = [];
  for (const dir of ALL_DIRS) {
    const cwd = join(EXAMPLES, dir);
    if (!existsSync(cwd)) {
      console.error(`  ${dir}: SKIP (not found)`);
      continue;
    }

    const logPath = `/tmp/iwsdk-dev-${dir}.log`;
    const logFd = openSync(logPath, 'w');

    const child = spawn('npm', ['run', 'dev'], {
      cwd,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    children.push({ dir, pid: child.pid });
    console.error(`  ${dir}: started (pid ${child.pid})`);
  }

  // Poll for .mcp.json files
  console.error('Waiting for servers to be ready...');
  const startTime = Date.now();
  const TIMEOUT = 60_000;
  const POLL_INTERVAL = 1_000;

  while (Date.now() - startTime < TIMEOUT) {
    const ports = readAllPorts();
    const ready = Object.keys(ports).length;
    if (ready === ALL_DIRS.length) {
      console.error(`All ${ready} servers ready.`);
      // Output port map to stdout as JSON
      console.log(JSON.stringify(ports, null, 2));
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — report what's missing
  const ports = readAllPorts();
  const missing = ALL_DIRS.filter((d) => !ports[d]);
  console.error(`TIMEOUT: ${missing.length} server(s) not ready: ${missing.join(', ')}`);
  console.error('Check logs: /tmp/iwsdk-dev-<name>.log');
  // Still output whatever ports we have
  console.log(JSON.stringify(ports, null, 2));
  process.exit(1);
}

if (command === 'stop') {
  const ports = readAllPorts();
  let killed = 0;

  for (const [dir, port] of Object.entries(ports)) {
    try {
      const pids = execSync(`lsof -t -i :${port} 2>/dev/null`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);

      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), 'SIGTERM');
        } catch {
          // already dead
        }
      }
      if (pids.length > 0) {
        console.log(`${dir} (port ${port}): killed ${pids.length} process(es)`);
        killed++;
      }
    } catch {
      // lsof returned nothing — server already stopped
    }
  }

  if (killed === 0) {
    console.log('No servers were running.');
  } else {
    console.log(`Stopped ${killed} server(s).`);
  }
}
