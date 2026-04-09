# IWSDK Locomotion Example

This is the official locomotion example project for the WebXR Framework, designed for optimal developer, designer, and tech artist workflow.

## 📁 Project Structure

```
locomotion/
├── src/                    # Source code
│   ├── index.js           # Main application entry point
│   ├── settings.js        # Settings configuration
│   ├── test-component.js  # Example component
│   └── settings.uikitml   # UI markup
├── public/                # Static assets (served at root)
│   ├── gltf/             # 3D models in GLTF format
│   ├── glxf/             # GLXF scene files
│   ├── textures/         # Images and texture files
│   ├── audio/            # Audio files
│   └── models/           # Other 3D model formats
├── metaspatial/          # Meta Spatial project files
│   └── components/       # Generated component XML (committed for designers)
│       ├── IWSDKAudioSource.xml # Audio Source component
│       ├── IWSDKLocomotionEnvironment.xml  # Locomotion component
│       └── ...           # Other framework components
├── dist/                 # Build output (generated)
├── index.html           # Main HTML file
├── vite.config.js       # Vite configuration
└── package.json         # Project dependencies
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20.19.0+ and pnpm
- HTTPS support for WebXR development

### Installation

```bash
cd locomotion
pnpm install
```

### Development

```bash
# Start development server with HTTPS
pnpm dev

# Build for production
pnpm build

# Preview production build locally
pnpm preview
```

The development server will start on the HTTPS local URL reported by Vite or `npx iwsdk dev status` (typically `https://localhost:5173/` when that port is free).

## 📦 Asset Organization

### WebXR-Optimized Asset Handling

This example uses Vite's `public/` directory for WebXR assets since they are:

- Loaded at runtime via URLs (not imported as modules)
- Large files that shouldn't be bundled or processed
- Need direct URL access for asset loaders

### Assets Directory Structure

- **`public/gltf/`** - 3D models in GLTF/GLB format
- **`public/glxf/`** - GLXF scene files containing component data
- **`public/textures/`** - Images, textures, and visual assets (.png, .jpg, etc.)
- **`public/audio/`** - Sound effects and music files
- **`public/models/`** - Other 3D model formats

### Asset Usage

```javascript
// Reference assets using root-relative paths (Vite serves public/ at root)
const assets = {
  scene: { url: '/glxf/my-scene.glxf', type: AssetType.GLXF },
  model: { url: '/gltf/my-model.gltf', type: AssetType.GLTF },
  texture: { url: '/textures/my-texture.png', type: AssetType.Texture },
};
```

## 🔧 Component System

### Generated Components

The `generated/components/` directory contains XML definitions for all framework components. These files are:

- **Generated automatically** during development
- **Committed to version control** for designer/artist accessibility
- **Used by Meta Spatial** for component integration

### Generated Files Organization

The `generated/` folder organizes all auto-generated files:

- **`generated/components/`** - Component XML definitions
- **Future**: Schema files, type definitions, documentation, etc.

### Important Notes

- All generated files should be committed to ensure the project works out-of-the-box
- Designers and tech artists can use these without running build commands
- Files are regenerated when components change during development

## 🌐 WebXR Development

### HTTPS Requirements

WebXR requires HTTPS for all features to work properly. This example includes:

- Automatic HTTPS certificate generation via `vite-plugin-mkcert`
- Self-signed certificates for local development
- Proper CORS configuration for asset loading

### Testing on Devices

```bash
# Find your local IP
ipconfig getifaddr en0  # macOS
# or
hostname -I             # Linux

# Access from VR headset
https://YOUR_LOCAL_IP:<PORT>
```

## 🛠 Customization

### Vite Configuration

The `vite.config.js` file includes:

- HTTPS development server setup
- Static asset copying configuration
- Build optimization settings
- Asset handling rules

### Adding New Assets

1. Place assets in the appropriate `public/` subdirectory
2. Reference them in your code using root-relative paths (e.g., `/gltf/model.gltf`)
3. Assets are automatically served by Vite during development and copied to build output

## 📋 Scripts

- **`pnpm dev`** - Start development server with HMR and HTTPS
- **`pnpm build`** - Build for production
- **`pnpm preview`** - Preview production build locally

## 🔗 Integration

This example is designed to work seamlessly with:

- **Meta Spatial SDK** for component definitions
- **WebXR browsers** for VR/AR development
- **Framework tools** for component generation
- **Asset pipelines** for 3D content creation

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
