# PEEL PATROL – The Banana Snake Game 🍌🐍

A polished, retro pixel-art arcade mini-game built entirely with **semantic HTML5**, **CSS3**, and **vanilla JavaScript** using the **HTML5 Canvas API** and the **Web Audio API**.

---

## 🎮 How to Play
1. **Open the game**: Double-click `index.html` in any modern web browser (Google Chrome, Edge, Firefox, Safari). No installation, servers, or build steps required!
2. **Controls**:
   - **Move Snake**: Use Arrow Keys (`↑`, `↓`, `←`, `→`) or `W`, `A`, `S`, `D`.
   - **Pause / Resume**: Press `Spacebar` or `P`, or click the **Pause** button.
   - **Restart**: Press `R` or click the **Restart** button.
   - **Mute / Unmute**: Press `M` or click the **Sound** button.
   - **Mobile Touch**: Use the on-screen tactile **Virtual D-Pad** or **Swipe directly on the game board**.

---

## 🍌 Gameplay Mechanics & Features
- **Continuous Movement**: The cute green snake glides forward continuously.
- **Direction Lock & Input Queue**: Prevents 180° self-collision and resolves rapid double-key suicide bugs commonly found in basic snake games.
- **Growth & Scoring**:
  - Regular Bananas give **+1 point** and increase snake length by 1.
  - Speed scales up slightly every **5 regular bananas**.
- **Special Feature – The Golden Banana**:
  - Automatically spawns after every **5 regular bananas**.
  - Worth **+5 bonus points**!
  - Active for only **5 seconds** before vanishing (accompanied by a countdown bar and timer pie).
  - Features radiant golden aura, shimmer animation, and sparkle particles.
- **Audio Synthesizer (Web Audio API)**:
  - 100% procedural 8-bit retro sound effects (eat blip, golden spawn chime, golden eat fanfare, timeout whistle, speed-up double pip, game over slide).
  - Zero external `.mp3` or `.wav` dependencies.
- **High Score Persistence**:
  - Saved in the browser's `localStorage`.
  - Shows celebratory "NEW HIGH SCORE!" banner upon beating the record.

---

## 🎓 College Mini-Project Demonstration Guide
When presenting this project for an academic viva or practical demonstration, highlight the following technical topics:

### 1. Canvas Rendering Pipeline (`game.js`)
- **Grid Coordination**: 20×20 grid rendered onto a 480×480 canvas (`TILE_SIZE = 24px`).
- **Clean Pixel Art without External Assets**: The banana, golden banana, snake eyes, and foliage are drawn procedurally using canvas paths (`arc`, `quadraticCurveTo`, `fillRect`).
- **Dynamic Eye Direction**: The snake's eyes and pupils dynamically calculate offsets based on the current movement vector (`DIR.UP`, `DIR.DOWN`, `DIR.LEFT`, `DIR.RIGHT`).

### 2. Game Loop & Physics
- Uses `requestAnimationFrame` with a **fixed-timestep accumulator**. This decouples rendering frame rates from snake movement speed, ensuring stutter-free motion across 60Hz, 120Hz, and 144Hz displays.

### 3. State Machine Architecture
- Four distinct game states: `START`, `PLAYING`, `PAUSED`, `GAMEOVER`.
- Modals and overlays seamlessly manage transition between states without reloading the page.

### 4. Audio Synthesis
- Uses standard Web Audio API `OscillatorNode` and `GainNode` with exponential frequency ramps (`exponentialRampToValueAtTime`) to simulate authentic chiptune waveforms (sine, triangle, square, sawtooth).

---

## 📁 File Structure
```
Raj ka dosti/
├── index.html   # Main semantic HTML structure & UI overlays
├── style.css    # Retro arcade styling, warm cream palette, responsive layout
├── game.js      # Complete vanilla JavaScript game engine
└── README.md    # Documentation and project walkthrough
```
