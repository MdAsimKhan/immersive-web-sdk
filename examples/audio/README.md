# WebXR Framework Audio Example

This is the official **3D Spatial Audio** example for the WebXR Framework, demonstrating immersive audio features in WebXR environments. Experience interactive 3D positional audio, multiple playback modes, and spatial sound design patterns optimized for VR/AR applications.

## 🎵 What This Example Demonstrates

### Interactive 3D Spatial Audio

- **3 Interactive Robot Objects**: Each robot plays spatial audio when clicked/touched
- **Positional Audio**: Sound changes based on your position relative to the robots
- **Distance-Based Falloff**: Audio volume decreases naturally with distance
- **Directional Audio Cones**: Demonstrates directional sound propagation

### Audio Playback Modes

This example showcases three different audio playback behaviors:

1. **Robot 1 (Left)**: `fade-restart` mode - Crossfades between audio instances when triggered
2. **Robot 2 (Right)**: `overlap` mode - Allows multiple audio instances to play simultaneously
3. **Robot 3 (Center)**: `restart` mode - Stops current audio and starts fresh when triggered

### Spatial Audio Features

- **Volume Control**: Adjustable audio levels per source
- **Rolloff Factor**: Controls how quickly audio fades with distance
- **Reference Distance**: Distance at which audio starts to attenuate
- **Max Distance**: Maximum range for spatial audio effects
- **Audio Cones**: Inner/outer angle control for directional audio
- **Instance Management**: Smart handling of multiple simultaneous audio playbacks

## 🎮 User Experience

1. **Enter XR**: Click "Enter XR" to launch the WebXR experience
2. **Explore the Scene**: Walk around the desk environment with three robots
3. **Interact with Robots**: Click/touch any robot to trigger its unique audio behavior
4. **Experience 3D Audio**: Move around to hear how audio changes with your position
5. **Compare Playback Modes**: Try clicking the same robot multiple times to hear different behaviors

## 📁 Project Structure

```
audio/
├── src/                    # Source code
│   ├── index.js           # Main application entry point & audio asset definitions
│   ├── spin.js            # Spinner component system (robot behavior & audio triggers)
│   └── settings.js        # XR session management & UI controls
├── public/                # Static assets (served at root)
│   ├── gltf/             # 3D robot GLTF models and environment
│   ├── glxf/             # GLXF scene with audio component configurations
│   ├── textures/         # WebXR logo and visual assets
│   ├── audio/            # Audio files (beepboop.mp3, switch.mp3, music.mp3)
│   └── ui/               # UI configuration files
├── ui/                   # UI markup templates
│   └── settings.uikitml  # Spatial UI panel markup
├── metaspatial/          # Meta Spatial project files
│   └── components/       # Generated component XML (committed for designers)
├── dist/                 # Build output (generated)
├── index.html           # Main HTML file
├── vite.config.js       # Vite configuration with IWSDK plugins
└── package.json         # Project dependencies & scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20.19.0+ and pnpm
- HTTPS support for WebXR development

### Installation

```bash
cd audio
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

## 🔊 Audio System Architecture

### Core Components

#### AudioSource Component

Each robot in the scene uses the `IWSDKAudioSource` component with these key properties:

```javascript
// Example robot configuration from Composition.glxf
{
  "src": "/audio/beepboop.mp3",        // Audio file path
  "volume": 1.0,                       // Volume level (0.0 - 1.0)
  "positional": true,                  // Enable 3D spatial positioning
  "loop": false,                       // Single playback per trigger
  "autoplay": false,                   // Manual trigger only


  // Distance-based audio falloff
  "distanceModel": "inverse",          // How audio fades with distance
  "refDistance": 1.0,                  // Distance where falloff begins
  "maxDistance": 10000,               // Maximum audible distance
  "rolloffFactor": 1.0,               // Rate of distance-based volume reduction


  // Directional audio (audio cones)
  "coneInnerAngle": 45,               // Inner cone angle in degrees
  "coneOuterAngle": 180,              // Outer cone angle in degrees
  "coneOuterGain": 0.0,               // Volume multiplier outside outer cone


  // Instance management
  "maxInstances": 5,                   // Maximum simultaneous audio instances
  "playbackMode": "fade-restart",      // How to handle multiple triggers
  "instanceStealPolicy": "oldest",     // Which instance to replace when at max
  "crossfadeDuration": 0.1            // Fade time between instances
}
```

#### Interactive Behavior

- **Spinner Component**: Makes robots face the user for better interaction
- **Interactable Component**: Enables click/touch interaction
- **Pressed Component**: Triggers audio playback via `AudioUtils.play(entity)`

### Audio Playback Modes

The three robots demonstrate different `playbackMode` values:

1. **`restart`** (Robot 3): Stops current audio and starts new instance
2. **`overlap`** (Robot 2): Allows multiple simultaneous audio instances
3. **`fade-restart`** (Robot 1): Crossfades between old and new audio instances

### Audio Asset Management

```javascript
// From src/index.js - Audio assets are defined upfront
const assets = {
  switchSound: {
    url: '/audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  song: {
    url: '/audio/beepboop.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
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

## 🎧 Audio Development Tips

### Testing Spatial Audio

Use headphones or a good stereo setup for testing on a desktop. Or test on actual VR devices for the full spatial experience by accessing from VR headset with the reported network URL, for example `https://YOUR_LOCAL_IP:<PORT>`.

### Adding New Audio

1. **Place audio files** in `public/audio/` directory (supports .mp3, .ogg, .wav)
2. **Define audio assets** in `src/index.js`:
   ```javascript
   const assets = {
     myNewSound: {
       url: '/audio/my-sound.mp3',
       type: AssetType.Audio,
       priority: 'background', // or 'critical' for essential audio
     },
   };
   ```
3. **Configure AudioSource component** in your Spatial Editor scene or create programmatically
4. **Trigger playback** using `AudioUtils.play(entity)` in your systems

### Audio Performance Best Practices

- **Use compressed formats**: MP3 or OGG for smaller file sizes
- **Set appropriate priorities**: Use `'critical'` for essential UI sounds, `'background'` for ambient audio
- **Limit max instances**: Use `maxInstances` to prevent audio overload
- **Optimize distance settings**: Set reasonable `maxDistance` to avoid unnecessary audio processing
- **Test on headset**: Ensure audio works well on the headset

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
