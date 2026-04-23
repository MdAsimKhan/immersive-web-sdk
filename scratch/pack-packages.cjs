const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packagesDir = path.resolve(__dirname, '..', 'packages');

const packages = [
  'core',
  'cli',
  'glxf',
  'xr-input',
  'locomotor',
  'vite-plugin-gltf-optimizer',
  'vite-plugin-dev',
  'vite-plugin-metaspatial',
  'vite-plugin-uikitml',
  'create'
];

packages.forEach(pkg => {
  const pkgDir = path.join(packagesDir, pkg);
  if (!fs.existsSync(pkgDir)) {
    console.log(`Skipping ${pkg}, directory not found.`);
    return;
  }

  console.log(`Packing ${pkg}...`);
  try {
    // Run pnpm pack and capture output to find the filename
    const output = execSync('pnpm pack', { cwd: pkgDir, encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const tarballName = lines[lines.length - 1].trim();
    
    const oldPath = path.join(pkgDir, tarballName);
    const newPath = path.join(pkgDir, `iwsdk-${pkg}.tgz`);
    
    if (fs.existsSync(newPath)) {
      fs.unlinkSync(newPath);
    }
    fs.renameSync(oldPath, newPath);
    console.log(`Successfully packed and renamed to ${newPath}`);
  } catch (error) {
    console.error(`Failed to pack ${pkg}:`, error.message);
  }
});
