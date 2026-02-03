/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** TEDI Appcast base URL (Sparkle-format XML) */
export const MSE_APPCAST_BASE =
  process.env.IWSDK_MSE_APPCAST_BASE ||
  'https://www.facebook.com/edt_release';

/** App names in TEDI registry (internally called "Cosmo Studio") */
export const MSE_APP_NAMES = {
  darwin: 'cosmo_studio_for_macos',
  win32: 'cosmo_studio_for_windows',
  linux: 'cosmo_studio_cli_for_linux',
} as const;

/** Release channel: 'production', 'alpha', 'beta', 'experimental' */
export const MSE_RELEASE_CHANNEL =
  process.env.IWSDK_MSE_CHANNEL || 'production';

export function getAppcastUrl(platform: 'darwin' | 'win32' | 'linux'): string {
  const appName = MSE_APP_NAMES[platform];
  return `${MSE_APPCAST_BASE}/${appName}/${MSE_RELEASE_CHANNEL}/appcast.xml`;
}

/** Fallback URLs when appcast fetch fails */
export const MSE_DOWNLOAD_URLS = {
  darwin:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-mac',
  win32:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-windows',
  linux:
    'https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-linux',
  default: 'https://developers.meta.com/horizon/downloads/spatial-sdk/',
} as const;

export const MSE_MIN_VERSION = '9.0.0';

export const MSE_TOS_CONTENT = `
By downloading and using Meta Spatial Editor, you agree to:

1. The Meta Platform Technologies SDK License Agreement
   https://developers.meta.com/horizon/licenses/oculussdk/

2. The Supplemental Meta Platforms Technologies Terms of Service:
   https://www.meta.com/legal/supplemental-terms-of-service/

and acknowledge you've read:

3. The Supplemental Privacy Policy
   https://www.meta.com/legal/privacy-policy/
`;

/** Installation paths by platform */
export const MSE_INSTALL_PATHS = {
  darwin: '/Applications/Meta Spatial Editor.app',
  win32: 'C:\\Program Files\\Meta Spatial Editor',
  linux: `${process.env.HOME}/.local/lib/meta-spatial-editor-cli`,
} as const;

export const MSE_LINUX_CLI_NAME = 'MetaSpatialEditorCLI';
