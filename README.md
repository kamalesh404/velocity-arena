# 🎯 Velocity Arena

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Engine](https://img.shields.io/badge/Engine-Three.js_v0.184-brightgreen.svg)](https://threejs.org/)
[![Audio](https://img.shields.io/badge/Audio-Procedural_WebAudio_3D-orange.svg)](#-procedural-3d-web-audio-synthesis)
[![Networking](https://img.shields.io/badge/Networking-Socket.IO_60Hz-blueviolet.svg)](#-server-authoritative-netcode)

**Velocity Arena** is a next-generation browser-based 3D multiplayer tactical first-person shooter. Powered by **Three.js**, **Three-Mesh-BVH**, **Socket.io**, and native **Web Audio API**, Velocity Arena delivers high-speed competitive arena gunplay directly in the browser with zero external audio assets.

---

## 🌟 Core Pillars & Key Features

### 1. 🎯 Precision Sniper Weapon Class (`Apex Rail-Sniper`)
* **Lethality**: 85 Body Damage, **170 Headshot Damage** (instant one-shot elimination).
* **Bolt-Action Mechanical Physics**: 1.1s mechanical rechambering cycle with synchronized bolt audio and tactical HUD progress bar.
* **Dual-Stage Optical Zoom**:
  * **Right Click (ADS)**: 4x magnification with custom SVG/Canvas scope overlay.
  * **Shift (While Scoped)**: 8x extreme magnification for ultra-long range target tracking.
* **Dynamic Breathing Sway**: Micro-oscillation sine sway while scoped. Holding `Shift` stabilizes the crosshair with breath stamina.
* **Glowing Laser Tracers**: High-intensity zero-allocation object-pooled laser tracer beams that render in 3D space with exponential fade-out.

### 2. 👁️ Dual-Mode Spectator Engine
Seamless transition upon elimination into two distinct spectator cameras:
* **Mode 1: Target-Follow POV Cam**:
  * Locks onto the elimination killer or active combatants.
  * Smooth camera interpolation behind the player (`lerp = 0.12`).
  * `Left Mouse Button` cycles to the next living player.
  * `Right Mouse Button` cycles to the previous player.
* **Mode 2: Free-Flight Drone Flycam (Noclip)**:
  * Press `F` to unlock 6DoF drone camera controls anywhere across the arena.
  * `W / A / S / D`: Directional flight relative to camera gaze.
  * `Space / E` or `C / Q`: Vertical elevation (ascend/descend).
  * `Shift`: Turbo 2.5x speed boost.
  * Press `R` at any time to respawn back into active combat.

### 3. 🔊 Procedural 3D Web Audio Engine (Zero-Asset Synthesis)
No external `.mp3` or `.wav` files required! Every single sound effect is synthesized dynamically in real-time via the browser's native **Web Audio API**:
* **Sniper Shot**: Sub-bass transient punch (180Hz -> 40Hz) + high-resonance bandpass white noise burst + electrical rail hum decay.
* **Assault / SMG**: Exponential pitch drops with snappy transient noise filters.
* **Shotgun Blast**: Triple noise impulses overlaid with low-end saturation distortion.
* **Tactical Hitmarker**: Crisp 1800Hz -> 900Hz triangular chirp (30ms).
* **Headshot Ding**: Dual-harmonic high-Q metallic bell chime (3200Hz & 4800Hz) with 400ms shimmer decay.
* **Spatial Footsteps**: Bandpass pink noise taps modulated with alternating left/right stereo offsets.
* **Low-Health Heartbeat**: Sub-bass 55Hz binaural oscillator pulse activated when HP < 30.

---

## 🚀 Quick Start & Installation

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ 
* Modern WebGL2-compatible browser (Chrome, Edge, Firefox, Brave)

### Installation
```bash
# Clone the repository
git clone https://github.com/kamalesh404/velocity-arena.git
cd velocity-arena

# Install dependencies
npm install

# Build client production bundle
npm run build

# Start authoritative game server
npm run server
```

The game server will launch at:
`http://localhost:3000`

For local frontend development with instant HMR:
```bash
npm run dev
```

---

## 🎮 Tactical Controls

| Input | Action |
| :--- | :--- |
| **W, A, S, D** | Movement (Walk / Strafe) |
| **Shift** | Tactical Sprint / Hold Breath (When Scoped) / 8x Zoom Toggle |
| **Space** | Jump (Combat) / Ascend (Spectator FreeCam) |
| **Left Click** | Fire Weapon / Spectate Next Player |
| **Right Click** | Aim Down Sights (ADS 4x) / Spectate Previous Player |
| **F** | Toggle Follow Cam vs. Free-Flight Drone Cam |
| **R** | Reload Weapon / Respawn (When Eliminated) |
| **Tab** | Match Scoreboard & Frags Leaderboard |
| **Esc** | Settings & Volume Controls |

---

## 📂 Architecture Overview

```
velocity-arena/
├── public/
│   └── models/               # 3D arena & character meshes (.glb)
├── src/
│   ├── audio/
│   │   └── SoundEngine.js    # Procedural 3D Web Audio synthesizer
│   ├── spectator/
│   │   └── SpectatorController.js # Dual-mode follow & drone flycam
│   └── weapons/
│       ├── LaserTracerSystem.js   # Pooled glowing tracer line renderer
│       └── SniperScope.js         # Canvas 4x/8x reticle & sway engine
├── index.html                # High-animation tactical UI & HUD
├── style.css                 # Glassmorphism, animations & styling
├── main.js                   # Client game loop, Three.js & socket netcode
├── server.js                 # 60Hz server-authoritative hit validation
├── package.json              # Project dependencies & scripts
└── vite.config.js            # Vite build configuration
```

---

## 🛡️ License
Distributed under the MIT License. Built with ❤️ by [kamalesh404](https://github.com/kamalesh404).
