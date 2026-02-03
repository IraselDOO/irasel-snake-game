const VERSION = "v2.16.0 EXPLOSIVE DEATH";
const STATE_START = 'start';
const STATE_PLAYING = 'playing';
const STATE_DEAD = 'dead';
let gameState = STATE_START;

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ambientCanvas = document.getElementById('ambientCanvas');
const ambientCtx = ambientCanvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const startScreen = document.getElementById('startScreen');

// Off-screen board buffer
const boardCanvas = document.createElement('canvas');
const boardCtx = boardCanvas.getContext('2d');
// Note: boardCanvas dimensions are set in updateGridDimensions()

// Stats UI
// Stats UI Cache
const elements = {
    score: document.getElementById('score'),
    mScore: document.getElementById('m-score'),
    apples: document.getElementById('apples'),
    mApples: document.getElementById('m-apples'),
    best: document.getElementById('bestScore'),
    mBest: document.getElementById('m-best'),
    progress: document.getElementById('progressFill'),
    ratio: document.getElementById('ratioText'),
    efficiency: document.getElementById('efficiency'),
    duration: document.getElementById('sessionTime'),
    version: document.querySelectorAll('.version-overlay'),
    startScreen: document.getElementById('startScreen'),
    startBtn: document.getElementById('startBtn'),
    splitZone: document.getElementById('splitZone'),
    joystickZone: document.getElementById('joystickZone'),
    schemeSelect: document.getElementById('controlScheme'),
    schemeSelectMobile: document.getElementById('controlSchemeMobile'),
    joystickBase: document.getElementById('joystickBase'),
    joystickStick: document.getElementById('joystickStick'),
    lastScore: document.getElementById('lastScore'),
    avgScore: document.getElementById('avgScore'),
    statsSummary: document.getElementById('statsSummary'),
    leaderboardContainer: document.getElementById('leaderboardContainer'),
    leaderboardBody: document.getElementById('leaderboardBody'),
    startPrompt: document.getElementById('startPrompt')
};

// Constants
// Constants
// Constants - Dynamic
let GRID_W, GRID_H, TILE_SIZE, DEPTH;
const COLOR_BOARD_BG = '#050510';
const COLOR_SCAR_MARK = 'rgba(0, 255, 204, 0.5)';
const COLOR_BORDER = '#00ffcc';

// State
let snake = [];
let dyingSnake = []; // Physics-based disintegration
let food = {};
let goldenFood = null;
let direction = { x: 0, y: -1 };
let inputQueue = [];
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
const STORAGE_KEY_HISTORY = 'snakeScoreHistory';
let scoreHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
let startTime = 0;
let foodsEaten = 0;
let isPaused = false;
let logicAccumulator = 0;
let lastRenderTime = 0;
let lastLogicTick = 0;
let gameSpeed = 110;

let gridState = [];
let scarState = [];
let snakeHue = 160;
let foodHue = 340;

let particles = [];
let ambientParticles = [];
let floatingTexts = [];
let shakeIntensity = 0;
let borderFlashTimer = 0;
let borderFlashHue = 0;

let moveProgress = 0;
let prevSnake = [];
let glitchTimer = 0;
let lastFoodTime = 0; // Track when food was spawned
let isDarknessActive = false;
let darknessTimer = 0;
let goldenFoodTimer = 0; // Lifespan of golden apple
let currentGoldenChance = 0.05; // Base 5%
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let controlScheme = isTouchDevice ? 'split' : 'keyboard';

class AudioSystem {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    playEat(durationInSeconds) {
        // 1s -> High pitch, 10s -> Low pitch
        // Range: 880Hz down to 220Hz
        const t = Math.max(1, Math.min(10, durationInSeconds));
        // Linear interpolation: freq = 880 - (t-1) * (880-220)/9
        const baseFreq = 880 - (t - 1) * (660 / 9);
        this.osc(baseFreq, 'triangle', 0.15, baseFreq * 2);
    }
    playGameOver() { this.osc(220, 'sawtooth', 0.5, 50); }
    playClick() { this.osc(1200, 'sine', 0.04, 800); } // Short futuristic click
    osc(freq, type, duration, endFreq) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq || freq, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    }
}
const audio = new AudioSystem();

function init() {
    try {
        window.addEventListener('resize', () => {
            resizeAmbient();
            updateGridDimensions(); // Adaptive resize
            renderBoardBuffer(); // Redraw grid on resize
        });
        resizeAmbient();
        updateGridDimensions();
        initGridState();
        updateStatsUI(0);
        renderBoardBuffer();
        initAmbientParticles();
        initMobileControls();
        console.log("System Ready - " + VERSION);
        requestAnimationFrame(renderLoop);
    } catch (e) {
        console.error("Init Error:", e);
        alert("Init Error: " + e.message);
    }
}

function updateGridDimensions() {
    const isMobile = window.innerWidth <= 950;

    if (isMobile) {
        GRID_W = 18;
        GRID_H = 32; // 9:16 Portrait
        canvas.width = 540;
        canvas.height = 960;
    } else {
        GRID_W = 24;
        GRID_H = 24; // 1:1 Square Desktop
        canvas.width = 600;
        canvas.height = 600;
    }

    // Recalculate derived constants
    TILE_SIZE = canvas.width / GRID_W;
    DEPTH = TILE_SIZE * 0.15;

    // Update buffer canvas and display height
    boardCanvas.width = canvas.width;
    boardCanvas.height = canvas.height;

    // Sync version text
    if (elements.version) {
        elements.version.forEach(v => v.textContent = VERSION);
    }

    // Force control scheme on mobile
    if (isMobile && (controlScheme === 'keyboard' || !controlScheme)) {
        controlScheme = 'split';
        if (elements.schemeSelect) elements.schemeSelect.value = 'split';
        if (elements.schemeSelectMobile) elements.schemeSelectMobile.value = 'split';
        if (elements.splitZone) elements.splitZone.classList.remove('hidden');
    }
}

function resizeAmbient() {
    ambientCanvas.width = window.innerWidth;
    ambientCanvas.height = window.innerHeight;
}

function initAmbientParticles() {
    ambientParticles = [];
    for (let i = 0; i < 150; i++) {
        ambientParticles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: 1 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            alpha: 0.1 + Math.random() * 0.4
        });
    }
}

function initGridState() {
    gridState = []; scarState = [];
    for (let x = 0; x < GRID_W; x++) {
        gridState[x] = []; scarState[x] = [];
        for (let y = 0; y < GRID_H; y++) {
            gridState[x][y] = 0; scarState[x][y] = false;
        }
    }
}

function startGame() {
    if (gameState === STATE_PLAYING) return;
    try {
        // RESET EVERYTHING
        snake = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }];
        dyingSnake = [];
        direction = { x: 0, y: -1 };
        inputQueue = [];
        particles = [];
        floatingTexts = [];
        glitchTimer = 0;
        shakeIntensity = 0;
        isDarknessActive = false;
        darknessTimer = 0;
        currentGoldenChance = 0.05;
        prevSnake = snake.map(s => ({ ...s }));

        score = 0; foodsEaten = 0; startTime = performance.now(); gameSpeed = 110;
        snakeHue = 160; foodHue = (snakeHue + 180) % 360;
        borderFlashTimer = 0;
        initGridState();
        renderBoardBuffer();

        if (elements.startScreen) elements.startScreen.classList.add('hidden');
        gameState = STATE_PLAYING;
        isPaused = false;
        spawnFood(); updateStatsUI(0);
        lastFoodTime = performance.now(); // Consistent high-res timer
        lastRenderTime = performance.now();
        lastLogicTick = lastRenderTime;
        logicAccumulator = 0;
        moveProgress = 0;
    } catch (e) {
        console.error("Start Game Error:", e);
        alert("Start Error: " + e.message);
    }
}

function gameLoop() {
    if (gameState !== STATE_PLAYING || isPaused) return;

    if (inputQueue.length > 0) {
        const next = inputQueue.shift();
        if (next.x !== -direction.x || next.y !== -direction.y) {
            direction = next;
        }
    }

    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    if (head.x < 0 || head.x >= GRID_W || head.y < 0 || head.y >= GRID_H) { gameOver(); return; }
    for (let p of snake) if (head.x === p.x && head.y === p.y) { gameOver(); return; }

    gridState[head.x][head.y]++;
    prevSnake = snake.map(s => ({ ...s }));
    moveProgress = 0;
    lastLogicTick = performance.now();
    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        // Calculate base reward with time decay: 10 - seconds since spawn, min 1.
        const secondsElapsed = Math.floor((performance.now() - lastFoodTime) / 1000);
        let reward = Math.max(1, 10 - secondsElapsed);

        // Darkness Bonus (if active): apple points + snake length
        if (isDarknessActive) {
            reward += snake.length;
        }

        score += reward; foodsEaten++; spawnFood(); updateStatsUI(score);

        if (isDarknessActive) {
            isDarknessActive = false;
            darknessTimer = 0;
            spawnParticles(head.x, head.y, 60, 40); // Flash of light
        }

        head.hasFood = true; scarState[head.x][head.y] = true;
        borderFlashTimer = 1.0; borderFlashHue = foodHue;
        shakeIntensity = 12;

        const eatDuration = (performance.now() - lastFoodTime) / 1000;
        audio.playEat(eatDuration);
        lastFoodTime = performance.now();

        spawnParticles(head.x, head.y, foodHue);
        spawnFloatingText(head.x, head.y, `+${reward}`, isDarknessActive ? "#00ffcc" : "#fff");

        snakeHue = (snakeHue + 5) % 360; foodHue = (snakeHue + 180) % 360;
        if (gameSpeed > 60) gameSpeed -= 1;
    } else if (goldenFood && head.x === goldenFood.x && head.y === goldenFood.y) {
        const reward = 5;
        score += reward; foodsEaten++; goldenFood = null; updateStatsUI(score);
        isDarknessActive = true;
        darknessTimer = 10000;
        shakeIntensity = 25;
        audio.playEat(2);
        spawnParticles(head.x, head.y, 45);
        spawnFloatingText(head.x, head.y, "DARKNESS", "#ffd700");
        gameSpeed = Math.max(60, gameSpeed - 2);
    } else {
        snake.pop();
    }
    renderBoardBuffer();
}

function drawAmbientDust(dt) {
    const time = performance.now() * 0.001;
    const speedMult = (gameState === STATE_PLAYING) ? 1 + (110 - gameSpeed) / 20 : 0.5;
    const spd = (dt / 16.67) * speedMult;

    ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
    for (let p of ambientParticles) {
        p.x += p.vx * spd; p.y += p.vy * spd;
        if (p.x < 0) p.x = ambientCanvas.width; if (p.x > ambientCanvas.width) p.x = 0;
        if (p.y < 0) p.y = ambientCanvas.height; if (p.y > ambientCanvas.height) p.y = 0;
        const flicker = 0.8 + Math.sin(time * 5 + p.x) * 0.2;
        ambientCtx.fillStyle = `rgba(180, 255, 240, ${p.alpha * flicker})`;
        ambientCtx.beginPath(); ambientCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ambientCtx.fill();
    }
}

function renderLoop(currentTime) {
    requestAnimationFrame(renderLoop);
    const dt = Math.min(100, currentTime - lastRenderTime);
    lastRenderTime = currentTime;


    drawAmbientDust(dt);
    if (isPaused) { drawPauseOverlay(); return; }

    if (gameState === STATE_PLAYING) {
        logicAccumulator += dt;
        while (logicAccumulator >= gameSpeed) {
            gameLoop();
            logicAccumulator -= gameSpeed;
        }
        // Sub-pixel interpolation factor
        moveProgress = logicAccumulator / gameSpeed;
    }

    let dx = 0, dy = 0;
    if (shakeIntensity > 0) {
        dx = (Math.random() - 0.5) * shakeIntensity; dy = (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity *= Math.pow(0.9, dt / 16.67);
    }
    if (borderFlashTimer > 0) borderFlashTimer -= (0.05 * dt / 16.67);
    if (isDarknessActive) {
        darknessTimer -= dt;
        if (darknessTimer <= 0) isDarknessActive = false;
    }

    if (goldenFood) {
        goldenFoodTimer -= dt;
        if (goldenFoodTimer <= 0) {
            goldenFood = null;
            currentGoldenChance = 0.01; // Penalty: chance drops to 1% if missed
        }
    }

    ctx.save();
    ctx.translate(dx, dy);

    if (glitchTimer > 0) {
        // Removed heavy SVG filter for performance
        // ctx.filter = `url(#chromatic) hue-rotate(${Math.random() * 360}deg)`;

        // Simple shake instead
        dx += (Math.random() - 0.5) * 10;
        dy += (Math.random() - 0.5) * 10;
        glitchTimer -= dt;
    }

    if (isDarknessActive) {
        // DRAW IN DARKNESS
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Create Highlight Beam
        const headPos = {
            x: (snake[0].x + direction.x * moveProgress) * TILE_SIZE + TILE_SIZE / 2,
            y: (snake[0].y + direction.y * moveProgress) * TILE_SIZE + TILE_SIZE / 2
        };
        const beamAngle = Math.atan2(direction.y, direction.x);

        ctx.beginPath();
        ctx.moveTo(headPos.x, headPos.y);
        ctx.arc(headPos.x, headPos.y, 800, beamAngle - Math.PI / 10, beamAngle + Math.PI / 10); // Narrower beam (18 deg each side)
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(boardCanvas, 0, 0);
        drawBoardBorder();

        if (gameState !== STATE_START) {
            const foodColors = getThemeColors(foodHue);
            const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.15;
            drawCrystal3D(food.x, food.y, foodColors, pulse);
        }
        ctx.restore();

        // Always draw snake in darkness so user knows where they are
        drawSnake(currentTime, dt);
    } else {
        // REGULAR DRAWING
        ctx.drawImage(boardCanvas, 0, 0);
        drawBoardBorder();

        if (gameState !== STATE_START) {
            const foodColors = getThemeColors(foodHue);
            const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.15;

            if (gameState === STATE_PLAYING) {
                drawCrystal3D(food.x, food.y, foodColors, pulse);
                if (goldenFood) drawDiamond3D(goldenFood.x, goldenFood.y, { top: '#ffd700', side: '#b8860b', glow: '#fff700' }, true, pulse * 1.2, true);
            }
            drawSnake(currentTime, dt);
        }
    }

    renderParticles(dt);
    renderFloatingTexts(dt);
    ctx.restore();
    ctx.filter = 'none';
}

function drawSnake(currentTime, dt) {
    const snakeColors = getThemeColors(snakeHue);
    const targetSnake = (gameState === STATE_DEAD) ? dyingSnake : snake;
    for (let i = targetSnake.length - 1; i >= 0; i--) {
        const s = targetSnake[i];
        let ix, iy, alpha = 1, angle = 0;

        if (gameState === STATE_DEAD) {
            ix = s.x; iy = s.y; alpha = Math.max(0, s.life);
            s.x += s.vx; s.y += s.vy;
            s.vy += 0.05; // Heavier gravity (was 0.02)
            s.life -= 0.015; // Fade slightly faster
        } else {
            const ps = prevSnake[i] || s;
            ix = ps.x + (s.x - ps.x) * moveProgress;
            iy = ps.y + (s.y - ps.y) * moveProgress;
            if (i < snake.length - 1) {
                const next = snake[i + 1];
                angle = Math.atan2(s.y - next.y, s.x - next.x);
            }
        }

        const isHead = (i === 0 && gameState !== STATE_DEAD);
        let sc = isHead ? 1.3 : 1;
        if (i === targetSnake.length - 1) sc = 0.7 * (1 - moveProgress * 0.3); // Smooth tail shrinking

        if (s.hasFood && gameState !== STATE_DEAD) {
            // Breathing pulse: 1.0 to 1.4 scale
            const pulse = 0.2 * Math.sin(currentTime * 0.01 + i * 0.5);
            sc += (0.2 + pulse);

            // Occasional "energy dust" particles
            if (Math.random() < 0.15) {
                spawnParticles(ix, iy, snakeHue, 1, 0.2); // Tiny, slow particles
            }
        }

        ctx.globalAlpha = alpha;
        const shape = s.hasFood ? 'triangle' : 'cube';
        const eyeColor = isHead ? `hsl(${(snakeHue + 180) % 360}, 100%, 70%)` : '#fff';
        drawBlockSmooth3D(ix, iy, snakeColors, isHead, sc, s.hasFood, angle, shape, eyeColor);
    }
    ctx.globalAlpha = 1;
}

function drawCrystal3D(gx, gy, colors, pulse) {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = gy * TILE_SIZE + TILE_SIZE / 2;
    const time = Date.now() * 0.002;
    const sz = (TILE_SIZE / 2.5) * pulse;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(time);
    ctx.fillStyle = colors.top; ctx.shadowColor = colors.glow; ctx.shadowBlur = 15;
    for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3); ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz / 2, 0); ctx.lineTo(0, sz / 2); ctx.lineTo(-sz / 2, 0); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0; const rot2 = -time * 1.5;
    for (let i = 0; i < 4; i++) {
        const ang = rot2 + (i * Math.PI / 2); const dist = sz * 1.8;
        const ox = Math.cos(ang) * dist; const oy = Math.sin(ang) * dist;
        ctx.fillStyle = colors.top; ctx.fillRect(ox - 1, oy - 1, 3, 3);
    }
    ctx.restore();
}

function drawDiamond3D(gx, gy, colors, pulse = false, scale = 1, shimmer = false) {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2; const cy = gy * TILE_SIZE + TILE_SIZE / 2;
    const sz = (TILE_SIZE / 2 - 4) * scale; const d = DEPTH * scale;
    ctx.fillStyle = colors.side;
    ctx.beginPath(); ctx.moveTo(cx, cy - sz + d); ctx.lineTo(cx + sz, cy + d); ctx.lineTo(cx, cy + sz + d); ctx.lineTo(cx - sz, cy + d); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colors.top; if (pulse) { ctx.shadowColor = colors.glow; ctx.shadowBlur = 20; }
    ctx.beginPath(); ctx.moveTo(cx, cy - sz); ctx.lineTo(cx + sz, cy); ctx.lineTo(cx, cy + sz); ctx.lineTo(cx - sz, cy); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    if (shimmer) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.4 * Math.sin(Date.now() * 0.02)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy - sz); ctx.lineTo(cx + sz / 2, cy - sz / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx - sz / 2, cy - sz / 2); ctx.closePath(); ctx.fill();
    }
}

function drawBlockSmooth3D(fx, fy, colors, head = false, scale = 1, shm = false, angle = 0, shape = 'cube', eyeColor = '#fff') {
    const size = (TILE_SIZE - 6) * scale;
    const x = fx * TILE_SIZE + TILE_SIZE / 2;
    const y = fy * TILE_SIZE + TILE_SIZE / 2;
    const r = 4 * scale; const d = DEPTH * scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);

    if (shape === 'triangle') {
        const sz = size / 2;
        // 3D Triangle Side (Shadow)
        ctx.fillStyle = colors.side;
        ctx.beginPath();
        ctx.moveTo(0, -sz + d); ctx.lineTo(sz, sz + d); ctx.lineTo(-sz, sz + d);
        ctx.closePath(); ctx.fill();

        // 3D Triangle Top
        ctx.fillStyle = colors.top;
        ctx.shadowColor = colors.glow; ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz, sz); ctx.lineTo(-sz, sz);
        ctx.closePath(); ctx.fill();
    } else {
        // Standard Cube
        ctx.fillStyle = colors.side; drawRoundedRect(-size / 2, -size / 2 + d, size, size, r); ctx.fill();
        ctx.fillStyle = colors.top; if (head) { ctx.shadowColor = colors.glow; ctx.shadowBlur = 20; }
        drawRoundedRect(-size / 2, -size / 2, size, size, r); ctx.fill();
    }

    if (head) {
        ctx.shadowBlur = 10; ctx.shadowColor = eyeColor; ctx.fillStyle = eyeColor; ctx.beginPath();
        ctx.arc(size / 4, -size / 4, 3 * scale, 0, Math.PI * 2); ctx.arc(size / 4, size / 4, 3 * scale, 0, Math.PI * 2); ctx.fill();
    }

    if (shm) {
        // Restore white flash pulse + subtle energy glow
        const flash = 0.2 + 0.3 * Math.sin(performance.now() * 0.02);
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        if (shape === 'triangle') {
            const sz = size / 2;
            ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz, sz); ctx.lineTo(-sz, sz); ctx.closePath();
        } else {
            drawRoundedRect(-size / 2, -size / 2, size, size, r);
        }
        ctx.fill();
    }
    ctx.restore(); ctx.shadowBlur = 0;
}

function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); }
    ctx.closePath();
}

function renderBoardBuffer() {
    // 1. STATIC BACKGROUND
    boardCtx.fillStyle = COLOR_BOARD_BG;
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    const head = snake[0];

    for (let x = 0; x < GRID_W; x++) {
        for (let y = 0; y < GRID_H; y++) {
            const px = x * TILE_SIZE; const py = y * TILE_SIZE;

            // DELAY LOGIC: If this tile is the current head, show it as unhit (or previous state)
            // preventing the "hole" from appearing before the snake visually arrives.
            let effectiveHitCount = gridState[x][y];
            if (head && x === head.x && y === head.y && effectiveHitCount > 0) {
                effectiveHitCount--;
            }

            const hitCount = Math.min(10, effectiveHitCount);
            const size = TILE_SIZE - 4;
            const r = 4;
            const center = px + TILE_SIZE / 2; const middle = py + TILE_SIZE / 2;

            if (hitCount === 0) {
                // Convex Cell (Raised) - Enhanced
                const d = 3;
                // Side Shadow (Volume)
                boardCtx.fillStyle = '#0a0a20';
                drawRoundedRectInCtx(boardCtx, px + 2, py + 2 + d, size, size, r); boardCtx.fill();

                // Top Face Gradient
                const grad = boardCtx.createLinearGradient(px, py, px + size, py + size);
                grad.addColorStop(0, '#444485'); // Dimmed Top-Left (was #5a5aa0)
                grad.addColorStop(1, '#222250'); // Dimmed Bottom-Right (was #323260)
                boardCtx.fillStyle = grad;
                drawRoundedRectInCtx(boardCtx, px + 2, py + 2, size, size, r); boardCtx.fill();

                // Top Edge Highlight (Soft Glint)
                boardCtx.fillStyle = 'rgba(255, 255, 255, 0.10)';
                drawRoundedRectInCtx(boardCtx, px + 2, py + 2, size, size / 2, r); boardCtx.fill();
            } else {
                // Concave Cell (Sunken) - Enhanced
                const brightness = Math.max(8, 35 - (hitCount * 4)); // Reduced max brightness (was 40)

                // 1. Wall/Shadow (Darkest)
                boardCtx.fillStyle = '#020205';
                drawRoundedRectInCtx(boardCtx, px + 2, py + 2, size, size, r); boardCtx.fill();

                // 2. Floor with Inner Shadow Gradient
                const floorGrad = boardCtx.createLinearGradient(px, py, px, py + size);
                floorGrad.addColorStop(0, `hsl(230, 25%, ${brightness * 0.4}%)`); // Deep shadow at top
                floorGrad.addColorStop(1, `hsl(230, 25%, ${brightness}%)`);       // Liter at bottom
                boardCtx.fillStyle = floorGrad;
                drawRoundedRectInCtx(boardCtx, px + 2, py + 5, size, size - 3, r); boardCtx.fill();

                // 3. Rim Highlight (Crisp "Step" Edge)
                boardCtx.fillStyle = `hsl(200, 40%, ${20 + brightness}%)`;
                boardCtx.fillRect(px + 4, py + size, size - 4, 1.5);
            }

            if (scarState[x][y]) {
                boardCtx.fillStyle = COLOR_SCAR_MARK;
                boardCtx.beginPath(); boardCtx.arc(center, middle, 2.5, 0, Math.PI * 2); boardCtx.fill();
            }
        }
    }
}

function drawRoundedRectInCtx(c, x, y, w, h, r) {
    c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r);
    else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); }
    c.closePath();
}

function drawBoardBorder() {
    ctx.strokeStyle = (borderFlashTimer > 0) ? `hsl(${borderFlashHue}, 100%, 60%)` : COLOR_BORDER;
    ctx.lineWidth = (borderFlashTimer > 0) ? 6 : 2;
    ctx.shadowBlur = (borderFlashTimer > 0) ? 40 : 15; ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeRect(0, 0, canvas.width, canvas.height); ctx.shadowBlur = 0;
}

function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 30px Orbitron'; ctx.fillStyle = '#00ffcc'; ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
}

function spawnFood() {
    let v = false; while (!v) { food = { x: Math.floor(Math.random() * GRID_W), y: Math.floor(Math.random() * GRID_H) }; v = true; for (let p of snake) if (p.x === food.x && p.y === food.y) v = false; }

    if (Math.random() < currentGoldenChance) {
        goldenFood = { x: Math.floor(Math.random() * GRID_W), y: Math.floor(Math.random() * GRID_H) };
        goldenFoodTimer = 5000; // 5 seconds lifespan
        currentGoldenChance = 0.05; // Reset to 5%
    } else {
        currentGoldenChance = Math.min(0.40, currentGoldenChance + 0.02); // Cap at 40%
    }
}

function getThemeColors(h) { return { top: `hsl(${h}, 100%, 50%)`, side: `hsl(${h}, 100%, 30%)`, glow: `hsl(${h}, 100%, 50%)` }; }

function spawnParticles(gx, gy, h, count = 15) {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2; const cy = gy * TILE_SIZE + TILE_SIZE / 2;
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2; const s = 1 + Math.random() * 4;
        particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, hue: h, sz: 2 + Math.random() * 4 });
    }
}

function renderParticles(dt) {
    const spd = dt / 16.67;
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.03 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * p.life, 0, Math.PI * 2); ctx.fill();
    }
}

function spawnFloatingText(gx, gy, t, c = "#fff") { floatingTexts.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE, text: t, life: 1, off: 0, col: c }); }

function renderFloatingTexts(dt) {
    const spd = dt / 16.67;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const f = floatingTexts[i];
        f.off -= (spd * 0.7);
        f.life -= 0.015 * spd;
        if (f.life <= 0) { floatingTexts.splice(i, 1); continue; }

        const progress = 1 - f.life;
        const scale = 0.5 + Math.sin(progress * Math.PI * 0.5) * 2.5;

        ctx.save();
        ctx.translate(f.x, f.y + f.off);
        ctx.scale(scale, scale);
        ctx.globalAlpha = f.life;

        ctx.font = 'bold 32px Orbitron';

        // 1. Draw thick stroke for contrast on ANY background
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, 0, 0);

        // 2. Draw the main colored text
        ctx.fillStyle = f.col;
        ctx.shadowColor = f.col;
        ctx.shadowBlur = 15;
        ctx.fillText(f.text, 0, 0);

        ctx.restore();
    }
}

function updateStatsUI(s) {
    if (elements.score) elements.score.innerText = s;
    if (elements.mScore) elements.mScore.innerText = s;
    if (elements.apples) elements.apples.innerText = foodsEaten;
    if (elements.mApples) elements.mApples.innerText = foodsEaten;

    const best = parseInt(localStorage.getItem('snakeHighScore') || 0);
    if (elements.best) elements.best.innerText = best;
    if (elements.mBest) elements.mBest.innerText = best;

    const ratio = best > 0 ? Math.min(100, Math.floor((s / best) * 100)) : 0;
    if (elements.progress) elements.progress.style.width = ratio + '%';
    if (elements.ratio) elements.ratio.innerText = ratio + '% of Best';

    if (elements.efficiency) {
        elements.efficiency.innerText = foodsEaten > 0 ? ((performance.now() - startTime) / (foodsEaten * 1000)).toFixed(1) + 's' : '0s';
    }
    if (elements.duration && startTime > 0) {
        elements.duration.innerText = Math.floor((performance.now() - startTime) / 1000) + 's';
    }
}

function gameOver() {
    gameState = STATE_DEAD; audio.playGameOver();
    glitchTimer = 1500; shakeIntensity = 40;

    // PHYSICAL DISINTEGRATION: Capture body segments
    dyingSnake = snake.map((s, i) => ({
        x: s.x, y: s.y,
        // More explosive power: 0.3 -> 0.8
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.5, // Initial upward pop
        life: 1.0 + Math.random() * 0.5, hasFood: s.hasFood, angle: (Math.random() * 0.2)
    }));

    for (let s of snake) spawnParticles(s.x, s.y, snakeHue, 20);

    const h1 = elements.startScreen.querySelector('h1');
    const p = elements.startScreen.querySelector('p');

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        if (h1) h1.textContent = "NEW RECORD!";
    } else {
        if (h1) h1.textContent = "GAME OVER";
    }

    const sessionDuration = Math.floor((performance.now() - startTime) / 1000);
    if (p) p.textContent = `Score: ${score} | Apples: ${foodsEaten} | Time: ${sessionDuration}s`;
    if (elements.startBtn) elements.startBtn.textContent = "REBOOT SYSTEM";

    // Score History Management
    saveScore(score);
    updateGameOverUI(score);

    setTimeout(() => {
        if (gameState === STATE_DEAD && elements.startScreen) {
            elements.startScreen.classList.remove('hidden');
        }
    }, 1500); // Reduced delay for better feel
}

function saveScore(s) {
    const entry = {
        score: s,
        date: new Date().toLocaleDateString(),
        timestamp: Date.now()
    };
    scoreHistory.push(entry);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(scoreHistory));
}

function getAverageScore() {
    if (scoreHistory.length === 0) return 0;
    const total = scoreHistory.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(total / scoreHistory.length);
}

function updateGameOverUI(currentScore) {
    if (elements.lastScore) elements.lastScore.textContent = currentScore;
    if (elements.avgScore) elements.avgScore.textContent = getAverageScore();
    if (elements.statsSummary) elements.statsSummary.classList.remove('hidden');

    // Update Leaderboard
    if (elements.leaderboardBody) {
        const topTen = [...scoreHistory]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        elements.leaderboardBody.innerHTML = '';
        topTen.forEach((entry, index) => {
            const row = document.createElement('tr');
            if (entry.score === currentScore && entry.timestamp >= Date.now() - 5000) {
                row.classList.add('top-record');
            }
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.score}</td>
                <td>${entry.date}</td>
            `;
            elements.leaderboardBody.appendChild(row);
        });
        if (elements.leaderboardContainer) elements.leaderboardContainer.classList.remove('hidden');
    }

    if (elements.startPrompt) elements.startPrompt.classList.add('hidden');
}

function initMobileControls() {
    // Sync UI with initial state
    if (elements.schemeSelect) elements.schemeSelect.value = controlScheme;
    if (elements.schemeSelectMobile) elements.schemeSelectMobile.value = controlScheme;
    updateControlVisibility();

    function updateControlVisibility() {
        if (!elements.joystickZone || !elements.splitZone) return;
        elements.joystickZone.classList.add('hidden');
        elements.splitZone.classList.add('hidden');
        if (controlScheme === 'joystick') elements.joystickZone.classList.remove('hidden');
        if (controlScheme === 'split') elements.splitZone.classList.remove('hidden');
    }

    const onSchemeChange = (e) => {
        controlScheme = e.target.value;
        if (elements.schemeSelect) elements.schemeSelect.value = controlScheme;
        if (elements.schemeSelectMobile) elements.schemeSelectMobile.value = controlScheme;
        updateControlVisibility();
    };

    if (elements.schemeSelect) elements.schemeSelect.addEventListener('change', onSchemeChange);
    if (elements.schemeSelectMobile) elements.schemeSelectMobile.addEventListener('change', onSchemeChange);

    // GLOBAL SWIPE (Works everywhere for maximum reach)
    let touchStart = null;
    document.addEventListener('touchstart', e => {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!touchStart || controlScheme !== 'swipe') return;
        const dx = e.changedTouches[0].clientX - touchStart.x;
        const dy = e.changedTouches[0].clientY - touchStart.y;
        let triggered = false;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > 25) { handleInput(dx > 0 ? 'Right' : 'Left'); triggered = true; }
        } else {
            if (Math.abs(dy) > 25) { handleInput(dy > 0 ? 'Down' : 'Up'); triggered = true; }
        }
        if (triggered) {
            audio.playClick();
            if (navigator.vibrate) navigator.vibrate(10);
        }
    }, { passive: true });

    // JOYSTICK (Improved Precision)
    let joyTouchId = null;
    joystickBase.addEventListener('touchstart', e => {
        joyTouchId = e.changedTouches[0].identifier;
        updateJoystick(e.targetTouches[0]);
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        if (joyTouchId === null) return;
        for (let t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
                updateJoystick(t);
                e.preventDefault();
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', e => {
        if (joyTouchId === null) return;
        for (let t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
                joyTouchId = null;
                joystickStick.style.transform = `translate(-50%, -50%)`;
            }
        }
    });

    function updateJoystick(touch) {
        const rect = joystickBase.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const dx = touch.clientX - center.x;
        const dy = touch.clientY - center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2 - 10;
        const angle = Math.atan2(dy, dx);

        const sx = Math.cos(angle) * Math.min(dist, maxDist);
        const sy = Math.sin(angle) * Math.min(dist, maxDist);
        joystickStick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;

        // More sensitive threshold for direction changes
        if (dist > 15) {
            let nextDir = "";
            if (Math.abs(dx) > Math.abs(dy)) nextDir = dx > 0 ? 'Right' : 'Left';
            else nextDir = dy > 0 ? 'Down' : 'Up';

            const last = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : direction;
            const isOpposite = (nextDir === 'Up' && last.y === 1) || (nextDir === 'Down' && last.y === -1) || (nextDir === 'Left' && last.x === 1) || (nextDir === 'Right' && last.x === -1);

            if (!isOpposite) {
                const currentLastDir = last.x + "," + last.y;
                handleInput(nextDir);
                const newLast = inputQueue[inputQueue.length - 1];
                if (newLast && (newLast.x + "," + newLast.y) !== currentLastDir) {
                    audio.playClick();
                    if (navigator.vibrate) navigator.vibrate(10);
                }
            }
        }
    }

    // DPAD Buttons (Two-handed ergonomy)
    document.querySelectorAll('.ctrl-btn').forEach(btn => {
        btn.addEventListener('touchstart', e => {
            handleInput(btn.dataset.dir.charAt(0).toUpperCase() + btn.dataset.dir.slice(1));
            audio.playClick();
            if (navigator.vibrate) navigator.vibrate(10);
            e.preventDefault();
        }, { passive: false });
    });

    // Mobile Reset Sync
    document.getElementById('resetBestBtnMobile').addEventListener('click', () => {
        if (confirm("Reset best score?")) {
            highScore = 0; localStorage.setItem('snakeHighScore', 0); updateStatsUI(score);
        }
    });
}

function handleInput(dirStr) {
    const last = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : direction;
    switch (dirStr) {
        case 'Up': if (last.y === 0) inputQueue.push({ x: 0, y: -1 }); break;
        case 'Down': if (last.y === 0) inputQueue.push({ x: 0, y: 1 }); break;
        case 'Left': if (last.x === 0) inputQueue.push({ x: -1, y: 0 }); break;
        case 'Right': if (last.x === 0) inputQueue.push({ x: 1, y: 0 }); break;
    }
    if (inputQueue.length > 3) inputQueue.shift();
}

document.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (gameState === STATE_PLAYING) isPaused = !isPaused; return; }
    if (e.code === 'Space') { if (gameState !== STATE_PLAYING) startGame(); else isPaused = !isPaused; e.preventDefault(); return; }
    handleInput(e.code.replace('Arrow', ''));
});

document.getElementById('resetBestBtn').addEventListener('click', () => {
    if (confirm("Reset best score?")) {
        highScore = 0;
        localStorage.setItem('snakeHighScore', 0);
        scoreHistory = [];
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([]));
        updateStatsUI(score);
        if (elements.statsSummary) elements.statsSummary.classList.add('hidden');
        if (elements.leaderboardContainer) elements.leaderboardContainer.classList.add('hidden');
        if (elements.startPrompt) elements.startPrompt.classList.remove('hidden');
    }
});

if (elements.startBtn) elements.startBtn.addEventListener('click', startGame);
init();
