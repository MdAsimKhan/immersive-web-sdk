# WebXR Framework Physics Example

This example demonstrates the physics system in the Immersive Web SDK (IWSDK), showcasing realistic physics simulation powered by the Babylon Havok physics engine. Learn how to create interactive physics-enabled objects with various shapes, motion types, and physical properties.

## 🎯 What You'll Learn

This example demonstrates:

- **Physics System Integration**: Setting up the Havok physics engine in your IWSDK application
- **Physics Bodies**: Creating objects with different motion types (Static, Dynamic, Kinematic)
- **Physics Shapes**: Using various collision shapes (Sphere, Box, Cylinder, ConvexHull, TriMesh, Auto-detect)
- **Physics Manipulation**: Applying forces and impulses to physics objects
- **Interactive Physics**: Combining physics with the grabbing system for interactive objects
- **Physical Properties**: Configuring density, friction, restitution, damping, and gravity factors

### Scene Contents

The example includes:

1. **Environment (Desk)**: Static TriMesh physics body that serves as the floor/surface
2. **Plant (Sansevieria)**: Dynamic physics object with auto-detected shape, increased gravity factor, and linear damping
3. **Drone**: Dynamic physics object with auto-detected shape, standard physics properties
4. **Robot**: Grabbable object (no physics) for comparison
5. **Dynamic Sphere**: Programmatically created sphere with an applied impulse force

All dynamic objects except the robot support distance grabbing, allowing you to pick them up and interact with them in VR.

## 📁 Project Structure

```
physics/
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
cd physics
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

## ⚙️ Physics System Overview

### Enabling Physics

Enable physics in your world configuration:

```javascript
World.create(document.getElementById('scene-container'), {
  features: {
    physics: true, // Enable Havok physics engine
    grabbing: true, // Enable object grabbing
    locomotion: true, // Enable player movement
  },
});
```

### Physics Components

The physics system uses three main ECS components:

#### 1. PhysicsBody

Defines the motion type and physical behavior of an entity. See `immersive-web-sdk/packages/core/src/physics/physicsBody.ts:47-66`

**Motion Types** (`PhysicsState`):

- **`Static`**: Immovable objects like walls and floors. Affects other bodies but never moves.
- **`Dynamic`**: Objects that respond to forces, collisions, and gravity.
- **`Kinematic`**: Programmatically controlled objects that push dynamic bodies but aren't affected by physics.

**Properties**:

- `state`: Motion type (default: `PhysicsState.Dynamic`)
- `linearDamping`: Reduces linear velocity over time (default: 0.0)
- `angularDamping`: Reduces angular velocity over time (default: 0.0)
- `gravityFactor`: Multiplier for gravity effect (default: 1.0)
- `centerOfMass`: Custom center of mass offset (default: auto-calculated)

**Example**:

```javascript
entity.addComponent(PhysicsBody, {
  state: PhysicsState.Dynamic,
  linearDamping: 0.5,
  gravityFactor: 2.0,
});
```

#### 2. PhysicsShape

Defines the collision shape and material properties. See `immersive-web-sdk/packages/core/src/physics/physicsShape.ts:80-100`

**Shape Types** (`PhysicsShapeType`):

- **`Sphere`**: Defined by radius in `dimensions[0]`. Efficient for round objects.
- **`Box`**: Defined by `[width, height, depth]` in dimensions. Good for rectangular objects.
- **`Cylinder`**: Defined by radius in `dimensions[0]` and height in `dimensions[1]`.
- **`ConvexHull`**: Auto-generates a convex wrapper around the mesh. Great balance of accuracy and performance.
- **`TriMesh`**: Uses exact mesh geometry. Most accurate but computationally expensive. Best for static objects.
- **`Auto`**: Automatically detects the best shape from Three.js geometry (SphereGeometry → Sphere, BoxGeometry → Box, etc.)

**Material Properties**:

- `density`: Mass per unit volume (default: 1.0)
- `restitution`: Bounciness, 0 = no bounce, 1 = perfect bounce (default: 0.0)
- `friction`: Surface friction (default: 0.5)

**Example**:

```javascript
entity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Sphere,
  dimensions: [0.5, 0, 0], // radius = 0.5 meters
  density: 2.0,
  restitution: 0.8, // bouncy
  friction: 0.1, // slippery
});
```

#### 3. PhysicsManipulation

Applies one-time forces or velocity changes to a physics body. The component is automatically removed after application. See `immersive-web-sdk/packages/core/src/physics/physicsManipulation.ts:37-48`

**Properties**:

- `force`: Impulse force vector `[x, y, z]`
- `linearVelocity`: Set linear velocity directly `[x, y, z]`
- `angularVelocity`: Set angular velocity directly `[x, y, z]`

**Example**:

```javascript
// Apply an impulse force
entity.addComponent(PhysicsManipulation, {
  force: [10, 5, 0], // Push right and up
});
```

### Code Example

Here's how the example creates a dynamic sphere with physics (from `src/index.js:44-60`):

```javascript
// Create a sphere mesh
const body = new Mesh(
  new SphereGeometry(0.2),
  new MeshStandardMaterial({
    side: FrontSide,
    color: new Color(Math.random(), Math.random(), Math.random()),
  }),
);
body.position.set(-1, 1.5, 0.5);
scene.add(body);

// Create entity and add physics
const entity = world.createTransformEntity(body);
entity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Sphere,
  dimensions: [0.2],
});
entity.addComponent(PhysicsBody, {
  state: PhysicsState.Dynamic,
});
entity.addComponent(PhysicsManipulation, {
  force: [10, 1, 1],
});
```

### Physics in GLXF Scenes

You can also configure physics components directly in Meta Spatial Editor by opening `immersive-web-sdk/examples/physics/metaspatial/Main.metaspatial`:

- The **environment desk** uses a static TriMesh shape for accurate collisions
- The **plant** has a dynamic body with `gravityFactor: 2.0` and `linearDamping: 1.0`
- The **drone** has a standard dynamic body with auto-detected shape
- All objects are combined with `DistanceGrabbable` for VR interaction

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

## 💡 Best Practices & Tips

### Choosing the Right Shape Type

- **Use `Auto`** for rapid prototyping and most cases - it intelligently selects the best shape
- **Use `Sphere`** for balls, projectiles, or any round objects - most efficient collision shape
- **Use `Box`** for crates, walls, floors - simple and performant
- **Use `ConvexHull`** for irregular dynamic objects - good balance of accuracy and performance
- **Use `TriMesh`** mostly for static environments - exact mesh collision but expensive for dynamic objects

### Performance Optimization

1. **Prefer simpler shapes**: Sphere and Box are faster than ConvexHull and TriMesh
2. **Use Static bodies for environments**: Static bodies are much cheaper than Dynamic/Kinematic
3. **Limit TriMesh to static objects**: TriMesh vs TriMesh collisions are very expensive
4. **Apply damping for stability**: Use `linearDamping` and `angularDamping` to prevent runaway motion
5. **Adjust gravity factor**: Use `gravityFactor` instead of mass to control how objects fall

### Debugging Physics

- Use the browser console to check for physics errors
- Verify that objects have both `PhysicsBody` and `PhysicsShape` components
- Check that `physics: true` is enabled in your World configuration
- Ensure your models have valid geometry for collision detection

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

- **Meta Spatial Editor** for scene composition and component configurations
- **WebXR browsers** for VR/AR development and local testing
- **Asset pipelines** for 3D content creation

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
