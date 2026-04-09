/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  getRuntimeOperationByCliPath,
  type JsonSchema,
} from './runtime-contract.js';

function describeSchemaType(schema: JsonSchema): string {
  if (schema.enum?.length) {
    return 'enum';
  }
  if (schema.type) {
    return schema.type;
  }
  if (schema.oneOf?.length) {
    return schema.oneOf.map((entry) => describeSchemaType(entry)).join(' | ');
  }
  return 'value';
}

function formatSchemaPropertyLines(
  propertyPath: string,
  schema: JsonSchema,
  required: boolean,
  indent = 2,
): string[] {
  const prefix = ' '.repeat(indent);
  const lines = [
    `${prefix}${propertyPath}${required ? ' (required)' : ''} [${describeSchemaType(schema)}]${
      schema.description ? ` - ${schema.description}` : ''
    }`,
  ];

  if (schema.enum?.length) {
    lines.push(`${prefix}  values: ${schema.enum.join(', ')}`);
  }

  if (schema.properties) {
    const nestedRequired = new Set(schema.required ?? []);
    for (const [name, nestedSchema] of Object.entries(schema.properties)) {
      lines.push(
        ...formatSchemaPropertyLines(
          `${propertyPath}.${name}`,
          nestedSchema,
          nestedRequired.has(name),
          indent + 2,
        ),
      );
    }
  }

  if (schema.items?.enum?.length) {
    lines.push(`${prefix}  item values: ${schema.items.enum.join(', ')}`);
  }

  return lines;
}

export function buildRuntimeCommandHelp(domain: string, action: string): string[] {
  const operation = getRuntimeOperationByCliPath(domain, action);
  if (!operation) {
    return [`Unknown ${domain} command "${action}".`];
  }

  const lines = [
    `Usage: iwsdk ${domain} ${action} [--input-json <json>] [--timeout <ms>] [--raw]${
      operation.mcpName === 'browser_screenshot' ? ' [--output-file <path>]' : ''
    }`,
    '',
    `Description: ${operation.description}`,
    `MCP tool: ${operation.mcpName}`,
    `WebSocket method: ${operation.wsMethod}`,
    '',
    'Parameters:',
  ];

  const properties = operation.inputSchema.properties ?? {};
  const required = new Set(operation.inputSchema.required ?? []);
  const propertyEntries = Object.entries(properties);
  if (propertyEntries.length === 0) {
    lines.push('  (none)');
  } else {
    for (const [name, schema] of propertyEntries) {
      lines.push(...formatSchemaPropertyLines(name, schema, required.has(name)));
    }
  }

  lines.push('', 'Options:', '  --input-json <json>', '  --timeout <ms>', '  --raw');
  if (operation.mcpName === 'browser_screenshot') {
    lines.push('  --output-file <path>');
  }

  return lines;
}

export function buildMcpInspectHelp(): string[] {
  return [
    'Usage: iwsdk mcp inspect [--tool <mcpName>]',
    '',
    'Options:',
    '  --tool <mcpName>   Show description and input schema for one runtime tool',
  ];
}

export function usageLines(): string[] {
  return [
    'Usage: iwsdk <command> [subcommand] [--help]',
    '',
    'Commands:',
    '  status',
    '  dev up|down|restart|logs|open|status [--open] [--foreground]',
    '  adapter sync|status|prune',
    '  mcp stdio|inspect [--tool <mcpName>]',
    '  xr <action>',
    '  browser <action>',
    '  scene <action>',
    '  ecs <action>',
  ];
}
