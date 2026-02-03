/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type VariantId =
  `${'vr' | 'ar'}-${'manual' | 'metaspatial'}-${'ts' | 'js'}`;
export type TriState = 'no' | 'optional' | 'required';

/**
 * Platform type for MSE installation detection
 */
export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * Result of MSE installation attempt
 */
export interface MSEInstallResult {
  /** Whether MSE is installed (may be outdated) */
  installed: boolean;
  /** Detected version string, or null if not installed */
  version: string | null;
  /** True if user needs to complete manual installation */
  manual: boolean;
  /** True if installed but below minimum required version */
  outdated?: boolean;
  /** Error that occurred during installation, if any */
  error?: Error;
}

export type ActionItem = {
  message: string;
  level?: 'info' | 'warning' | 'important';
};

export type PromptResult = {
  name: string;
  id: VariantId;
  installNow: boolean;
  metaspatial: boolean;
  mode: 'vr' | 'ar';
  language: 'ts' | 'js';
  // Legacy multiselect (kept for forward-compat with older recipes; unused now)
  features: string[];
  // New granular feature prompts (mapped to world-initializer features)
  featureFlags?: {
    locomotionEnabled: boolean;
    locomotionUseWorker?: boolean; // only if enabled
    grabbingEnabled: boolean;
    physicsEnabled: boolean;
    sceneUnderstandingEnabled: boolean; // AR-relevant, requires room scanning
    environmentRaycastEnabled: boolean; // AR-relevant, no room scanning required
  };
  gitInit: boolean;
  xrFeatureStates: Record<string, TriState>;
  actionItems?: ActionItem[];
  prerequisites?: ActionItem[];
  /** Result of MSE installation attempt (only set when metaspatial is true) */
  mseInstallResult?: MSEInstallResult;
};
