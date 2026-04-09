#!/bin/bash
# Stop hook for IWSDK development
# On first stop: nudges the agent to verify testing, formatting, linting, and log MCP feedback.
# On second stop (after agent responds): lets it through.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# If we already intervened once, let it stop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# First stop attempt — send it back with checklist
cat >&2 <<'CHECKLIST'
Before finishing, please go through this checklist:

## 1. Runtime Verification
Did you verify your changes work at runtime? If you modified any packages or examples,
use the direct `iwsdk` CLI against a running dev server:

  npx iwsdk browser screenshot
  npx iwsdk browser logs
  npx iwsdk ecs systems
  npx iwsdk ecs components

If a dev server is running, take a screenshot and check console logs at minimum.
If no dev server is running and your changes are code-only (not runtime), that's OK — just confirm.

## 2. Code Quality
Run these and fix any issues:
  - `pnpm format` (Prettier formatting)
  - `pnpm lint` (ESLint)
  - `pnpm build` (TypeScript compilation / type checking)

## 3. MCP Tool Feedback
If during this session you used the direct `iwsdk` CLI / MCP tools (or wished you could) and have
any feedback about the MCP tools — missing tools, confusing APIs, tools that didn't work
as expected, or tools you wish existed — please append your feedback to:

  .claude/mcp-feedback.jsonl

Use this format (one JSON object per line):
  {"timestamp": "<ISO 8601>", "session": "<brief task description>", "tool": "<tool_name or 'general'>", "type": "<missing|bug|improvement|wish>", "feedback": "<your feedback>"}

If you have no MCP feedback, skip this step.

## 4. Confirm
After completing the above (or confirming they're not applicable), you may finish.
CHECKLIST

exit 2
