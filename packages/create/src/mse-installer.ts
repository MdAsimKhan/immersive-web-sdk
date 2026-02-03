/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { XMLParser } from 'fast-xml-parser';
import ora, { Ora } from 'ora';
import prompts from 'prompts';
import semver from 'semver';
import {
  getAppcastUrl,
  MSE_DOWNLOAD_URLS,
  MSE_MIN_VERSION,
  MSE_TOS_CONTENT,
  MSE_INSTALL_PATHS,
  MSE_LINUX_CLI_NAME,
} from './mse-config.js';
import type { MSEInstallResult, Platform } from './types.js';

interface AppcastRelease {
  downloadUrl: string;
  version: string | null;
  buildNumber: string | null;
}

/** Normalize version to major.minor.patch for comparison */
export function normalizeVersion(v: string): string {
  const parts = v.split('.');
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
}

export function detectPlatform(): Platform {
  const p = process.platform;
  return p === 'darwin' || p === 'win32' ? p : 'linux';
}

async function fetchAppcastRelease(platform: Platform): Promise<AppcastRelease | null> {
  try {
    const response = await fetch(getAppcastUrl(platform), {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(chalk.yellow(`Warning: Failed to fetch appcast: HTTP ${response.status}`));
      return null;
    }

    const xmlContent = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const parsed = parser.parse(xmlContent);

    // Navigate to enclosure element: rss > channel > item > enclosure
    const channel = parsed?.rss?.channel;
    if (!channel) {
      console.warn(chalk.yellow('Warning: Invalid appcast format - missing channel'));
      return null;
    }

    // Handle both single item and array of items
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    const item = items[0];
    if (!item?.enclosure) {
      console.warn(chalk.yellow('Warning: No enclosure element found in appcast'));
      return null;
    }

    const enclosure = item.enclosure;
    const url = enclosure['@_url'];
    if (!url || typeof url !== 'string') {
      console.warn(chalk.yellow('Warning: No URL found in appcast enclosure'));
      return null;
    }

    const version = enclosure['@_sparkle:shortVersionString'];
    const buildNumber = enclosure['@_sparkle:version'];

    return {
      downloadUrl: url,
      version: typeof version === 'string' ? version : null,
      buildNumber: typeof buildNumber === 'string' ? buildNumber : null,
    };
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Failed to fetch appcast: ${(error as Error).message}`));
    return null;
  }
}

/** Get highest version directory (e.g., v20) from Windows install path */
function getHighestVersion(directoryPath: string): string | null {
  try {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
      .map((e) => parseInt(e.name.slice(1), 10));
    return versions.length ? `v${Math.max(...versions)}` : null;
  } catch {
    return null;
  }
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

export async function detectMSEVersion(platform: Platform): Promise<string | null> {
  if (platform === 'linux') {
    const cliPath = path.join(MSE_INSTALL_PATHS.linux, MSE_LINUX_CLI_NAME);

    if (fs.existsSync(cliPath)) {
      try {
        const output = execSync(`"${cliPath}" --version`, { encoding: 'utf-8', timeout: 5000 });
        return parseVersionFromOutput(output);
      } catch {
        return null;
      }
    }

    try {
      const output = execSync('MetaSpatialEditorCLI --version', { encoding: 'utf-8', timeout: 5000 });
      return parseVersionFromOutput(output);
    } catch {
      return null;
    }
  }

  const installPath = MSE_INSTALL_PATHS[platform];
  if (!installPath || !fs.existsSync(installPath)) return null;

  return platform === 'darwin' ? getMacOSAppVersion(installPath) : getWindowsAppVersion(installPath);
}

export function isVersionSufficient(installed: string, required: string = MSE_MIN_VERSION): boolean {
  try {
    return semver.gte(installed, required);
  } catch {
    return false;
  }
}

export async function showAndAcceptTOS(): Promise<boolean> {
  console.log('\n' + chalk.bold.underline('Meta Spatial Editor Terms and Privacy Policy'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(MSE_TOS_CONTENT);
  console.log(chalk.gray('─'.repeat(60)));

  const { accepted } = await prompts({
    type: 'select',
    name: 'accepted',
    message: 'Do you accept the Terms and Privacy Policy?',
    choices: [
      { title: 'Yes', value: true },
      { title: 'No', value: false },
    ],
    hint: 'Use arrow keys to select, Enter to confirm',
  });

  return !!accepted;
}

async function downloadInstaller(
  platform: Platform,
  spinner: Ora,
  release?: AppcastRelease | null,
): Promise<string> {
  const ext = { darwin: '.dmg', win32: '.msi', linux: '.tar.gz' }[platform];
  const tempPath = path.join(os.tmpdir(), `MetaSpatialEditorInstaller${ext}`);

  let releaseInfo = release;
  if (!releaseInfo) {
    spinner.text = 'Fetching latest release information...';
    releaseInfo = await fetchAppcastRelease(platform);
  }

  if (!releaseInfo) {
    throw new Error('Could not fetch release information. Please try again or download manually.');
  }

  spinner.text = releaseInfo.version
    ? `Downloading Meta Spatial Editor ${releaseInfo.version}...`
    : 'Downloading Meta Spatial Editor installer...';

  const downloadUrl = releaseInfo.downloadUrl.replace(/&amp;/g, '&');
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(300000) });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
}

function silentInstallMacOS(dmgPath: string, spinner: Ora): void {
  const mountPoint = path.join(os.tmpdir(), 'mse-installer-mount');
  const targetPath = '/Applications';

  try {
    if (!fs.existsSync(mountPoint)) {
      fs.mkdirSync(mountPoint, { recursive: true });
    }

    spinner.text = 'Mounting installer...';
    execSync(`hdiutil attach "${dmgPath}" -nobrowse -quiet -mountpoint "${mountPoint}"`, {
      timeout: 60000,
    });

    let appPath = path.join(mountPoint, 'Meta Spatial Editor.app');
    let appName = 'Meta Spatial Editor.app';

    if (!fs.existsSync(appPath)) {
      const files = fs.readdirSync(mountPoint);
      const appFile = files.find((f) => f.endsWith('.app'));
      if (!appFile) throw new Error('Could not find application in mounted DMG');
      appPath = path.join(mountPoint, appFile);
      appName = appFile;
    }

    spinner.text = `Installing ${appName}...`;
    execSync(`cp -R "${appPath}" "${targetPath}/"`, { timeout: 120000 });
  } finally {
    try {
      execSync(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 30000 });
    } catch {
      // Ignore unmount errors
    }
  }
}

function silentInstallWindows(msiPath: string, spinner: Ora): void {
  const logPath = path.join(os.tmpdir(), 'mse-install.log');

  spinner.info('Administrator privileges required - a UAC prompt will appear.');
  console.log(chalk.gray('  Please approve the prompt to continue installation.\n'));

  const psCommand = `Start-Process -FilePath 'msiexec' -ArgumentList '/i', '${msiPath.replace(/'/g, "''")}', '/quiet', '/norestart', '/log', '${logPath.replace(/'/g, "''")}' -Verb RunAs -Wait`;

  try {
    spinner.start('Waiting for administrator approval...');
    execSync(`powershell -Command "${psCommand}"`, { timeout: 600000 });
    spinner.text = 'Installation completed, verifying...';
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('canceled') || errorMsg.includes('cancelled')) {
      throw new Error('Installation cancelled - administrator privileges are required to install.');
    }
    try {
      const logContent = fs.readFileSync(logPath, 'utf16le');
      if (logContent.includes('1925')) {
        throw new Error('Installation requires administrator privileges. Please run the terminal as Administrator or install manually.');
      }
    } catch {
      // Log file not readable, continue with original error
    }
    throw error;
  }
}

function silentInstallLinux(archivePath: string, spinner: Ora): void {
  const installPath = MSE_INSTALL_PATHS.linux;
  spinner.text = 'Extracting Meta Spatial Editor CLI...';

  if (!fs.existsSync(installPath)) {
    fs.mkdirSync(installPath, { recursive: true });
  }

  execSync(`tar -xzf "${archivePath}" -C "${installPath}" --strip-components=1`, { timeout: 120000 });

  const cliPath = path.join(installPath, MSE_LINUX_CLI_NAME);
  if (fs.existsSync(cliPath)) {
    execSync(`chmod +x "${cliPath}"`, { timeout: 5000 });
  }

  const wrapperPath = path.join(installPath, 'meta-spatial-editor-cli');
  if (fs.existsSync(wrapperPath)) {
    execSync(`chmod +x "${wrapperPath}"`, { timeout: 5000 });
  }
}

function silentInstall(installerPath: string, platform: Platform, spinner: Ora): void {
  if (platform === 'darwin') silentInstallMacOS(installerPath, spinner);
  else if (platform === 'win32') silentInstallWindows(installerPath, spinner);
  else silentInstallLinux(installerPath, spinner);
}

export async function installMSE(): Promise<MSEInstallResult> {
  const platform = detectPlatform();
  const downloadUrl = MSE_DOWNLOAD_URLS[platform] || MSE_DOWNLOAD_URLS.default;
  const productName = platform === 'linux' ? 'Meta Spatial Editor CLI' : 'Meta Spatial Editor';

  console.log(chalk.gray('\nChecking for latest version...'));
  const latestRelease = await fetchAppcastRelease(platform);
  const latestVersion = latestRelease?.version || null;

  const existingVersion = await detectMSEVersion(platform);

  if (existingVersion) {
    const installedNormalized = normalizeVersion(existingVersion);
    const latestNormalized = latestVersion ? normalizeVersion(latestVersion) : null;

    if (latestNormalized && installedNormalized === latestNormalized) {
      console.log(chalk.green(`\n✓ ${productName} ${existingVersion} is already installed (latest version).`));
      return { installed: true, version: existingVersion, manual: false };
    }

    if (latestNormalized) {
      try {
        if (semver.gte(installedNormalized, latestNormalized)) {
          console.log(chalk.green(`\n✓ ${productName} ${existingVersion} is already installed (up to date).`));
          return { installed: true, version: existingVersion, manual: false };
        }
      } catch {}

      const { shouldUpgrade } = await prompts({
        type: 'confirm',
        name: 'shouldUpgrade',
        message: `${productName} ${existingVersion} is installed. Upgrade to ${latestVersion}?`,
        initial: true,
      });

      if (!shouldUpgrade) {
        console.log(chalk.gray('Skipping upgrade.'));
        return {
          installed: true,
          version: existingVersion,
          manual: false,
          outdated: !isVersionSufficient(existingVersion),
        };
      }
    } else if (isVersionSufficient(existingVersion)) {
      console.log(chalk.green(`\n✓ ${productName} ${existingVersion} is already installed.`));
      console.log(chalk.gray('(Could not check for updates - using installed version)'));
      return { installed: true, version: existingVersion, manual: false };
    } else {
      const { shouldUpgrade } = await prompts({
        type: 'confirm',
        name: 'shouldUpgrade',
        message: `${productName} ${existingVersion} is installed but version ${MSE_MIN_VERSION}+ is required. Try to upgrade?`,
        initial: true,
      });

      if (!shouldUpgrade) {
        return { installed: true, version: existingVersion, manual: false, outdated: true };
      }
    }
  } else if (!latestRelease) {
    console.log(chalk.yellow(`\nCould not fetch ${productName} release information.`));
    console.log('Please install manually:');
    console.log(chalk.cyan(`  ${downloadUrl}`));
    return { installed: false, version: null, manual: true };
  }

  const tosAccepted = await showAndAcceptTOS();
  if (!tosAccepted) {
    console.log(chalk.yellow('\nInstallation cancelled - Terms not accepted.'));
    console.log('You can install Meta Spatial Editor manually later:');
    console.log(chalk.cyan(`  ${downloadUrl}`));
    return { installed: false, version: null, manual: true };
  }

  const spinner = ora({ text: 'Preparing installation...', stream: process.stderr }).start();

  try {
    const installerPath = await downloadInstaller(platform, spinner, latestRelease);
    silentInstall(installerPath, platform, spinner);

    try {
      fs.unlinkSync(installerPath);
    } catch {
      // Ignore cleanup errors
    }

    // Brief delay for macOS to register the app
    await new Promise((resolve) => setTimeout(resolve, 1000));

    spinner.text = 'Verifying installation...';
    const version = await detectMSEVersion(platform);

    if (version && isVersionSufficient(version)) {
      spinner.succeed(`${productName} ${version} installed successfully`);

      if (platform === 'linux') {
        const cliPath = path.join(MSE_INSTALL_PATHS.linux, MSE_LINUX_CLI_NAME);
        console.log(chalk.cyan(`\nCLI installed to: ${cliPath}`));
        console.log(chalk.gray(`Set environment variable: META_SPATIAL_EDITOR_CLI_PATH=${cliPath}`));
      }

      return { installed: true, version, manual: false };
    } else if (version) {
      spinner.succeed(`${productName} ${version} installed (version above ${MSE_MIN_VERSION} recommended)`);
      return { installed: true, version, manual: false, outdated: true };
    } else {
      spinner.warn('Installation completed but version verification failed');
      return { installed: false, version: null, manual: true };
    }
  } catch (error) {
    spinner.fail('Installation failed');
    console.error(chalk.red(`Error: ${(error as Error).message}`));
    console.log('\nYou can install Meta Spatial Editor manually:');
    console.log(chalk.cyan(`  ${downloadUrl}`));
    return { installed: false, version: null, manual: true, error: error as Error };
  }
}
