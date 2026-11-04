/**
 * ============================================================================
 * PEEL PATROL – The Banana Snake Game
 * Vanilla JavaScript Arcade Game Engine
 * 
 * Suitable for College Mini-Project Demonstration
 * Features:
 *  - Deterministic fixed-step grid physics & input queue
 *  - Direction-aware pixel-art cute snake with animated eyes & tongue
 *  - Custom canvas-rendered banana & timed golden banana (5s bonus)
 *  - Synthesized chiptune sound effects via Web Audio API (Zero dependencies)
 *  - Particle explosion system & floating combo text
 *  - Responsive desktop (Arrows/WASD) & mobile (D-Pad + Swipes) controls
 *  - LocalStorage high-score & sound state persistence
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. CONFIGURATION & CONSTANTS
     ========================================================================== */
  const GRID_SIZE = 20;           // 20x20 tile board
  const TILE_SIZE = 24;           // 24px per tile -> 480x480 native resolution
  const CANVAS_DIMENSION = GRID_SIZE * TILE_SIZE; // 480px

  const INITIAL_SPEED_MS = 135;   // Milliseconds per snake step at start
  const MIN_SPEED_MS = 65;        // Maximum speed cap (fastest)
  const SPEED_STEP_MS = 7;        // Speed increase every 5 bananas
  const GOLDEN_BANANA_INTERVAL = 5; // Spawn golden banana every 5 regular bananas
  const GOLDEN_BANANA_DURATION = 5000; // 5 seconds lifespan
  const GOLDEN_BANANA_POINTS = 5; // Bonus points

  // Direction vectors
  const DIR = {
    UP:    { x:  0, y: -1, name: 'UP' },
    DOWN:  { x:  0, y:  1, name: 'DOWN' },
    LEFT:  { x: -1, y:  0, name: 'LEFT' },
    RIGHT: { x:  1, y:  0, name: 'RIGHT' }
  };

  /* ==========================================================================
     2. AUDIO SYNTHESIZER (Web Audio API)
     Generates authentic 8-bit arcade chiptune sound effects procedurally.
     No external audio files or internet connection required.
     ========================================================================== */
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.isMuted = localStorage.getItem('peel_patrol_muted') === 'true';
    }

    /** Ensure AudioContext is active upon first user gesture */
    initContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem('peel_patrol_muted', this.isMuted);
      return this.isMuted;
    }

    /** Helper to create an oscillator tone with envelope */
    playTone(freq, type, duration, startGain = 0.18, endGain = 0.001, freqSlideTo = null) {
      if (this.isMuted) return;
      this.initContext();
      if (!this.ctx) return;

      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (freqSlideTo !== null) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqSlideTo), now + duration);
        }

        gain.gain.setValueAtTime(startGain, now);
        gain.gain.exponentialRampToValueAtTime(endGain, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {
        // Audio error suppression
      }
    }

    /** Sound: Eating regular banana (crisp retro blip) */
    playEat() {
      this.playTone(380, 'triangle', 0.10, 0.22, 0.001, 820);
    }

    /** Sound: Spawning the special Golden Banana (magical ascending chime) */
    playGoldenSpawn() {
      if (this.isMuted) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 'sine', 0.14, 0.18, 0.001);
        }, idx * 60);
      });
    }

    /** Sound: Eating golden banana (triumphant multi-tone sparkle fanfare) */
    playGoldenEat() {
      if (this.isMuted) return;
      const notes = [587.33, 739.99, 880.00, 1174.66, 1479.98]; // D5, F#5, A5, D6, F#6
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 'triangle', 0.16, 0.25, 0.001, freq * 1.15);
        }, idx * 45);
      });
    }

    /** Sound: Golden banana expires before being collected */
    playGoldenExpire() {
      if (this.isMuted) return;
      const notes = [440, 330, 220]; // Descending soft tones
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 'sine', 0.12, 0.12, 0.001);
        }, idx * 70);
      });
    }

    /** Sound: Game speed increase */
    playSpeedUp() {
      if (this.isMuted) return;
      this.playTone(880, 'square', 0.06, 0.12, 0.001);
      setTimeout(() => {
        this.playTone(1320, 'square', 0.09, 0.14, 0.001);
      }, 70);
    }

    /** Sound: Game Over crash / descending slide */
    playGameOver() {
      if (this.isMuted) return;
      this.playTone(320, 'sawtooth', 0.45, 0.26, 0.001, 55);
    }

    /** Sound: Button click */
    playClick() {
      this.playTone(560, 'triangle', 0.04, 0.10, 0.001);
    }
  }

  /* ==========================================================================
     3. PARTICLE & FLOATING TEXT ENGINE
     Provides juiciness and visual feedback for an indie arcade feel.
     ========================================================================== */
  class Particle {
    constructor(x, y, color, size, vx, vy, life) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.size = size;
      this.vx = vx;
      this.vy = vy;
      this.maxLife = life;
      this.life = life;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 60 * dt; // Gravity
      this.life -= dt;
      return this.life > 0;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.round(this.x - this.size / 2), Math.round(this.y - this.size / 2), this.size, this.size);
      ctx.restore();
    }
  }

  class FloatingText {
    constructor(x, y, text, color, font = '10px "Press Start 2P", monospace', life = 0.9) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.font = font;
      this.maxLife = life;
      this.life = life;
    }

    update(dt) {
      this.y -= 25 * dt; // Float upwards
      this.life -= dt;
      return this.life > 0;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = this.font;
      ctx.fillStyle = '#000000'; // Shadow
      ctx.fillText(this.text, this.x + 1, this.y + 1);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  /* ==========================================================================
     4. GAME ENGINE & STATE MANAGEMENT
     ========================================================================== */
  class PeelPatrolGame {
    constructor() {
      // DOM Elements
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.canvas.width = CANVAS_DIMENSION;
      this.canvas.height = CANVAS_DIMENSION;

      // Scoreboard HUD elements
      this.scoreEl = document.getElementById('currentScore');
      this.highScoreEl = document.getElementById('highScore');
      this.speedEl = document.getElementById('speedMultiplier');

      // Golden banana banner
      this.goldenBanner = document.getElementById('goldenBanner');
      this.goldenTimeLeftEl = document.getElementById('goldenTimeLeft');
      this.goldenBarFill = document.getElementById('goldenBarFill');

      // Overlays & Modals
      this.overlayStart = document.getElementById('overlayStart');
      this.overlayPause = document.getElementById('overlayPause');
      this.overlayGameOver = document.getElementById('overlayGameOver');
      this.finalScoreEl = document.getElementById('finalScore');
      this.finalHighScoreEl = document.getElementById('finalHighScore');
      this.newBestBadge = document.getElementById('newBestBadge');

      // Interactive Buttons
      this.btnStart = document.getElementById('btnStart');
      this.btnPause = document.getElementById('btnPause');
      this.btnRestart = document.getElementById('btnRestart');
      this.btnSound = document.getElementById('btnSound');
      this.btnPlayAgain = document.getElementById('btnPlayAgain');
      this.btnResume = document.getElementById('btnResume');

      // Mobile D-Pad Buttons
      this.dpadUp = document.getElementById('dpadUp');
      this.dpadDown = document.getElementById('dpadDown');
      this.dpadLeft = document.getElementById('dpadLeft');
      this.dpadRight = document.getElementById('dpadRight');

      // Sound Synthesizer instance
      this.sound = new SoundManager();

      // High Score loading
      this.highScore = parseInt(localStorage.getItem('peel_patrol_high_score') || '0', 10);
      this.highScoreEl.textContent = this.highScore;

      // Game State
      this.state = 'START'; // 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
      this.score = 0;
      this.bananasEaten = 0;
      this.currentSpeedMs = INITIAL_SPEED_MS;
      this.isNewHighScore = false;

      // Snake Entity
      this.snake = [];
      this.currentDir = DIR.RIGHT;
      this.directionQueue = []; // Solves the rapid double-press suicide bug

      // Food Entities
      this.banana = { x: 14, y: 10 };
      this.goldenBanana = null; // null or { x, y, spawnTime, duration: 5000, remaining: 5000 }

      // Animation & Particle State
      this.particles = [];
      this.floatingTexts = [];
      this.lastTickTime = 0;
      this.accumulator = 0;
      this.lastFrameTime = performance.now();
      this.screenShakeTime = 0;

      // Background decorative grass blades (procedurally generated once)
      this.grassBlades = this.generateGrassBlades();

      // Bind methods
      this.gameLoop = this.gameLoop.bind(this);

      // Initialize controls and setup initial render
      this.setupControls();
      this.updateSoundButtonUI();
      this.resetGameVariables();
      this.render();

      // Start the requestAnimationFrame loop
      requestAnimationFrame(this.gameLoop);
    }

    /** Generate static grass blade accents for retro jungle turf */
    generateGrassBlades() {
      const blades = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          if ((x * 7 + y * 13) % 9 === 0) {
            blades.push({ x, y, type: (x + y) % 3 });
          }
        }
      }
      return blades;
    }

    /** Reset all entity coordinates and gameplay variables */
    resetGameVariables() {
      // Snake starts in middle moving right with length 3
      this.snake = [
        { x: 7, y: 10 },
        { x: 6, y: 10 },
        { x: 5, y: 10 }
      ];
      this.currentDir = DIR.RIGHT;
      this.directionQueue = [];

      this.score = 0;
      this.bananasEaten = 0;
      this.currentSpeedMs = INITIAL_SPEED_MS;
      this.isNewHighScore = false;

      this.goldenBanana = null;
      this.particles = [];
      this.floatingTexts = [];
      this.accumulator = 0;

      this.updateHUD();
      this.spawnBanana();
    }

    /** Start a fresh game */
    startGame() {
      this.sound.initContext();
      this.sound.playClick();
      this.resetGameVariables();
      this.state = 'PLAYING';

      this.overlayStart.classList.add('hidden');
      this.overlayPause.classList.add('hidden');
      this.overlayGameOver.classList.add('hidden');
      this.btnPause.innerHTML = '⏸️ Pause';
    }

    /** Toggle Pause state */
    togglePause() {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        this.overlayPause.classList.remove('hidden');
        this.btnPause.innerHTML = '▶️ Resume';
        this.sound.playClick();
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.overlayPause.classList.add('hidden');
        this.btnPause.innerHTML = '⏸️ Pause';
        this.lastFrameTime = performance.now();
        this.sound.playClick();
      }
    }

    /** Trigger Game Over sequence */
    triggerGameOver() {
      this.state = 'GAMEOVER';
      this.sound.playGameOver();
      this.screenShakeTime = 0.35; // 350ms of arcade screen shake

      // Check High Score
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.isNewHighScore = true;
        localStorage.setItem('peel_patrol_high_score', this.highScore);
        this.highScoreEl.textContent = this.highScore;
      }

      // Explosion of particles at snake head
      if (this.snake.length > 0) {
        const head = this.snake[0];
        const hx = head.x * TILE_SIZE + TILE_SIZE / 2;
        const hy = head.y * TILE_SIZE + TILE_SIZE / 2;
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 90;
          this.particles.push(new Particle(
            hx, hy,
            Math.random() > 0.4 ? '#48bb3a' : '#d32f2f',
            3 + Math.random() * 3,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            0.6 + Math.random() * 0.4
          ));
        }
      }

      // Show Game Over Modal
      setTimeout(() => {
        this.finalScoreEl.textContent = this.score;
        this.finalHighScoreEl.textContent = this.highScore;
        if (this.isNewHighScore && this.score > 0) {
          this.newBestBadge.style.display = 'block';
        } else {
          this.newBestBadge.style.display = 'none';
        }
        this.overlayGameOver.classList.remove('hidden');
      }, 400);
    }

    /** Spawns a regular banana on an unoccupied tile */
    spawnBanana() {
      const occupied = new Set();
      this.snake.forEach(seg => occupied.add(`${seg.x},${seg.y}`));
      if (this.goldenBanana) {
        occupied.add(`${this.goldenBanana.x},${this.goldenBanana.y}`);
      }

      const freeTiles = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          if (!occupied.has(`${x},${y}`)) {
            freeTiles.push({ x, y });
          }
        }
      }

      if (freeTiles.length > 0) {
        const pick = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        this.banana = { x: pick.x, y: pick.y };
      }
    }

    /** Spawns a Golden Banana that stays for 5 seconds */
    spawnGoldenBanana() {
      const occupied = new Set();
      this.snake.forEach(seg => occupied.add(`${seg.x},${seg.y}`));
      occupied.add(`${this.banana.x},${this.banana.y}`);

      const freeTiles = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          if (!occupied.has(`${x},${y}`)) {
            freeTiles.push({ x, y });
          }
        }
      }

      if (freeTiles.length > 0) {
        const pick = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        this.goldenBanana = {
          x: pick.x,
          y: pick.y,
          spawnTime: performance.now(),
          duration: GOLDEN_BANANA_DURATION,
          remaining: GOLDEN_BANANA_DURATION
        };

        this.sound.playGoldenSpawn();

        // Spawn welcoming sparkling particles
        const gx = pick.x * TILE_SIZE + TILE_SIZE / 2;
        const gy = pick.y * TILE_SIZE + TILE_SIZE / 2;
        for (let i = 0; i < 14; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 25 + Math.random() * 50;
          this.particles.push(new Particle(
            gx, gy, '#ffd700', 3,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.5 + Math.random() * 0.4
          ));
        }

        this.floatingTexts.push(new FloatingText(
          gx - 20, gy - 12, 'GOLDEN!', '#ffd700', '10px "Press Start 2P", monospace', 1.0
        ));
      }
    }

    /** Queue a direction change with 180-degree reversal prevention */
    requestDirection(newDir) {
      if (this.state !== 'PLAYING') return;

      // Determine the reference direction: the last queued direction if any, or currentDir
      const lastDir = this.directionQueue.length > 0
        ? this.directionQueue[this.directionQueue.length - 1]
        : this.currentDir;

      // Disallow 180-degree direct reverse (e.g. Right -> Left or Up -> Down)
      if (newDir.x === -lastDir.x && newDir.y === -lastDir.y) {
        return;
      }

      // Disallow duplicate direction queues
      if (newDir.x === lastDir.x && newDir.y === lastDir.y) {
        return;
      }

      // Limit queue length to 2 inputs to prevent laggy control buffering
      if (this.directionQueue.length < 2) {
        this.directionQueue.push(newDir);
      }
    }

    /** Core physics step: updates snake position and checks collisions */
    stepPhysics() {
      // Dequeue next direction if available
      if (this.directionQueue.length > 0) {
        this.currentDir = this.directionQueue.shift();
      }

      const head = this.snake[0];
      const newHead = {
        x: head.x + this.currentDir.x,
        y: head.y + this.currentDir.y
      };

      // 1. Wall collision check
      if (
        newHead.x < 0 || newHead.x >= GRID_SIZE ||
        newHead.y < 0 || newHead.y >= GRID_SIZE
      ) {
        this.triggerGameOver();
        return;
      }

      // 2. Self collision check: if snake grows, the tail remains occupied; if not growing, tail vacates
      const willGrow = (newHead.x === this.banana.x && newHead.y === this.banana.y) ||
                       (this.goldenBanana && newHead.x === this.goldenBanana.x && newHead.y === this.goldenBanana.y);
      const bodyToCheck = willGrow ? this.snake.length : this.snake.length - 1;

      for (let i = 0; i < bodyToCheck; i++) {
        if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
          this.triggerGameOver();
          return;
        }
      }

      // Place new head at the beginning of the snake
      this.snake.unshift(newHead);

      let grew = false;

      // 3. Regular banana check
      if (newHead.x === this.banana.x && newHead.y === this.banana.y) {
        this.score += 1;
        this.bananasEaten += 1;
        grew = true;
        this.sound.playEat();

        // Spawn eat particles
        const bx = this.banana.x * TILE_SIZE + TILE_SIZE / 2;
        const by = this.banana.y * TILE_SIZE + TILE_SIZE / 2;
        for (let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 25 + Math.random() * 45;
          this.particles.push(new Particle(
            bx, by, '#ffd214', 2.5,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.4 + Math.random() * 0.3
          ));
        }

        this.floatingTexts.push(new FloatingText(bx - 6, by - 8, '+1', '#ffe14a'));

        // Speed increase every 5 bananas
        if (this.bananasEaten % GOLDEN_BANANA_INTERVAL === 0) {
          if (this.currentSpeedMs > MIN_SPEED_MS) {
            this.currentSpeedMs = Math.max(MIN_SPEED_MS, this.currentSpeedMs - SPEED_STEP_MS);
            this.sound.playSpeedUp();
            this.floatingTexts.push(new FloatingText(bx - 24, by - 22, 'SPEED UP!', '#76dc56', '8px "Press Start 2P"', 1.1));
          }

          // Trigger Golden Banana
          this.spawnGoldenBanana();
        }

        this.spawnBanana();
      }

      // 4. Golden banana check
      if (this.goldenBanana && newHead.x === this.goldenBanana.x && newHead.y === this.goldenBanana.y) {
        this.score += GOLDEN_BANANA_POINTS;
        grew = true;
        this.sound.playGoldenEat();

        const gx = this.goldenBanana.x * TILE_SIZE + TILE_SIZE / 2;
        const gy = this.goldenBanana.y * TILE_SIZE + TILE_SIZE / 2;

        // Sparkle explosion
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 35 + Math.random() * 85;
          this.particles.push(new Particle(
            gx, gy, '#ffea00', 3,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.6 + Math.random() * 0.4
          ));
        }

        this.floatingTexts.push(new FloatingText(gx - 28, gy - 16, '+5 GOLDEN!', '#ffd700', '10px "Press Start 2P"', 1.3));

        this.goldenBanana = null; // Collected!
      }

      // If no food was eaten this step, pop the tail segment
      if (!grew) {
        this.snake.pop();
      }

      this.updateHUD();
    }

    /** Update Golden Banana countdown timer */
    updateGoldenBanana(dt) {
      if (!this.goldenBanana) {
        this.goldenBanner.classList.remove('active');
        return;
      }

      this.goldenBanana.remaining -= dt * 1000;

      if (this.goldenBanana.remaining <= 0) {
        // Expired!
        const gx = this.goldenBanana.x * TILE_SIZE + TILE_SIZE / 2;
        const gy = this.goldenBanana.y * TILE_SIZE + TILE_SIZE / 2;

        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 20 + Math.random() * 35;
          this.particles.push(new Particle(
            gx, gy, '#8d6e63', 2,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.4
          ));
        }

        this.sound.playGoldenExpire();
        this.goldenBanana = null;
        this.goldenBanner.classList.remove('active');
      } else {
        // Update Golden Banana countdown UI banner
        const secondsLeft = (this.goldenBanana.remaining / 1000).toFixed(1);
        const percent = Math.max(0, (this.goldenBanana.remaining / GOLDEN_BANANA_DURATION) * 100);

        this.goldenBanner.classList.add('active');
        this.goldenTimeLeftEl.textContent = `${secondsLeft}s`;
        this.goldenBarFill.style.width = `${percent}%`;
      }
    }

    /** Update Scoreboard HUD */
    updateHUD() {
      this.scoreEl.textContent = this.score;

      // Update High Score live if surpassed
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.highScoreEl.textContent = this.highScore;
      }

      // Speed multiplier display (1.0x, 1.2x, etc.)
      const multiplier = (INITIAL_SPEED_MS / this.currentSpeedMs).toFixed(1);
      this.speedEl.textContent = `${multiplier}x`;
    }

    /** Main Game Loop using requestAnimationFrame + fixed timestep accumulator */
    gameLoop(timestamp) {
      const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1); // Clamp to prevent spiral of death
      this.lastFrameTime = timestamp;

      if (this.state === 'PLAYING') {
        this.accumulator += dt * 1000;
        this.updateGoldenBanana(dt);

        // Fixed timestep consumption for smooth movement
        while (this.accumulator >= this.currentSpeedMs) {
          this.stepPhysics();
          this.accumulator -= this.currentSpeedMs;
          if (this.state !== 'PLAYING') break;
        }
      }

      // Update screen shake
      if (this.screenShakeTime > 0) {
        this.screenShakeTime -= dt;
      }

      // Update particles
      this.particles = this.particles.filter(p => p.update(dt));
      this.floatingTexts = this.floatingTexts.filter(t => t.update(dt));

      // Render stage
      this.render(timestamp);

      requestAnimationFrame(this.gameLoop);
    }

    /* ========================================================================
       5. RENDERING PIPELINE (Canvas Pixel Art)
       ======================================================================== */
    render(timestamp = performance.now()) {
      const ctx = this.ctx;

      ctx.save();

      // Screen Shake effect on game over
      if (this.screenShakeTime > 0) {
        const shakeMag = (this.screenShakeTime / 0.35) * 5;
        const offsetX = (Math.random() - 0.5) * shakeMag;
        const offsetY = (Math.random() - 0.5) * shakeMag;
        ctx.translate(offsetX, offsetY);
      }

      // 1. Draw Turf Background Grid
      this.drawTurfGrid(ctx);

      // 2. Draw Regular Banana
      this.drawRegularBanana(ctx, this.banana.x, this.banana.y, timestamp);

      // 3. Draw Golden Banana (if active)
      if (this.goldenBanana) {
        this.drawGoldenBanana(ctx, this.goldenBanana.x, this.goldenBanana.y, timestamp);
      }

      // 4. Draw Snake
      this.drawSnake(ctx, timestamp);

      // 5. Draw Particles & Floating Text
      this.particles.forEach(p => p.draw(ctx));
      this.floatingTexts.forEach(t => t.draw(ctx));

      ctx.restore();
    }

    /** Draw alternating jungle turf tiles with subtle pixel grass details */
    drawTurfGrid(ctx) {
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          const isAlt = (x + y) % 2 === 0;
          ctx.fillStyle = isAlt ? '#142d1d' : '#102417';
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      // Subtle decorative grass blades
      ctx.fillStyle = '#1b3b26';
      this.grassBlades.forEach(blade => {
        const px = blade.x * TILE_SIZE;
        const py = blade.y * TILE_SIZE;
        if (blade.type === 0) {
          ctx.fillRect(px + 6, py + 8, 2, 4);
          ctx.fillRect(px + 8, py + 6, 2, 6);
        } else if (blade.type === 1) {
          ctx.fillRect(px + 14, py + 12, 2, 5);
          ctx.fillRect(px + 16, py + 10, 2, 7);
        } else {
          ctx.fillRect(px + 10, py + 14, 3, 3);
        }
      });
    }

    /** Pixel-art regular bright yellow banana */
    drawRegularBanana(ctx, gx, gy, timestamp) {
      const cx = gx * TILE_SIZE + TILE_SIZE / 2;
      const cy = gy * TILE_SIZE + TILE_SIZE / 2;

      // Gentle idle floating bob
      const bob = Math.sin(timestamp * 0.005) * 1.5;

      ctx.save();
      ctx.translate(cx, cy + bob);

      // Shadow underneath
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 7 - bob * 0.5, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Curved Banana Body (Pixel/Arcade Crescent)
      // Base dark peel outline
      ctx.fillStyle = '#553c00';
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0.25 * Math.PI, 1.15 * Math.PI, false);
      ctx.arc(2, -3, 8.5, 1.15 * Math.PI, 0.25 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Main Bright Yellow Peel
      ctx.fillStyle = '#ffd214';
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0.28 * Math.PI, 1.12 * Math.PI, false);
      ctx.arc(1.8, -2.6, 7.5, 1.12 * Math.PI, 0.28 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Top Highlight Peel Line
      ctx.fillStyle = '#fff478';
      ctx.beginPath();
      ctx.arc(1, -1, 6.5, 0.45 * Math.PI, 0.95 * Math.PI, false);
      ctx.arc(2.2, -2.4, 6.5, 0.95 * Math.PI, 0.45 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Stem (Top Green/Brown)
      ctx.fillStyle = '#4e5a1b';
      ctx.fillRect(-7, -4, 2.5, 2.5);

      // Tip (Bottom Dark Brown)
      ctx.fillStyle = '#3a2008';
      ctx.fillRect(5, 5, 2.5, 2.5);

      ctx.restore();
    }

    /** Pixel-art shimmering Golden Banana with pulsing aura & timer ring */
    drawGoldenBanana(ctx, gx, gy, timestamp) {
      const cx = gx * TILE_SIZE + TILE_SIZE / 2;
      const cy = gy * TILE_SIZE + TILE_SIZE / 2;

      const bob = Math.sin(timestamp * 0.008) * 2;
      const pulse = (Math.sin(timestamp * 0.012) + 1) / 2; // 0 to 1

      ctx.save();
      ctx.translate(cx, cy + bob);

      // Golden Pulsing Radial Glow
      const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16 + pulse * 6);
      glowGrad.addColorStop(0, 'rgba(255, 235, 59, 0.7)');
      glowGrad.addColorStop(0.5, 'rgba(255, 183, 0, 0.35)');
      glowGrad.addColorStop(1, 'rgba(255, 183, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 8 - bob * 0.5, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Banana Outline
      ctx.fillStyle = '#7a4e00';
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0.25 * Math.PI, 1.15 * Math.PI, false);
      ctx.arc(2, -3, 9.5, 1.15 * Math.PI, 0.25 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Golden Metallic Peel
      const goldGrad = ctx.createLinearGradient(-8, -8, 8, 8);
      goldGrad.addColorStop(0, '#fff176');
      goldGrad.addColorStop(0.4, '#ffd700');
      goldGrad.addColorStop(0.8, '#ff9800');
      goldGrad.addColorStop(1, '#ffc107');

      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 8.2, 0.28 * Math.PI, 1.12 * Math.PI, false);
      ctx.arc(1.8, -2.6, 8.2, 1.12 * Math.PI, 0.28 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Sparkling specular highlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(1, -1, 6.8, 0.45 * Math.PI, 0.90 * Math.PI, false);
      ctx.arc(2.2, -2.4, 6.8, 0.90 * Math.PI, 0.45 * Math.PI, true);
      ctx.closePath();
      ctx.fill();

      // Stem & Tip
      ctx.fillStyle = '#423000';
      ctx.fillRect(-8, -5, 3, 3);
      ctx.fillRect(6, 6, 3, 3);

      // Little rotating sparkle stars around the banana
      const starAngle = timestamp * 0.004;
      for (let s = 0; s < 3; s++) {
        const offset = starAngle + (s * (Math.PI * 2 / 3));
        const sx = Math.cos(offset) * 13;
        const sy = Math.sin(offset) * 9;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
      }

      // Mini timer pie indicator above the banana
      if (this.goldenBanana) {
        const ratio = Math.max(0, this.goldenBanana.remaining / GOLDEN_BANANA_DURATION);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -11, 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * ratio), false);
        ctx.stroke();
      }

      ctx.restore();
    }

    /** Draw the cute green snake with direction-aware eyes & animated tongue */
    drawSnake(ctx, timestamp) {
      if (this.snake.length === 0) return;

      const pad = 1.5;
      const segSize = TILE_SIZE - pad * 2;

      // Draw Body Segments (from tail up to segment 1)
      for (let i = this.snake.length - 1; i >= 1; i--) {
        const seg = this.snake[i];
        const prev = this.snake[i - 1]; // Closer to head
        const sx = seg.x * TILE_SIZE + pad;
        const sy = seg.y * TILE_SIZE + pad;

        // Alternating segment pattern for retro charm
        const isOdd = i % 2 === 1;
        ctx.fillStyle = isOdd ? '#38a12c' : '#2e8b23';
        this.fillRoundedRect(ctx, sx, sy, segSize, segSize, 4);

        // Scale pattern stripe
        ctx.fillStyle = '#64cf44';
        ctx.fillRect(sx + 3, sy + 3, segSize - 6, 3);

        // Subtle dark pixel border outline
        ctx.strokeStyle = '#184a16';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, segSize - 1, segSize - 1);

        // Seamless connector bridge between adjacent segments
        if (prev) {
          const connX = (seg.x + prev.x) / 2 * TILE_SIZE + pad;
          const connY = (seg.y + prev.y) / 2 * TILE_SIZE + pad;
          ctx.fillStyle = ctx.fillStyle;
          ctx.fillRect(
            Math.min(sx, connX),
            Math.min(sy, connY),
            Math.abs(sx - connX) + segSize,
            Math.abs(sy - connY) + segSize
          );
        }
      }

      // Draw Head (Segment 0)
      const head = this.snake[0];
      const hx = head.x * TILE_SIZE + pad;
      const hy = head.y * TILE_SIZE + pad;

      // Base Head Shape
      ctx.fillStyle = '#48bb3a';
      this.fillRoundedRect(ctx, hx, hy, segSize, segSize, 6);

      // Top Head Highlight
      ctx.fillStyle = '#76dc56';
      ctx.fillRect(hx + 3, hy + 2, segSize - 6, 3);

      // Head Border
      ctx.strokeStyle = '#184a16';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx + 0.5, hy + 0.5, segSize - 1, segSize - 1);

      // Rosy Cheeks
      ctx.fillStyle = '#ff8ca3';
      if (this.currentDir === DIR.RIGHT || this.currentDir === DIR.LEFT) {
        ctx.fillRect(hx + (this.currentDir === DIR.RIGHT ? 9 : 3), hy + 3, 3, 2.5);
        ctx.fillRect(hx + (this.currentDir === DIR.RIGHT ? 9 : 3), hy + segSize - 5.5, 3, 2.5);
      } else {
        ctx.fillRect(hx + 3, hy + (this.currentDir === DIR.DOWN ? 9 : 3), 2.5, 3);
        ctx.fillRect(hx + segSize - 5.5, hy + (this.currentDir === DIR.DOWN ? 9 : 3), 2.5, 3);
      }

      // Cute Eyes: Positioned according to current movement direction
      this.drawSnakeEyes(ctx, hx, hy, segSize, this.currentDir);

      // Flicking Forked Tongue (Flicks every ~1.6 seconds for 200ms)
      const tongueCycle = timestamp % 1600;
      if (tongueCycle < 240 && this.state === 'PLAYING') {
        this.drawSnakeTongue(ctx, hx, hy, segSize, this.currentDir);
      }
    }

    /** Draw expressive pixel-art eyes */
    drawSnakeEyes(ctx, hx, hy, size, dir) {
      let eye1 = { x: 0, y: 0 };
      let eye2 = { x: 0, y: 0 };
      let pupilOffset = { x: 0, y: 0 };

      if (dir === DIR.RIGHT) {
        eye1 = { x: hx + size - 7, y: hy + 4 };
        eye2 = { x: hx + size - 7, y: hy + size - 9 };
        pupilOffset = { x: 1, y: 0 };
      } else if (dir === DIR.LEFT) {
        eye1 = { x: hx + 2, y: hy + 4 };
        eye2 = { x: hx + 2, y: hy + size - 9 };
        pupilOffset = { x: -1, y: 0 };
      } else if (dir === DIR.UP) {
        eye1 = { x: hx + 4, y: hy + 2 };
        eye2 = { x: hx + size - 9, y: hy + 2 };
        pupilOffset = { x: 0, y: -1 };
      } else if (dir === DIR.DOWN) {
        eye1 = { x: hx + 4, y: hy + size - 7 };
        eye2 = { x: hx + size - 9, y: hy + size - 7 };
        pupilOffset = { x: 0, y: 1 };
      }

      const eyeWidth = 5;
      const eyeHeight = 5;

      // Eye Whites
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(eye1.x, eye1.y, eyeWidth, eyeHeight);
      ctx.fillRect(eye2.x, eye2.y, eyeWidth, eyeHeight);

      // Pupils (looking in movement direction)
      ctx.fillStyle = '#0c2012';
      ctx.fillRect(eye1.x + 1 + pupilOffset.x, eye1.y + 1 + pupilOffset.y, 3, 3);
      ctx.fillRect(eye2.x + 1 + pupilOffset.x, eye2.y + 1 + pupilOffset.y, 3, 3);

      // Tiny white specular glint in eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(eye1.x + 1, eye1.y + 1, 1, 1);
      ctx.fillRect(eye2.x + 1, eye2.y + 1, 1, 1);
    }

    /** Draw cute forked red tongue extending from head */
    drawSnakeTongue(ctx, hx, hy, size, dir) {
      ctx.fillStyle = '#f44336';
      let tx = hx + size / 2;
      let ty = hy + size / 2;

      if (dir === DIR.RIGHT) {
        tx = hx + size + 1;
        ctx.fillRect(tx, ty - 1, 4, 2);
        ctx.fillRect(tx + 4, ty - 3, 2, 2); // Fork upper
        ctx.fillRect(tx + 4, ty + 1, 2, 2); // Fork lower
      } else if (dir === DIR.LEFT) {
        tx = hx - 5;
        ctx.fillRect(tx + 1, ty - 1, 4, 2);
        ctx.fillRect(tx - 1, ty - 3, 2, 2);
        ctx.fillRect(tx - 1, ty + 1, 2, 2);
      } else if (dir === DIR.UP) {
        ty = hy - 5;
        ctx.fillRect(tx - 1, ty + 1, 2, 4);
        ctx.fillRect(tx - 3, ty - 1, 2, 2);
        ctx.fillRect(tx + 1, ty - 1, 2, 2);
      } else if (dir === DIR.DOWN) {
        ty = hy + size + 1;
        ctx.fillRect(tx - 1, ty, 2, 4);
        ctx.fillRect(tx - 3, ty + 4, 2, 2);
        ctx.fillRect(tx + 1, ty + 4, 2, 2);
      }
    }

    /** Helper: Rounded rectangle on Canvas */
    fillRoundedRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }

    /* ========================================================================
       6. INPUT CONTROLLERS (Desktop & Mobile)
       ======================================================================== */
    setupControls() {
      // 1. Keyboard Controls
      window.addEventListener('keydown', (e) => {
        // Prevent browser scrolling with arrow keys / space
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }

        // Initialize audio on first key
        this.sound.initContext();

        switch (e.code) {
          // Up
          case 'ArrowUp':
          case 'KeyW':
            if (this.state === 'PLAYING') this.requestDirection(DIR.UP);
            else if (this.state === 'START') this.startGame();
            break;

          // Down
          case 'ArrowDown':
          case 'KeyS':
            if (this.state === 'PLAYING') this.requestDirection(DIR.DOWN);
            else if (this.state === 'START') this.startGame();
            break;

          // Left
          case 'ArrowLeft':
          case 'KeyA':
            if (this.state === 'PLAYING') this.requestDirection(DIR.LEFT);
            else if (this.state === 'START') this.startGame();
            break;

          // Right
          case 'ArrowRight':
          case 'KeyD':
            if (this.state === 'PLAYING') this.requestDirection(DIR.RIGHT);
            else if (this.state === 'START') this.startGame();
            break;

          // Pause
          case 'KeyP':
          case 'Space':
            if (this.state === 'PLAYING' || this.state === 'PAUSED') {
              this.togglePause();
            } else if (this.state === 'START') {
              this.startGame();
            }
            break;

          // Restart
          case 'KeyR':
            this.startGame();
            break;

          // Mute
          case 'KeyM':
            this.handleMuteToggle();
            break;
        }
      });

      // 2. Button Listeners
      this.btnStart.addEventListener('click', () => this.startGame());
      this.btnPlayAgain.addEventListener('click', () => this.startGame());
      this.btnResume.addEventListener('click', () => this.togglePause());
      this.btnPause.addEventListener('click', () => this.togglePause());
      this.btnRestart.addEventListener('click', () => this.startGame());
      this.btnSound.addEventListener('click', () => this.handleMuteToggle());

      // 3. Mobile Virtual D-Pad Touch Listeners
      const bindDpad = (btn, dir) => {
        const handler = (e) => {
          e.preventDefault();
          this.sound.initContext();
          if (this.state === 'PLAYING') {
            this.requestDirection(dir);
          } else if (this.state === 'START') {
            this.startGame();
          }
        };
        btn.addEventListener('pointerdown', handler);
      };

      bindDpad(this.dpadUp, DIR.UP);
      bindDpad(this.dpadDown, DIR.DOWN);
      bindDpad(this.dpadLeft, DIR.LEFT);
      bindDpad(this.dpadRight, DIR.RIGHT);

      // 4. Mobile Canvas Swipe Gestures
      let touchStartX = 0;
      let touchStartY = 0;
      const SWIPE_THRESHOLD = 20; // Minimum pixel drag to qualify as swipe

      this.canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        this.sound.initContext();
      }, { passive: false });

      this.canvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Stop mobile pull-to-refresh & screen drag
      }, { passive: false });

      this.canvas.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 0) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        if (this.state === 'START') {
          this.startGame();
          return;
        }

        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
          // Tap on canvas unpauses if paused
          if (this.state === 'PAUSED') this.togglePause();
          return;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe
          if (dx > 0) this.requestDirection(DIR.RIGHT);
          else this.requestDirection(DIR.LEFT);
        } else {
          // Vertical swipe
          if (dy > 0) this.requestDirection(DIR.DOWN);
          else this.requestDirection(DIR.UP);
        }
      }, { passive: false });
    }

    /** Handle audio toggle */
    handleMuteToggle() {
      const isMuted = this.sound.toggleMute();
      this.updateSoundButtonUI();
      if (!isMuted) {
        this.sound.playEat();
      }
    }

    /** Update Sound On/Off Button Text & Styling */
    updateSoundButtonUI() {
      if (this.sound.isMuted) {
        this.btnSound.innerHTML = '🔇 Sound: OFF';
        this.btnSound.classList.add('muted');
      } else {
        this.btnSound.innerHTML = '🔊 Sound: ON';
        this.btnSound.classList.remove('muted');
      }
    }
  }

  // Auto-instantiate when DOM is loaded
  window.addEventListener('DOMContentLoaded', () => {
    window.peelPatrolGame = new PeelPatrolGame();
  });
})();
