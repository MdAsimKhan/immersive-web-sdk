#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { Command } from 'commander';
import semver from 'semver';
import {
  installDependencies,
  printNextSteps,
  printPrerequisites,
} from './installer.js';
import { promptFlow } from './prompts.js';
import {
  DEFAULT_ASSETS_BASE,
  fetchRecipesIndex,
  fetchRecipeByFileName,
} from './recipes.js';
import {
  detectMSEVersion,
  detectPlatform,
  isVersionSufficient,
} from './mse-installer.js';
import { MSE_MIN_VERSION } from './mse-config.js';
import { scaffoldProject } from './scaffold.js';
import { MSEInstallResult, PromptResult, TriState, VariantId } from './types.js';
import { VERSION, NODE_ENGINE } from './version.js';

type CliOptions = {
  yes?: boolean;
  assetsBase?: string;
  mode?: 'vr' | 'ar';
  language?: 'ts' | 'js';
  metaspatial?: boolean;
  install?: boolean;
  git?: boolean;
  locomotion?: boolean;
  grabbing?: boolean;
  physics?: boolean;
  sceneUnderstanding?: boolean;
  environmentRaycast?: boolean;
};

async function main() {
  // Enforce Node engines range from generated version.ts
  const nodeVer = process.versions.node;
  const requiredRange = NODE_ENGINE;
  if (!semver.satisfies(nodeVer, requiredRange, { includePrerelease: true })) {
    console.error(
      chalk.red(
        `Unsupported Node.js version: ${nodeVer}.\nRequires Node ${requiredRange}. Please upgrade (e.g., via nvm or Volta) and try again.`,
      ),
    );
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkgPath = join(__dirname, '../package.json');
  let version = '0.0.0';
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    version = JSON.parse(raw).version ?? version;
  } catch {}

  // Print banner
  const banner = `                                                 
▄▄▄▄▄▄  ▄▄      ▄▄   ▄▄▄▄    ▄▄▄▄▄     ▄▄   ▄▄▄ 
▀▀██▀▀  ██      ██ ▄█▀▀▀▀█   ██▀▀▀██   ██  ██▀  
  ██    ▀█▄ ██ ▄█▀ ██▄       ██    ██  ██▄██    
  ██     ██ ██ ██   ▀████▄   ██    ██  █████    
  ██     ███▀▀███       ▀██  ██    ██  ██  ██▄  
▄▄██▄▄   ███  ███  █▄▄▄▄▄█▀  ██▄▄▄██   ██   ██▄ 
▀▀▀▀▀▀   ▀▀▀  ▀▀▀   ▀▀▀▀▀    ▀▀▀▀▀     ▀▀    ▀▀
===============================================
IWSDK Create CLI v${VERSION}\nNode ${process.version}`;
  console.log(banner);

  const program = new Command();
  let nameArg: string | undefined;
  let cliOpts: CliOptions = {};

  program
    .name('Create IWSDK')
    .description('Official CLI for creating Immersive Web SDK projects')
    .version(version)
    .argument('[name]', 'Project name')
    .option('--assets-base <url>', 'Override CDN base for recipes and assets')
    .option('-y, --yes', 'Use defaults and skip prompts')
    .option('--mode <mode>', 'Experience mode: vr or ar', 'vr')
    .option('--language <lang>', 'Language: ts or js', 'ts')
    .option('--metaspatial', 'Use Meta Spatial Editor workflow', false)
    .option('--no-metaspatial', 'Use manual workflow (default)')
    .option('--install', 'Install dependencies after scaffolding', true)
    .option('--no-install', 'Skip dependency installation')
    .option('--git', 'Initialize git repository', true)
    .option('--no-git', 'Skip git initialization')
    .option('--locomotion', 'Enable locomotion feature', true)
    .option('--no-locomotion', 'Disable locomotion feature')
    .option('--grabbing', 'Enable grabbing feature', true)
    .option('--no-grabbing', 'Disable grabbing feature')
    .option('--physics', 'Enable physics feature', false)
    .option('--no-physics', 'Disable physics feature (default)')
    .option('--scene-understanding', 'Enable scene understanding (AR mode)', true)
    .option('--no-scene-understanding', 'Disable scene understanding')
    .option('--environment-raycast', 'Enable environment raycast (AR mode)', true)
    .option('--no-environment-raycast', 'Disable environment raycast')
    .action((n: string | undefined, opts: CliOptions) => {
      nameArg = n;
      cliOpts = opts;
    });
  program.parse(process.argv);

  try {
    // Validate flag values
    if (
      cliOpts.mode !== undefined &&
      cliOpts.mode !== 'vr' &&
      cliOpts.mode !== 'ar'
    ) {
      console.error(
        chalk.red(
          `Invalid --mode "${cliOpts.mode}". Must be "vr" or "ar".`,
        ),
      );
      process.exit(1);
    }
    if (
      cliOpts.language !== undefined &&
      cliOpts.language !== 'ts' &&
      cliOpts.language !== 'js'
    ) {
      console.error(
        chalk.red(
          `Invalid --language "${cliOpts.language}". Must be "ts" or "js".`,
        ),
      );
      process.exit(1);
    }
    if (cliOpts.assetsBase) {
      try {
        const parsed = new URL(cliOpts.assetsBase);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Protocol must be http or https');
        }
      } catch {
        console.error(
          chalk.red(
            `Invalid --assets-base URL: "${cliOpts.assetsBase}". Must be a valid http(s) URL.`,
          ),
        );
        process.exit(1);
      }
    }

    // Warn if flags are provided without --yes (they only take effect in non-interactive mode)
    const explicitFlags = [
      '--mode', '--language',
      '--metaspatial', '--no-metaspatial',
      '--install', '--no-install',
      '--git', '--no-git',
      '--locomotion', '--no-locomotion',
      '--grabbing', '--no-grabbing',
      '--physics', '--no-physics',
      '--scene-understanding', '--no-scene-understanding',
      '--environment-raycast', '--no-environment-raycast',
    ];
    const hasExplicitFlags = process.argv.some((arg) =>
      explicitFlags.includes(arg),
    );
    if (hasExplicitFlags && !cliOpts.yes) {
      console.warn(
        chalk.yellow(
          'Warning: CLI flags (--mode, --language, etc.) only take effect with -y/--yes.\n' +
            'Add -y to use non-interactive mode, or remove flags for interactive prompts.',
        ),
      );
    }

    // Build PromptResult from CLI flags or interactive prompts
    let res: PromptResult;
    if (cliOpts.yes) {
      const mode = (cliOpts.mode || 'vr') as 'vr' | 'ar';
      const language = (cliOpts.language || 'ts') as 'ts' | 'js';
      const metaspatial = cliOpts.metaspatial ?? false;

      // Meta Spatial Editor is only available as a GUI app on macOS/Windows.
      // The Linux CLI can build metaspatial projects but cannot author content.
      if (metaspatial && detectPlatform() === 'linux') {
        throw new Error(
          'Meta Spatial Editor is not available on Linux.\n' +
            'The metaspatial workflow requires macOS or Windows to author content.\n' +
            'The Linux CLI (MetaSpatialEditorCLI) is for CI/CD builds only.',
        );
      }

      const workflow = metaspatial ? 'metaspatial' : 'manual';
      const variantId = `${mode}-${workflow}-${language}` as VariantId;

      const locomotionEnabled =
        mode === 'vr' ? (cliOpts.locomotion ?? true) : false;

      // MSE detection for scripted mode (no auto-install — requires TOS consent)
      let mseInstallResult: MSEInstallResult | undefined;
      if (metaspatial) {
        const platform = detectPlatform();
        const existingVersion = await detectMSEVersion(platform);
        if (existingVersion && isVersionSufficient(existingVersion)) {
          mseInstallResult = {
            installed: true,
            version: existingVersion,
            manual: false,
          };
        } else if (existingVersion) {
          throw new Error(
            `Meta Spatial Editor ${existingVersion} is installed but version ${MSE_MIN_VERSION}+ is required.\n` +
              'Please upgrade manually, or run without --yes to upgrade interactively.\n' +
              'Download: https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-editor-overview',
          );
        } else {
          throw new Error(
            'Meta Spatial Editor is required for --metaspatial but is not installed.\n' +
              'Installation requires accepting the Terms of Service and cannot be automated with --yes.\n' +
              'Run without --yes to install interactively, or install manually:\n' +
              'https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-editor-overview',
          );
        }
      }

      res = {
        name: nameArg || 'iwsdk-app',
        id: variantId,
        installNow: cliOpts.install ?? true,
        metaspatial,
        mode,
        language,
        features: [],
        featureFlags: {
          locomotionEnabled,
          locomotionUseWorker: locomotionEnabled ? true : undefined,
          grabbingEnabled: cliOpts.grabbing ?? true,
          physicsEnabled: cliOpts.physics ?? false,
          sceneUnderstandingEnabled:
            mode === 'ar'
              ? (cliOpts.sceneUnderstanding ?? true)
              : false,
          environmentRaycastEnabled:
            mode === 'ar'
              ? (cliOpts.environmentRaycast ?? true)
              : false,
        },
        gitInit: cliOpts.git ?? true,
        xrFeatureStates:
          mode === 'ar'
            ? {
                handTracking: 'optional',
                anchors: 'optional',
                hitTest: 'optional',
                planeDetection: 'optional',
                meshDetection: 'optional',
                layers: 'optional',
              }
            : { handTracking: 'optional', layers: 'optional' },
        mseInstallResult,
      };
    } else {
      res = await promptFlow(nameArg);
    }

    // Validate project name (both interactive and non-interactive paths)
    if (!/^[a-zA-Z0-9._@-]+$/.test(res.name)) {
      throw new Error(
        `Invalid project name "${res.name}". ` +
          'Use only letters, numbers, hyphens, underscores, dots, and @.',
      );
    }

    const assetsBase = cliOpts.assetsBase || DEFAULT_ASSETS_BASE;
    // Fetch Chef recipes index and the chosen recipe (no local fallback)
    const index = await fetchRecipesIndex(assetsBase);
    const found = index.find((r) => r.id === res.id);
    if (!found) {
      throw new Error(`Recipe id ${res.id} not found in index`);
    }
    const recipe = await fetchRecipeByFileName(found.recipe, assetsBase);

    // Override Chef variables from prompts
    // Ensure edits exists
    recipe.edits = recipe.edits || {};
    // Project name
    recipe.edits['@appName'] = res.name;
    // World features (stringified JS object-literal expected by recipes)
    const ff = res.featureFlags || {
      locomotionEnabled: res.mode === 'vr',
      locomotionUseWorker: true,
      grabbingEnabled: true,
      physicsEnabled: false,
      sceneUnderstandingEnabled: false,
      environmentRaycastEnabled: false,
    };
    const locomotionLiteral = ff.locomotionEnabled
      ? ff.locomotionUseWorker
        ? '{ useWorker: true }'
        : 'true'
      : 'false';
    const sceneUnderstandingLiteral =
      res.mode === 'ar' && ff.sceneUnderstandingEnabled ? 'true' : 'false';
    const environmentRaycastLiteral =
      res.mode === 'ar' && ff.environmentRaycastEnabled ? 'true' : 'false';
    recipe.edits['@appFeaturesStr'] =
      `{ locomotion: ${locomotionLiteral}, grabbing: ${ff.grabbingEnabled ? 'true' : 'false'}, physics: ${ff.physicsEnabled ? 'true' : 'false'}, sceneUnderstanding: ${sceneUnderstandingLiteral}, environmentRaycast: ${environmentRaycastLiteral} }`;
    // XR features (tri-state -> JS object literal)
    const toFlag = (s: TriState) =>
      s === 'required'
        ? '{ required: true }'
        : s === 'optional'
          ? 'true'
          : 'false';
    const entries: string[] = [];
    for (const [k, v] of Object.entries(res.xrFeatureStates || {})) {
      entries.push(`${k}: ${toFlag(v as TriState)}`);
    }
    const xrLiteral = `{ ${entries.join(', ')} }`;
    recipe.edits['@xrFeaturesStr'] = xrLiteral;
    const outDir = join(process.cwd(), res.name);

    // Check if target directory already exists and is non-empty
    if (
      fs.existsSync(outDir) &&
      fs.readdirSync(outDir).length > 0
    ) {
      throw new Error(
        `Directory "${res.name}" already exists and is not empty. ` +
          'Please choose a different name or remove the existing directory.',
      );
    }

    await scaffoldProject(recipe, outDir);

    // 8) Git init
    if (res.gitInit) {
      try {
        const gitInit = spawn('git', ['init'], {
          cwd: outDir,
          stdio: 'ignore',
        });
        await new Promise<void>((resolve) =>
          gitInit.on('exit', () => resolve()),
        );
      } catch {}
    }

    if (res.installNow) {
      await installDependencies(outDir);
    }
    // Build prerequisites list (e.g., Meta Spatial Editor), including path-aware notes
    const prereqs = [...(res.prerequisites || [])];
    if (res.metaspatial) {
      const metaProjectPath = join(outDir, 'metaspatial');
      const metaMainPath = join(metaProjectPath, 'Main.metaspatial');

      if (res.mseInstallResult?.installed && !res.mseInstallResult.manual) {
        prereqs.push({
          level: 'info',
          message:
            `Meta Spatial Editor is ready!\n` +
            `Project Folder: ${metaProjectPath}\n` +
            `Open in Meta Spatial Editor: ${metaMainPath}`,
        });
      } else {
        prereqs.push({
          level: 'important',
          message:
            `After installing Meta Spatial Editor, open the project:\n` +
            `Project Folder: ${metaProjectPath}\n` +
            `Open in Meta Spatial Editor: ${metaMainPath}`,
        });
      }
    }
    // Print prerequisites first, then next steps
    printPrerequisites(prereqs);
    printNextSteps(res.name, res.installNow, res.actionItems || []);
  } catch (err: any) {
    console.error(chalk.red(err?.message || String(err)));
    process.exit(1);
  }
}

void main();
