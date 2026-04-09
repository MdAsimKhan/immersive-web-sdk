# Grab Interactions Example

This example demonstrates various grab interaction techniques in WebXR using the Immersive Web SDK (IWSDK). Experience different ways to grab and interact with 3D objects in VR using controllers or hand tracking.

## Overview

This example showcases three distinct grab interaction patterns:

- **One-Hand Grabbing**: Pick up and move objects with a single hand
- **Two-Hand Grabbing**: Grab objects with both hands to move and resize them
- **Distance Grabbing**: Pull distant objects toward you using ray casting

## Project Structure

```
grab/
├── src/
│   └── index.js                    # Main application entry point
├── ui/                             # UIKitML panel definitions
│   ├── one-hand-grabbable.uikitml  # One-hand grab instructions UI
│   ├── two-hand-grabbable.uikitml  # Two-hand grab instructions UI
│   └── distance-grabbable.uikitml  # Distance grab instructions UI
├── public/
│   ├── audio/                      # Sound effects
│   │   ├── music.mp3
│   │   └── switch.mp3
│   ├── textures/                   # Texture assets
│   │   └── webxr.jpg
│   └── glxf/                       # Generated GLXF scene files (auto-generated)
├── metaspatial/                    # Meta Spatial Editor project
├── index.html                     # HTML entry point
├── vite.config.js                 # Vite build configuration
└── package.json                   # Dependencies
```

## Quick Start

### Prerequisites

- Node.js 20.19.0+
- HTTPS-capable development environment

### Installation

```bash
cd immersive-web-sdk/examples/grab
npm install
```

### Development

```bash
# Start development server with HTTPS
npm run dev


# Build for production
npm run build


# Preview production build
npm run preview
```

The development server will start on the HTTPS local URL reported by Vite or `npx iwsdk dev status` (typically `https://localhost:5173/` when that port is free).

## Implementation Details

### Main Application (src/index.js)

The application initializes a WebXR world with the following key features:

```javascript
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    requiredFeatures: ['hand-tracking'],
  },
  level: '/glxf/Composition.glxf',
  features: {
    grabbing: true,
  },
});
```

### Grabbable Component

The core of this example is the `Grabbable` component, which provides interaction patterns of 3D objects. More details can be found in https://iwsdk.dev/concepts/grabbing/interaction-types.html

## Customization

### Adding New Grabbable Objects In Meta Spatial Editor

1. Make sure your local dev server is running with `npm run dev`
1. Open the `grab/metaspatial/Main.metaspatial` file in Meta Spatial Editor
1. Create or import 3D models in the Editor
1. Add the `Grabbable` component to entities based on the expected grab type (GrabSystem doesn't support adding multiple Grabbable components to one entity)
1. Save the Editor file and the local dev server will automatically refresh with the updated scene

## Troubleshooting

### Objects Won't Grab

- Ensure `grabbing: true` in World config
- Verify Grabbable component is present on entities

### Build Issues

- Run `npm run fresh:build` for clean rebuild
- Check that all IWSDK packages are properly linked

## Learn More

- [Immersive Web SDK Documentation](https://iwsdk.dev/)
- [Meta Spatial Editor Guide](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-editor-overview)

## License

Copyright (c) Meta Platforms, Inc. and affiliates.

This project is licensed under the MIT License - see the LICENSE file for details.
