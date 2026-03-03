---
name: test-audio
description: Automated test for the audio system (AudioSource loading, playback state, stop). Tests ECS audio state transitions using IWER MCP tools against the audio example. Dynamic entity discovery. Run from examples/audio/ with the dev server running. Note that actual audio output cannot be verified — only ECS state.
argument-hint: [--suite loading|playback|stop|all]
---

# Audio System Test

Automated test suite for verifying AudioSource loading, playback state transitions, and AudioSystem behavior using IWER MCP tools.

**Target Example:** `examples/audio`

Run this skill from the `examples/audio/` directory with the dev server running (`npm run dev`).

**Important**: Actual audio output cannot be verified via MCP tools. These tests verify ECS state transitions only (loading, play requested, is playing, stop).

## Pre-test Setup

```
mcp__iwsdk-dev-mcp__browser_reload_page
mcp__iwsdk-dev-mcp__xr_accept_session
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 20, level: ["error"]) → no errors (audio autoplay warnings are acceptable)
```

---

## Test Suites

### Suite 1: Audio Loading

**What we're testing**: AudioSource loads its buffer automatically.

#### Test 1.1: Find Audio Entity

```
mcp__iwsdk-dev-mcp__ecs_find_entities(withComponents: ["AudioSource"])
→ At least 1 entity. Save as <audio>.
```

The audio example uses a GLXF level that creates entities via composition. The Spinner entity has an AudioSource.

#### Test 1.2: Verify Loaded State

```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <audio>, components: ["AudioSource"])
```

**Assert**:
- `src` contains an audio file path (e.g., `.mp3`)
- `_loaded` = `true` (buffer loaded)
- `_loading` = `false` (not currently loading)
- `_isPlaying` = `false` (not playing yet — unless autoplay is set)
- `volume` = `1`
- `positional` = `true`

#### Test 1.3: Pool Created

**Assert**: `_pool` exists with `available` array matching `maxInstances`.

---

### Suite 2: Playback Trigger

**What we're testing**: Setting `_playRequested: true` triggers the AudioSystem to play.

#### Test 2.1: Request Play

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "_playRequested", value: "true")
```

**Assert**: `_playRequested` was consumed (response shows `newValue: false` — the AudioSystem processed it within the same frame).

#### Test 2.2: Play with Loop for Observable State

To observe `_isPlaying: true`, set `loop: true` first, then request play:
```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "loop", value: "true")
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "_playRequested", value: "true")
```

Then query:
```
mcp__iwsdk-dev-mcp__ecs_query_entity(entityIndex: <audio>, components: ["AudioSource"])
→ _isPlaying: true (looping sound keeps playing)
```

---

### Suite 3: Stop

#### Test 3.1: Request Stop

```
mcp__iwsdk-dev-mcp__ecs_set_component(entityIndex: <audio>, componentId: "AudioSource",
  field: "_stopRequested", value: "true")
```

**Assert**: `_stopRequested` consumed, `_isPlaying` becomes `false`.

---

### Suite 4: System Registration

```
mcp__iwsdk-dev-mcp__ecs_list_systems
→ AudioSystem at priority 0
→ Config keys: enableDistanceCulling, cullingDistanceMultiplier
→ audioEntities: ≥ 1
```

---

### Suite 5: Component Schema

```
mcp__iwsdk-dev-mcp__ecs_list_components
→ AudioSource fields:
  Core: src (FilePath), volume (Float32), loop (Boolean), autoplay (Boolean)
  Spatial: positional (Boolean), refDistance, rolloffFactor, maxDistance, distanceModel, coneInnerAngle, coneOuterAngle, coneOuterGain
  Behavior: playbackMode (Enum), maxInstances (Int8), crossfadeDuration (Float32), instanceStealPolicy (Enum)
  Control: _playRequested, _pauseRequested, _stopRequested (Boolean), _fadeIn, _fadeOut (Float32)
  State: _pool (Object), _instances (Object), _isPlaying (Boolean), _buffer (Object), _loaded, _loading (Boolean)
```

---

### Suite 6: Stability

```
mcp__iwsdk-dev-mcp__browser_get_console_logs(count: 30, level: ["error", "warn"])
→ No errors. Audio autoplay warnings are acceptable.
```

---

## Results Summary

```
| Suite                    | Result    |
|--------------------------|-----------|
| 1. Audio Loading         | PASS/FAIL |
| 2. Playback Trigger      | PASS/FAIL |
| 3. Stop                  | PASS/FAIL |
| 4. System Registration   | PASS/FAIL |
| 5. Component Schema      | PASS/FAIL |
| 6. Stability             | PASS/FAIL |
```

---

## Known Issues & Workarounds

### Request flags are one-shot
`_playRequested`, `_pauseRequested`, and `_stopRequested` are consumed by the AudioSystem within one frame. The `ecs_set_component` response may already show `newValue: false`.

### Short sounds finish before query
Non-looping sounds may finish playing before you can query `_isPlaying`. Set `loop: true` before playing to observe a persistent `_isPlaying: true` state.

### Stop priority
If `_stopRequested` and `_playRequested` are set simultaneously, stop wins.

### Audio output not verifiable
IWER runs in a browser context where the AudioContext may be suspended until a user gesture. The MCP tools can verify ECS state transitions but cannot confirm actual audio output.

### Audio example uses GLXF level
The audio example loads entities from `./glxf/Composition.glxf`. Entities are not created in index.js — they come from the GLXF composition. The SpinSystem applies rotation to entities with AudioSource. Use `ecs_find_entities` to discover them dynamically.

## Architecture Notes

### Playback State Machine
```
[AudioSource added] → _loading=true → loadAudio() → _loaded=true, _pool created
   ↓ (_playRequested=true)
handlePlaybackRequests():
  Restart: stop all → create new instance → _isPlaying=true
  Overlap: add instance (steal if full) → _isPlaying=true
  Ignore: skip if already playing
  FadeRestart: fade out current → fade in new → _isPlaying=true
   ↓ (onended or _stopRequested)
releaseInstance() → if no instances left → _isPlaying=false
```

### PlaybackMode Enum
- `restart` — Stop current, play new
- `overlap` — Add concurrent instance (up to maxInstances)
- `ignore` — Skip if already playing
- `fade-restart` — Crossfade from current to new
