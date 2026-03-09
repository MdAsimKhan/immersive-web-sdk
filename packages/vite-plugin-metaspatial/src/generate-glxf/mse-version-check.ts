/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import fs from 'fs-extra';
import { getHighestVersion } from './cli-path-resolver.js';

type Platform = 'darwin' | 'win32' | 'linux';

const MSE_MIN_VERSION = '14.0.0';

const MSE_DOWNLOAD_URLS = {
  darwin:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-mac',
  win32:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-windows',
  linux:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-linux',
  default: 'https://developers.meta.com/horizon/downloads/spatial-sdk/',
} as const;

const MSE_INSTALL_PATHS = {
  darwin: '/Applications/Meta Spatial Editor.app',
  win32: 'C:\\Program Files\\Meta Spatial Editor',
  linux: `${process.env.HOME}/.local/lib/meta-spatial-editor-cli`,
} as const;

const MSE_LINUX_CLI_NAME = 'MetaSpatialEditorCLI';

function detectPlatform(): Platform {
  const p = process.platform;
  return p === 'darwin' || p === 'win32' ? p : 'linux';
}

function getDownloadUrl(platform?: Platform): string {
  const p = platform || detectPlatform();
  return MSE_DOWNLOAD_URLS[p] || MSE_DOWNLOAD_URLS.default;
}

/** Normalize version to major.minor.patch */
function normalizeVersion(v: string): string {
  const parts = v.split('.');
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
}

/** Compare two semver-like version strings. Returns true if installed >= required. */
function isVersionSufficient(installed: string, required: string): boolean {
  const iParts = normalizeVersion(installed).split('.').map(Number);
  const rParts = normalizeVersion(required).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (iParts[i] > rParts[i]) return true;
    if (iParts[i] < rParts[i]) return false;
  }
  return true; // equal
}

function getMacOSAppVersion(appPath: string): string | null {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  try {
    const output = execSync(
      `plutil -extract CFBundleShortVersionString raw "${plistPath}"`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    return output.trim();
  } catch {
    return null;
  }
}

function getWindowsAppVersion(basePath: string): string | null {
  const highestVersion = getHighestVersion(basePath);
  if (!highestVersion) return null;
  const vNum = parseInt(highestVersion.substring(1), 10);
  return `${vNum}.0.0`;
}

function parseVersionFromOutput(output: string): string | null {
  const match = output.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function detectMSEVersion(platform: Platform): string | null {
  if (platform === 'linux') {
    const cliPath = path.join(MSE_INSTALL_PATHS.linux, MSE_LINUX_CLI_NAME);

    if (fs.existsSync(cliPath)) {
      try {
        const output = execSync(`"${cliPath}" --version`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        return parseVersionFromOutput(output);
      } catch {
        return null;
      }
    }

    try {
      const output = execSync('MetaSpatialEditorCLI --version', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return parseVersionFromOutput(output);
    } catch {
      return null;
    }
  }

  const installPath = MSE_INSTALL_PATHS[platform];
  if (!installPath || !fs.existsSync(installPath)) return null;

  return platform === 'darwin'
    ? getMacOSAppVersion(installPath)
    : getWindowsAppVersion(installPath);
}

/**
 * Verify MSE version before GLXF generation.
 * Throws if the installed version is below MSE_MIN_VERSION.
 */
export function verifyMSEVersion(): void {
  const platform = detectPlatform();
  const downloadUrl = getDownloadUrl(platform);
  const version = detectMSEVersion(platform);

  if (version === null) {
    // Can't detect version -- skip check silently (CLI path validation will catch missing installs)
    return;
  }

  if (!isVersionSufficient(version, MSE_MIN_VERSION)) {
    throw new Error(
      [
        '',
        `❌  Meta Spatial Editor version ${version} is outdated.`,
        `   Minimum required version: ${MSE_MIN_VERSION}`,
        '',
        '   GLXF generation cannot proceed with an outdated version.',
        '',
        '📥 Please update Meta Spatial Editor:',
        `   ${downloadUrl}`,
        '',
      ].join('\n'),
    );
  }

  console.log(
    `✅ Meta Spatial Editor version ${version} (minimum: ${MSE_MIN_VERSION})`,
  );
}
