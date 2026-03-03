---
name: test-all
description: Master orchestrator that runs ALL 9 test skills in parallel across all examples. Handles the full lifecycle — prerequisites check, build, example setup, dev servers, sub-Claude test sessions, polling, cleanup, and aggregate reporting. Each test gets its own example directory and dev server for maximum parallelism.
disable-model-invocation: true
---

# Test All — Full Parallel QA Orchestrator

Runs all 9 test skills simultaneously, each in its own example directory with its own dev server and MCP connection. Produces an aggregate pass/fail summary.

**Estimated wall-clock time:** ~10 minutes
**Estimated cost:** ~$20 (9 parallel sub-Claude sessions)

---

## Phase 1: Prerequisites

Verify tooling before doing anything else.

```bash
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
if [ -z "$NODE_VERSION" ]; then
  echo "ERROR: node is not installed"; exit 1
fi
MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
MINOR=$(echo $NODE_VERSION | cut -d. -f2)
if [ "$MAJOR" -lt 20 ] || ([ "$MAJOR" -eq 20 ] && [ "$MINOR" -lt 19 ]); then
  echo "ERROR: node >= 20.19.0 required, found $NODE_VERSION"; exit 1
fi
echo "node $NODE_VERSION OK"

pnpm --version > /dev/null 2>&1 || { echo "ERROR: pnpm is not installed"; exit 1; }
echo "pnpm $(pnpm --version) OK"
```

**Stop on failure** — do not proceed without correct tooling.

---

## Phase 2: Build

From the repository root:

```bash
pnpm install
pnpm build:tgz
```

Both must succeed. **Stop on failure.**

---

## Phase 3: Prepare Example Directories

### 3a: Clone 4 copies of poke

Each poke-based test needs its own directory so all 9 tests can run in parallel (each needs its own dev server and MCP connection).

```bash
for variant in poke-ecs poke-environment poke-level poke-ui; do
  rsync -a --exclude='node_modules' --exclude='package-lock.json' --exclude='dist' \
    examples/poke/ examples/$variant/
done
```

This takes ~1 second per copy (excludes heavy directories).

### 3b: Fresh install all 9 examples in parallel

```bash
for dir in poke poke-ecs poke-environment poke-level poke-ui audio grab locomotion physics; do
  (cd examples/$dir && npm run fresh:install) &
done
wait
```

All 9 install concurrently. Wait for all to complete before proceeding.

---

## Phase 4: Launch 9 Dev Servers

Start all dev servers in background. Vite auto-assigns ports (8081, 8082, ...). The `iwsdkDev` vite plugin writes the actual port into each example's `.mcp.json`.

**IMPORTANT:** Use `pwd` to capture the repo root as an absolute path (`ROOT`), then use `$ROOT` for all file existence checks. This prevents cwd drift across separate Bash tool invocations from causing false negatives.

```bash
ROOT=$(pwd)
for dir in poke poke-ecs poke-environment poke-level poke-ui audio grab locomotion physics; do
  rm -f "$ROOT/examples/$dir/.mcp.json"
  (cd "$ROOT/examples/$dir" && npm run dev > /tmp/dev-$dir.log 2>&1) &
done
```

Wait 15 seconds for dev servers to start, then manually verify each `.mcp.json` exists:

```bash
sleep 15
```

After the sleep, use `ls -la` to check each file individually — do NOT use a script or loop. Just run:

```bash
ls -la examples/poke/.mcp.json examples/poke-ecs/.mcp.json examples/poke-environment/.mcp.json examples/poke-level/.mcp.json examples/poke-ui/.mcp.json examples/audio/.mcp.json examples/grab/.mcp.json examples/locomotion/.mcp.json examples/physics/.mcp.json
```

All 9 should appear. If any are missing, wait another 10 seconds and check the missing ones again. If still missing after that, check the dev server log (`/tmp/dev-<name>.log`) for that example and stop.

---

## Phase 5: Launch 9 Sub-Claude Tests

Launch all 9 simultaneously as background processes. **IMPORTANT:** Use subshells `(cd ... && ...)` so the working directory stays at the repo root — bare `cd` would shift the cwd and break relative paths in later phases.

```bash
# Poke-based tests (each in its own clone)
(cd examples/poke && unset CLAUDECODE && claude -p "/test-interactions" --max-turns 300 --output-format json > /tmp/test-interactions.json 2>&1) &
(cd examples/poke-ecs && unset CLAUDECODE && claude -p "/test-ecs-core" --max-turns 80 --output-format json > /tmp/test-ecs-core.json 2>&1) &
(cd examples/poke-environment && unset CLAUDECODE && claude -p "/test-environment" --max-turns 60 --output-format json > /tmp/test-environment.json 2>&1) &
(cd examples/poke-level && unset CLAUDECODE && claude -p "/test-level" --max-turns 60 --output-format json > /tmp/test-level.json 2>&1) &
(cd examples/poke-ui && unset CLAUDECODE && claude -p "/test-ui" --max-turns 60 --output-format json > /tmp/test-ui.json 2>&1) &

# Feature-specific tests
(cd examples/audio && unset CLAUDECODE && claude -p "/test-audio" --max-turns 60 --output-format json > /tmp/test-audio.json 2>&1) &
(cd examples/grab && unset CLAUDECODE && claude -p "/test-grab" --max-turns 80 --output-format json > /tmp/test-grab.json 2>&1) &
(cd examples/locomotion && unset CLAUDECODE && claude -p "/test-locomotion" --max-turns 80 --output-format json > /tmp/test-locomotion.json 2>&1) &
(cd examples/physics && unset CLAUDECODE && claude -p "/test-physics" --max-turns 60 --output-format json > /tmp/test-physics.json 2>&1) &
```

### Turn limits (calibrated from live testing)

| Test Skill | Max Turns | Observed Turns | Rationale |
|---|---|---|---|
| test-interactions | 300 | 101 (hit limit at 100) | 12 suites, many MCP calls, needs headroom under contention |
| test-ecs-core | 80 | 37 | 8 suites, multi-step sequences |
| test-environment | 60 | 18 | 6 suites, mostly queries |
| test-level | 60 | 17 | 5 suites, mostly queries |
| test-ui | 60 | 20 | 6 suites, queries + screenshot |
| test-audio | 60 | 34 | 6 suites, play/stop cycles |
| test-grab | 80 | 54 | 5 suites, complex grab sequences with snapshots |
| test-locomotion | 80 | 50 | 6 suites, screenshot-heavy |
| test-physics | 60 | 30 | 5 suites, pause/step sequences |

---

## Phase 6: Wait & Poll

### Wait 5 minutes before the first poll

Tests typically complete in 5-10 minutes. Wait 5 minutes before checking.

```bash
sleep 300
```

### Then poll every 60 seconds

To poll, manually check the file size of each test output file. A file larger than ~400 bytes means the sub-Claude session has finished and written its JSON output. Do NOT use a Python script — just check manually:

```bash
ls -la /tmp/test-interactions.json /tmp/test-ecs-core.json /tmp/test-environment.json /tmp/test-level.json /tmp/test-ui.json /tmp/test-audio.json /tmp/test-grab.json /tmp/test-locomotion.json /tmp/test-physics.json
```

- A file with size > 400 bytes = **complete** (the sub-Claude session wrote its JSON result)
- A file with size 0 or very small = **still running**

If all 9 files are > 400 bytes, proceed to Phase 7. Otherwise, wait 60 seconds and check again:

```bash
sleep 60
```

Continue polling every 60 seconds until all 9 are done. **Timeout at 25 minutes total** (20 minutes of polling after the initial 5-minute wait).

---

## Phase 7: Cleanup & Report

### 7a: Kill all dev servers

```bash
lsof -i :8081-8100 -sTCP:LISTEN -P 2>/dev/null | awk '{print $2}' | grep -v PID | sort -u | xargs kill 2>/dev/null
```

### 7b: Delete poke clones

**Use absolute paths** to avoid cwd drift from Phase 5 `cd` commands:

```bash
ROOT=$(pwd)
rm -rf "$ROOT/examples/poke-ecs" "$ROOT/examples/poke-environment" "$ROOT/examples/poke-level" "$ROOT/examples/poke-ui"
```

### 7c: Parse results and print grand summary

Use this **single Python script**:

```python
python3 -c "
import json, os
tests = [
    ('test-interactions', 'poke'),
    ('test-ecs-core', 'poke-ecs'),
    ('test-environment', 'poke-environment'),
    ('test-level', 'poke-level'),
    ('test-ui', 'poke-ui'),
    ('test-audio', 'audio'),
    ('test-grab', 'grab'),
    ('test-locomotion', 'locomotion'),
    ('test-physics', 'physics'),
]
print('=' * 75)
print('GRAND SUMMARY — ALL 9 TEST SKILLS (PARALLEL RUN)')
print('=' * 75)
total_pass = 0
total_cost = 0
for name, example in tests:
    f = f'/tmp/{name}.json'
    try:
        content = open(f).read()
        data = json.loads(content[content.find('{'):])
        r = data.get('result','')
        turns = data.get('num_turns','?')
        cost = data.get('total_cost_usd', 0)
        subtype = data.get('subtype','')
        total_cost += cost
        if subtype == 'error_max_turns':
            status = 'MAX_TURNS'
        elif 'FAIL' in r:
            status = 'FAIL'
        elif 'PASS' in r:
            status = 'PASS'
            total_pass += 1
        elif r:
            status = 'DONE'
        else:
            status = 'EMPTY'
        pass_c = r.count('**PASS**') + r.count('| PASS')
        fail_c = r.count('**FAIL**') + r.count('| FAIL')
        skip_c = r.count('SKIP')
        suites = f'{pass_c}P'
        if fail_c: suites += f'/{fail_c}F'
        if skip_c: suites += f'/{skip_c}S'
        print(f'{name:20s} | {example:18s} | {status:10s} | {suites:8s} | {turns:>3} turns | \${cost:.2f}')
    except Exception as e:
        print(f'{name:20s} | {example:18s} | ERROR      |          |         | {e}')
print('=' * 75)
print(f'Result: {total_pass}/9 PASS | Total cost: \${total_cost:.2f}')
print('=' * 75)
"
```

---

## How It Works

1. **Each test gets its own directory** — poke is cloned 4 times so all 5 poke-based tests run independently
2. **Each directory gets its own dev server** — Vite auto-assigns ports (8081, 8082, 8083, ...)
3. **Each dev server generates its own `.mcp.json`** — the vite plugin writes the actual port
4. **Each sub-Claude discovers its own `.mcp.json`** — connects to the correct dev server automatically
5. **No port conflicts** — all 9 run simultaneously without interference

## Key Technical Details

- `unset CLAUDECODE` bypasses the nesting guard that prevents Claude from running inside another Claude session
- `--output-format json` produces structured output; all intermediate work is captured in the JSON `result` field
- Polling is done with a simple `ls -la` of the 9 output files — no scripts needed
- Dev servers are killed by port range, not by PID tracking
- Poke clones are deleted after tests complete — they are temporary test fixtures
