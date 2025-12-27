/**
 * main.js
 * Orchestrates the simulation and renderer.
 */

import { AntSimulation } from './simulation.js';
import { TURN } from './simulation.js';
import { GridRenderer } from './renderer.js';
import RuleGenerators from './ruleGenerator.js';
import TruchetLab from './truchetLab.js';
import { PRESETS } from './presets.js';
import { cloneStructured } from './utils.js';

// Configuration
const GRID_WIDTH = 240;
const GRID_HEIGHT = 150;
const SPEED_MIN = 10;
const SPEED_MAX = 30000;
let paletteEditSnapshot = null;
const STRICT_SPAWN_PRESETS = [
   
    { id: 'loose', label: 'Strict Spawn: Loose (Random Jitter)' },
    { id: 'center', label: 'Strict Spawn: Center Point' },
    { id: 'line', label: 'Strict Spawn: Center Line' },
    { id: 'vertical', label: 'Strict Spawn: Vertical Line' },
    { id: 'cross', label: 'Strict Spawn: Cross' },
    { id: 'diamond', label: 'Strict Spawn: Diamond' },
    { id: 'ring', label: 'Strict Spawn: Ring' },
    { id: 'grid3', label: 'Strict Spawn: 3x3 Grid' },
    { id: 'diagonal', label: 'Strict Spawn: Diagonal' },
    { id: 'corners', label: 'Strict Spawn: Corners' }
];

const appState = {
    sim: null,
    renderer: null,
    isPaused: false,
    randomizeInProgress: false,
    autoRandomizeEnabled: false,
    stepsPerSecond: 200,
    animationId: null,
    currentRules: null,
    strictSpawnMode: 'auto', // 'auto' | 'user'
    startState: [],
    startOrientations: null,
    startGrid: null,
    undoStack: [],
    redoStack: [],
    historyLimit: 10,
    seed: Date.now(),
    renderRequested: false,
    gridRenderRequested: false,
    forceFullRedraw: false,
    parallaxFrames: 0,
    parallaxMode: 'off',
    strictSpawnIndex: 0,
    hotkeysHidden: false,
    lastTruchetDesign: null,
    gridDrawCount: 0,
    ultimateRandomizeEnabled: false
};

/**
 * Monitors and displays FPS and Simulation Steps Per Second (SPS).
 */
class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.sps = 0;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.stepsCount = 0;
    }

    /**
     * Updates monitor state once per frame.
     * @param {number} currentSimSteps - The number of simulation steps executed this frame.
     */
    update(currentSimSteps) {
        this.frameCount++;
        this.stepsCount += currentSimSteps;
        const now = performance.now();

        // Check if 1 second has passed
        if (now - this.lastFrameTime >= 1000) {
            // Calculate FPS and SPS
            this.fps = this.frameCount;
            this.sps = this.stepsCount;

            // Reset counters
            this.frameCount = 0;
            this.stepsCount = 0;
            this.lastFrameTime = now;

            // Update UI element (using speedOverlay from index.html)
            const speedOverlay = document.getElementById('speedOverlay');
            if (speedOverlay) {
                // Display FPS and SPS (in millions for fast speed)
                const spsFormatted = (this.sps > 1000000)
                    ? `${(this.sps / 1000000).toFixed(1)}M SPS`
                    : `${this.sps} SPS`;
                speedOverlay.textContent = `FPS: ${this.fps} | ${spsFormatted}`;
            }
        }
    }
}

const monitor = new PerformanceMonitor(); // Instantiate the performance monitor

// DOM Elements
const canvas = document.getElementById('gridCanvas');
const speedDisplay = document.getElementById('speedDisplay');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const gridToggle = document.getElementById('gridToggle');
const addAntBtn = document.getElementById('addAntBtn');
const removeAntBtn = document.getElementById('removeAntBtn');
const rulePreset = document.getElementById('rulePreset');
const applyRulesBtn = document.getElementById('applyRulesBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const autoRandomizeBtn = document.getElementById('autoRandomizeBtn');
const ultimateRandomizeBtn = document.getElementById('ultimateRandomizeBtn');
const themeSelect = document.getElementById('themeSelect');
const colorPickerContainer = document.getElementById('colorPickerContainer');
const rulesetDisplay = document.getElementById('rulesetDisplay');
const spawnOverlay = document.getElementById('spawnOverlay');
const stepOverlay = document.getElementById('stepOverlay');
const stepOverlayHint = document.getElementById('stepOverlayHint');
const hotkeyHintOverlay = document.getElementById('hotkeyHintOverlay');
const stepBtn = document.getElementById('stepBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonInput = document.getElementById('importJsonInput');
const ruleSummary = document.getElementById('ruleSummary');
const speedSlider = document.getElementById('speedSlider');
const fullSpeedBtn = document.getElementById('fullSpeedBtn');
const resetSpeedBtn = document.getElementById('resetSpeedBtn');
const strictCenterBtn = document.getElementById('strictCenterBtn');

function requestRender({ grid = false, forceFullRedraw = false } = {}) {
    appState.renderRequested = true;
    if (grid) {
        appState.gridRenderRequested = true;
        appState.forceFullRedraw = appState.forceFullRedraw || forceFullRedraw;
    }
}

function formatStepCount(steps) {
    const n = typeof steps === 'number' && Number.isFinite(steps) ? steps : 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M Steps`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K Steps`;
    return `${n} Steps`;
}

function formatStepCountCompact(steps) {
    const n = typeof steps === 'number' && Number.isFinite(steps) ? steps : 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
}

window.updateStepOverlay = function () {
    if (!stepOverlay || !appState.sim) return;
    const steps = appState.sim.stepCount ?? 0;
    stepOverlay.textContent = formatStepCount(steps);
    if (stepOverlayHint) stepOverlayHint.textContent = formatStepCountCompact(steps);
};

function processRenderQueue() {
    const { sim, renderer } = appState;
    if (!sim || !renderer) return;

    if (appState.gridRenderRequested) {
        const dirtyCells = appState.forceFullRedraw ? null : sim.dirtyCells;
        const drawnCellsCount = appState.forceFullRedraw
            ? sim.grid.length
            : (dirtyCells ? dirtyCells.size : 0);
        const updated = renderer.updateGrid(sim.grid, dirtyCells, appState.forceFullRedraw, sim.orientations);
        if (updated) {
            appState.gridDrawCount += drawnCellsCount;
            sim.clearDirtyCells();
        }
        appState.gridRenderRequested = false;
        appState.forceFullRedraw = false;
        appState.renderRequested = appState.renderRequested || updated;
    }

    if (appState.renderRequested) {
        renderer.renderScene(appState.sim.ants);
        appState.renderRequested = false;
    }
}

function getSnapshot() {
    return {
        rules: cloneStructured(appState.currentRules),
        palette: appState.renderer ? [...appState.renderer.currentPalette] : [],
        ants: cloneStructured(appState.sim ? appState.sim.ants : []),
        grid: appState.sim ? appState.sim.grid.slice() : new Uint8Array(),
        orientations: appState.sim ? appState.sim.orientations.slice() : new Uint8Array(),
        stepCount: appState.sim ? appState.sim.stepCount : 0,
        stepsPerSecond: appState.stepsPerSecond,
        renderMode: appState.renderer ? appState.renderer.renderMode : 'default',
        showGrid: appState.renderer ? appState.renderer.showGrid : false,
        use3D: appState.parallaxMode !== 'off',
        parallaxMode: appState.parallaxMode,
        strictSpawnIndex: appState.strictSpawnIndex
    };
}

function applySnapshot(snapshot) {
    const { sim, renderer } = appState;
    if (!snapshot || !sim || !renderer) return;

    appState.currentRules = cloneStructured(snapshot.rules);
    sim.setRules(appState.currentRules);
    sim.grid = new Uint8Array(snapshot.grid);
    if (snapshot.orientations) {
        sim.orientations = new Uint8Array(snapshot.orientations);
    } else {
        sim.orientations = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    }
    sim.ants = cloneStructured(snapshot.ants);
    sim.stepCount = snapshot.stepCount || 0;
    renderer.setRenderMode(snapshot.renderMode || 'default');
    syncTruchetMode(false);
    if (snapshot.palette && snapshot.palette.length) {
        renderer.setCustomPalette([...snapshot.palette]);
        if (themeSelect) themeSelect.value = "Custom";
        updateColorPicker();
    }
    if (typeof snapshot.stepsPerSecond === 'number') {
        setStepsPerSecond(snapshot.stepsPerSecond);
    }
    renderRuleSummary();
    renderer.setShowGrid(Boolean(snapshot.showGrid));
    const snapshotParallaxMode = snapshot.parallaxMode
        ? snapshot.parallaxMode
        : (snapshot.use3D ? 'mouse' : 'off');
    setParallaxMode(snapshotParallaxMode);
    if (typeof snapshot.strictSpawnIndex === 'number') {
        appState.strictSpawnIndex = snapshot.strictSpawnIndex % STRICT_SPAWN_PRESETS.length;
        updateStrictSpawnUI();
    }
    captureStartState();
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
    renderRuleSummary();
}

function updateUndoRedoUI() {
    if (undoBtn) undoBtn.disabled = appState.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = appState.redoStack.length === 0;
}

function updateUltimateRandomizeUI() {
    if (!ultimateRandomizeBtn) return;
    ultimateRandomizeBtn.classList.toggle('is-active', appState.ultimateRandomizeEnabled);
    ultimateRandomizeBtn.textContent = appState.ultimateRandomizeEnabled
        ? 'Ultimate Randomize: On'
        : 'Ultimate Randomize: Off';
}

function setUltimateRandomizeEnabled(enabled) {
    appState.ultimateRandomizeEnabled = Boolean(enabled);
    RuleGenerators.setChaosMode(appState.ultimateRandomizeEnabled);
    updateUltimateRandomizeUI();
    updateHotkeyOverlay();
}

function currentStrictPreset() {
    return STRICT_SPAWN_PRESETS[appState.strictSpawnIndex] || STRICT_SPAWN_PRESETS[0];
}

function setStrictSpawnIndex(index, mode = null) {
    appState.strictSpawnIndex = ((index % STRICT_SPAWN_PRESETS.length) + STRICT_SPAWN_PRESETS.length) % STRICT_SPAWN_PRESETS.length;
    if (mode) appState.strictSpawnMode = mode;
    updateStrictSpawnUI();
}

function updateSpawnOverlay() {
    if (!spawnOverlay) return;
    const preset = currentStrictPreset();
    const label = preset?.label || '';
    spawnOverlay.textContent = label.replace(/^Strict Spawn:\s*/i, '');
}

function updateStrictSpawnUI() {
    if (!strictCenterBtn) return;
    const preset = currentStrictPreset();
    strictCenterBtn.textContent = preset.label;
    updateSpawnOverlay();
}

function setParallaxMode(mode) {
    if (!appState.renderer) return;
    const validModes = ['off', 'mouse'];
    const nextMode = validModes.includes(mode) ? mode : 'off';
    const parallaxToggle = document.getElementById('parallaxToggle');
    const previousMode = appState.parallaxMode;
    appState.parallaxMode = nextMode;

    const enableParallax = nextMode !== 'off';
    appState.renderer.set3D(enableParallax);

    if (!enableParallax) {
        appState.renderer.setParallaxOffset(0, 0);
        appState.parallaxFrames = 0;
    } else if (previousMode !== nextMode) {
        appState.renderer.setParallaxOffset(0, 0);
    } 
    
    if (parallaxToggle) parallaxToggle.checked = nextMode === 'mouse';

        updateHotkeyOverlay();
        requestRender();
        processRenderQueue();
}

function setHotkeyOverlayVisibility(show) {
    const hotkeyOverlay = document.getElementById('hotkeyOverlay');
    const displayValue = show ? '' : 'none';
    if (hotkeyOverlay) hotkeyOverlay.style.display = displayValue;
    appState.hotkeysHidden = !show;
}

function updateHotkeyHintOffset() {
    if (!hotkeyHintOverlay) return;
    const overlay = document.getElementById('hotkeyOverlay');
    if (!overlay || overlay.style.display === 'none') {
        document.documentElement?.style?.setProperty('--hotkey-hint-offset', '0px');
        return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const computedLeft = parseFloat(getComputedStyle(hotkeyHintOverlay).left || '10') || 10;
    const gap = 10;
    const buttonWidth = hotkeyHintOverlay.offsetWidth || 34;
    const safeMargin = 10;
    const desiredOffset = overlayRect.width + gap;
    const maxOffset = Math.max(0, window.innerWidth - (computedLeft + buttonWidth + safeMargin));
    const clamped = Math.max(0, Math.min(desiredOffset, maxOffset));
    document.documentElement?.style?.setProperty('--hotkey-hint-offset', `${clamped}px`);
}

function setHotkeyOverlayOpen(open) {
    const shouldOpen = Boolean(open);
    setHotkeyOverlayVisibility(shouldOpen);
    if (shouldOpen) updateHotkeyOverlay();

    if (hotkeyHintOverlay) {
        hotkeyHintOverlay.classList.toggle('is-open', shouldOpen);
        hotkeyHintOverlay.title = shouldOpen ? 'Hide Quick Keys' : 'Show Quick Keys';
    }

    if (!shouldOpen) {
        document.documentElement?.style?.setProperty('--hotkey-hint-offset', '0px');
        return;
    }

    requestAnimationFrame(() => {
        updateHotkeyHintOffset();
    });
}

function pushHistoryAction(label, undoFn, redoFn) {
    appState.undoStack.push({ label, undo: undoFn, redo: redoFn });
    if (appState.undoStack.length > appState.historyLimit) {
        appState.undoStack.shift();
    }
    appState.redoStack.length = 0;
    updateUndoRedoUI();
}

function performWithHistory(label, fn) {
    const before = getSnapshot();
    fn();
    const after = getSnapshot();
    pushHistoryAction(label, () => applySnapshot(before), () => applySnapshot(after));
}

function undoAction() {
    const action = appState.undoStack.pop();
    if (!action) return;
    action.undo();
    appState.redoStack.push(action);
    updateUndoRedoUI();
}

function redoAction() {
    const action = appState.redoStack.pop();
    if (!action) return;
    action.redo();
    appState.undoStack.push(action);
    updateUndoRedoUI();
}

function updateRulesetTitle(name) {
    if (rulesetDisplay) {
        rulesetDisplay.textContent = name;
    }
}

function formatRandomOrigin(origin) {
    if (!origin) return null;
    if (origin.kind === 'preset') return origin.presetName || null;
    if (origin.kind === 'pool') {
        const meta = origin.meta || {};
        const parts = [];
        if (meta.family) parts.push(meta.family);
        if (typeof meta.ecaRule === 'number') parts.push(`ECA ${meta.ecaRule}`);
        if (meta.mapping === 'eca8bit_to_turmite_v1') parts.push('v1');
        else if (meta.mapping === 'eca8bit_to_turmite_v2') parts.push('v2');
        else if (meta.mapping === 'eca_stream_to_turmite_2s3c_v1') parts.push('3c');
        return parts.length ? parts.join(' ') : (origin.seedId || null);
    }
    return null;
}

function getRandomHeaderLabelForSizing(samplePool) {
    const generated = RuleGenerators.generateSymmetricalWithOrigin(samplePool);
    const originLabel = formatRandomOrigin(generated.origin);
    return originLabel ? `Random · ${originLabel}` : 'Random';
}

function setRulesetTitleSizingFromRandomSamples() {
    const sampleCount = 21;
    const lengths = [];

    for (let i = 0; i < sampleCount; i++) {
        lengths.push(getRandomHeaderLabelForSizing(PRESETS).length);
    }

    lengths.sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)] ?? 28;
    const clamped = Math.max(14, Math.min(56, median));
    document.documentElement?.style?.setProperty('--ruleset-title-ch', String(clamped));
}

function init() {
    // Initialize Simulation
    appState.sim = new AntSimulation(GRID_WIDTH, GRID_HEIGHT);

    // Initialize Renderer
    appState.renderer = new GridRenderer(canvas);
    appState.renderer.setScale(7); // Function to set initial scale
    appState.renderer.resize(GRID_WIDTH, GRID_HEIGHT);
    
    syncTruchetMode(false);
    if (speedSlider) {
        speedSlider.min = SPEED_MIN;
        speedSlider.max = SPEED_MAX;
        speedSlider.value = appState.stepsPerSecond;
    }

    // Sync UI with Renderer Default
    const parallaxToggle = document.getElementById('parallaxToggle');
    if (parallaxToggle) parallaxToggle.checked = false;
    setParallaxMode('off');

    // Sync Grid State
    if (gridToggle) {
        appState.renderer.setShowGrid(gridToggle.checked);
    }

    // Populate UI
    populatePresets();
    populateThemes();
    setRulesetTitleSizingFromRandomSamples();

    updateColorPicker();

    // Set initial rules
    const preset = PRESETS["Langton's Ant"];
    if (preset) {
        appState.currentRules = preset.rules;
        appState.sim.setRules(appState.currentRules);
    }
    appState.renderer.setCustomPalette(appState.renderer.generateLangtonPalette());
    if (themeSelect) themeSelect.value = "Custom";
    updateColorPicker();
    // Fresh spawn with controlled randomness (direction/offset/state) without grid noise.
    respawnWithJitter();
    renderRuleSummary();
    captureStartState(); // Initial snapshot
    window.updateSpeedUI();
    window.updateStepOverlay();
    updateSpawnOverlay();

    // Setup Event Listeners
    setupControls();

    // Inject UI Options (Self-Healing)
    const spawnSelect = document.getElementById('spawnMode');
    if (spawnSelect) {
        const missingOptions = ['grid', 'circle'];
        missingOptions.forEach(optVal => {
            if (!spawnSelect.querySelector(`option[value="${optVal}"]`)) {
                const opt = document.createElement('option');
                opt.value = optVal;
                opt.textContent = optVal.charAt(0).toUpperCase() + optVal.slice(1);
                spawnSelect.appendChild(opt);
            }

            
        });
    }   
    
     


    // Start Loop
    loop();
    updateHotkeyOverlay();
    updateUndoRedoUI();
    updateUltimateRandomizeUI();

    // Force a redraw after a short delay to ensure everything is settled
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
    setHotkeyOverlayOpen(false);
}
function populatePresets() {
    // Save current selection if possible
    const currentSelection = rulePreset.value;

    rulePreset.innerHTML = '';
    for (const name of Object.keys(PRESETS)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        rulePreset.appendChild(option);
    }

    // Restore selection or default
    if (currentSelection && PRESETS[currentSelection]) {
        rulePreset.value = currentSelection;
    } else {
        rulePreset.value = "Langton's Ant";
    }
}

function populateThemes() {
    themeSelect.innerHTML = '';

    const customOption = document.createElement('option');
    customOption.value = 'Custom';
    customOption.textContent = 'Custom';
    themeSelect.appendChild(customOption);

    const palettes = (appState.renderer && appState.renderer.palettes) ? appState.renderer.palettes : {};
    for (const name of Object.keys(palettes)) {
        if (name === 'Custom') continue;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        themeSelect.appendChild(option);
    }

    themeSelect.value = 'Custom';
}

function pickThemePaletteName(desiredColorCount) {
    const palettes = appState.renderer && appState.renderer.palettes ? appState.renderer.palettes : {};
    const entries = Object.entries(palettes).filter(([name]) => name !== 'Custom');
    if (entries.length === 0) return null;

    const desired = Math.min(5, Math.max(2, Number.isFinite(desiredColorCount) ? desiredColorCount : 5));
    const candidates = entries.filter(([, colors]) => Array.isArray(colors) && colors.length >= desired);
    const pool = candidates.length ? candidates : entries;
    return pool[Math.floor(Math.random() * pool.length)][0] || null;
}

function applyThemePalette(desiredColorCount) {
    const name = pickThemePaletteName(desiredColorCount);
    const desired = Math.min(5, Math.max(2, Number.isFinite(desiredColorCount) ? desiredColorCount : 5));

    if (!appState.renderer) return;

    if (name && appState.renderer.palettes && appState.renderer.palettes[name]) {
        transitionToPalette(appState.renderer.palettes[name], 900);
        if (themeSelect) themeSelect.value = name;
        return;
    }

    const generated = appState.renderer.generateRandomPalette(desired);
    transitionToPalette(generated, 900);
    if (themeSelect) themeSelect.value = 'Custom';
}

let _paletteTransitionRaf = null;

function cancelPaletteTransition() {
    if (_paletteTransitionRaf != null) {
        cancelAnimationFrame(_paletteTransitionRaf);
        _paletteTransitionRaf = null;
    }
}

function transitionToPalette(targetColors, durationMs = 900) {
    if (!appState.renderer) return;
    if (!Array.isArray(targetColors) || targetColors.length === 0) return;

    cancelPaletteTransition();

    const renderer = appState.renderer;
    const from = renderer.currentPalette ? [...renderer.currentPalette] : [];
    const to = renderer.normalizePalette(targetColors);

    if (!from.length || from.length !== to.length) {
        renderer.setCustomPalette(to);
        updateColorPicker();
        requestRender({ grid: true, forceFullRedraw: true });
        processRenderQueue();
        return;
    }

    const fromRgba = from.map((c) => renderer.parseColorToRgba(c));
    const toRgba = to.map((c) => renderer.parseColorToRgba(c));
    const start = performance.now();
    const dur = Math.max(50, Number(durationMs) || 550);

    const ease = (t) => t * t * (3 - 2 * t);

    const step = (now) => {
        const rawT = (now - start) / dur;
        const t = rawT >= 1 ? 1 : ease(Math.max(0, Math.min(1, rawT)));

        const mixed = new Array(fromRgba.length);
        for (let i = 0; i < fromRgba.length; i++) {
            const a = fromRgba[i];
            const b = toRgba[i];
            const r = Math.round(a.r + (b.r - a.r) * t);
            const g = Math.round(a.g + (b.g - a.g) * t);
            const bl = Math.round(a.b + (b.b - a.b) * t);
            const alpha = Math.round(a.a + (b.a - a.a) * t);
            mixed[i] = renderer.rgbaToCss({ r, g, b: bl, a: alpha });
        }

        renderer.setTransientPalette(mixed);
        requestRender({ grid: true, forceFullRedraw: true });
        processRenderQueue();

        if (rawT >= 1) {
            renderer.setCustomPalette(to);
            updateColorPicker();
            _paletteTransitionRaf = null;
            return;
        }

        _paletteTransitionRaf = requestAnimationFrame(step);
    };

    _paletteTransitionRaf = requestAnimationFrame(step);
}




function updateColorPicker() {
    colorPickerContainer.innerHTML = '';
    const palette = appState.renderer.currentPalette;

    palette.forEach((color, index) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;

        const input = document.createElement('input');
        input.type = 'color';
        input.value = appState.renderer.colorToHex6(color);

        // Prevent click propagation to avoid weird issues
        input.addEventListener('click', (e) => e.stopPropagation());

        input.addEventListener('input', (e) => {
            const newColor = appState.renderer.applyHex6KeepingAlpha(appState.renderer.currentPalette[index], e.target.value);
            swatch.style.backgroundColor = newColor;

            // Update palette
            const newPalette = [...appState.renderer.currentPalette];
            newPalette[index] = newColor;
            appState.renderer.setCustomPalette(newPalette);
            if (!paletteEditSnapshot) {
                paletteEditSnapshot = getSnapshot();
            }
            renderRuleSummary();

            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
        input.addEventListener('change', () => {
            if (paletteEditSnapshot) {
                const before = paletteEditSnapshot;
                const after = getSnapshot();
                pushHistoryAction('Palette Change', () => applySnapshot(before), () => applySnapshot(after));
                paletteEditSnapshot = null;
            }
            renderRuleSummary();
        });

        swatch.appendChild(input);
        colorPickerContainer.appendChild(swatch);
    });
    renderRuleSummary();
}

function formatTurnSymbol(turnVal) {
    if (turnVal === TURN.L) return 'L';
    if (turnVal === TURN.R) return 'R';
    if (turnVal === TURN.N) return 'S';
    if (turnVal === TURN.U) return 'U';
    return '?';
}

function renderRuleSummary() {
    if (!ruleSummary) return;
    if (!appState.currentRules) {
        ruleSummary.textContent = 'Ruleset: none loaded';
        return;
    }

    const states = Object.keys(appState.currentRules).map(Number).sort((a, b) => a - b);
    if (!states.length) {
        ruleSummary.textContent = 'Ruleset: none loaded';
        return;
    }

    const allColorIds = new Set();
    states.forEach((stateId) => {
        const colorRules = appState.currentRules[stateId] || {};
        Object.keys(colorRules).forEach((c) => allColorIds.add(Number(c)));
    });
    const colorIds = Array.from(allColorIds).sort((a, b) => a - b);

    const header = `Ruleset (${states.length} state${states.length === 1 ? '' : 's'}, ${colorIds.length} color${colorIds.length === 1 ? '' : 's'}):`;
    const lines = [header];

    states.forEach((stateId) => {
        const colorRules = appState.currentRules[stateId] || {};
        const parts = colorIds.map((colorId) => {
            const rule = colorRules[colorId];
            if (!rule) return '—';
            const turn = formatTurnSymbol(rule.turn);
            const nextState = Number.isFinite(rule.nextState) ? rule.nextState : '?';
            return `${turn}→${nextState}`;
        });
        lines.push(`S${stateId}: ${parts.join(' | ')}`);
    });

    ruleSummary.textContent = lines.join('\n');
}

function buildExportPayload() {

    const antsToExport = appState.startState.length > 0 
        ? appState.startState 
        : appState.sim.ants;
    return {
        rules: appState.currentRules,
        palette: appState.renderer.currentPalette,
        // Export a sentinel instead of full grid data to keep files lightweight
        grid: "empty",
        ants: antsToExport,
        stepCount: 0,
        stepsPerSecond: appState.stepsPerSecond,
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        renderMode: appState.renderer.renderMode,
        seed: appState.seed,
        showGrid: appState.renderer.showGrid,
        use3D: appState.parallaxMode !== 'off',
        parallaxMode: appState.parallaxMode,
        strictSpawnIndex: appState.strictSpawnIndex
    };
}

function exportStateAsJson() {
    const name = prompt('Name preset for export:', 'MyPreset');
    if (!name) return;

    const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, '_') || 'preset';
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function validateImportPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.rules || typeof data.rules !== 'object') return false;
    if (!Array.isArray(data.palette) || data.palette.length === 0) return false;
    const gridIsEmptySentinel = data.grid === "empty";
    const gridIsArray = Array.isArray(data.grid);
    if (!gridIsEmptySentinel && !gridIsArray) return false;
    const orientationsIsEmpty = data.orientations === "empty" || data.orientations === undefined;
    const orientationsIsArray = Array.isArray(data.orientations);
    if (!Array.isArray(data.ants)) return false;
    if (typeof data.width !== 'number' || typeof data.height !== 'number') return false;
    const loadedWidth = data.width;
    const loadedHeight = data.height;
    if (loadedWidth <= 0 || loadedHeight <= 0) return false;
    if (gridIsArray && data.grid.length !== loadedWidth * loadedHeight) return false;
    if (!orientationsIsEmpty && orientationsIsArray && data.orientations.length !== loadedWidth * loadedHeight) return false;
    return true;
}

function applyImportPayload(data) {
    if (!validateImportPayload(data)) {
        alert('Invalid import data.');
        return;
    }
    performWithHistory('Import JSON', () => {
        const targetWidth = GRID_WIDTH;
        const targetHeight = GRID_HEIGHT;
        const loadedWidth = (typeof data.width === 'number' && data.width > 0) ? data.width : targetWidth;
        const loadedHeight = (typeof data.height === 'number' && data.height > 0) ? data.height : targetHeight;
        const oldCenterX = loadedWidth / 2;
        const oldCenterY = loadedHeight / 2;
        const newCenterX = targetWidth / 2;
        const newCenterY = targetHeight / 2;

        appState.currentRules = cloneStructured(data.rules);
        appState.sim.setRules(appState.currentRules);
        // Always rebuild grid/orientations to match current dimensions
        appState.sim.grid = new Uint8Array(targetWidth * targetHeight);
        appState.sim.orientations = new Uint8Array(targetWidth * targetHeight);

        appState.sim.ants = [];
        const safeAnts = Array.isArray(data.ants) ? data.ants : [];
        for (const ant of safeAnts) {
            const facing = Math.max(0, Math.min(3, ant.facing || 0));
            const state = Math.max(0, ant.state || 0);
            const deltaX = ant.x - oldCenterX;
            const deltaY = ant.y - oldCenterY;
            const newX = Math.max(0, Math.min(targetWidth - 1, Math.floor(newCenterX + deltaX)));
            const newY = Math.max(0, Math.min(targetHeight - 1, Math.floor(newCenterY + deltaY)));
            const newAnt = appState.sim.addAnt(newX, newY, facing);
            newAnt.state = state;
            if (ant.spawnLabel) newAnt.spawnLabel = ant.spawnLabel;
        }
        appState.sim.stepCount = data.stepCount || 0;
        if (typeof data.stepsPerSecond === 'number') {
            setStepsPerSecond(data.stepsPerSecond);
        }
        if (data.renderMode) appState.renderer.setRenderMode(data.renderMode);
        syncTruchetMode(false);
        appState.renderer.setCustomPalette([...data.palette]);
        if (themeSelect) themeSelect.value = "Custom";
        appState.renderer.setShowGrid(Boolean(data.showGrid));
        const importParallaxMode = data.parallaxMode
            ? data.parallaxMode
            : (data.use3D ? 'mouse' : 'off');
        setParallaxMode(importParallaxMode);
        if (typeof data.strictSpawnIndex === 'number') {
            appState.strictSpawnIndex = data.strictSpawnIndex % STRICT_SPAWN_PRESETS.length;
            updateStrictSpawnUI();
        }
        if (gridToggle) gridToggle.checked = appState.renderer.showGrid;
        updateColorPicker();
        renderRuleSummary();
        appState.sim.markAllCellsDirty();
        appState.renderer.resize(targetWidth, targetHeight);
        captureStartState();
        requestRender({ grid: true, forceFullRedraw: true });
        processRenderQueue();
    });
}

window.updateSpeedUI = function () {
    // Update Panel Display (Raw Value)
    speedDisplay.textContent = appState.stepsPerSecond;
    if (speedSlider) {
        speedSlider.value = appState.stepsPerSecond;
    }
}

function setStepsPerSecond(value, recordHistory = false, label = 'Speed Change') {
    const previous = appState.stepsPerSecond;
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.floor(value)));
    appState.stepsPerSecond = clamped;
    window.updateSpeedUI();
    if (recordHistory && previous !== clamped) {
        pushHistoryAction(label, () => setStepsPerSecond(previous), () => setStepsPerSecond(clamped));
    }
}


function setupControls() {
    const { sim, renderer } = appState;

    let autoRandomizeState = null;

    function setAutoRandomizeBaseline() {
        if (!autoRandomizeState?.enabled) return;
        if (!appState.sim?.grid) return;
        autoRandomizeState.lastGridSnapshot = appState.sim.grid.slice();
        autoRandomizeState.lastDrawCount = appState.gridDrawCount || 0;
        autoRandomizeState.lastStepCount = appState.sim.stepCount || 0;
        autoRandomizeState.stuckStrikes = 0;
    }

    pauseBtn.addEventListener('click', () => {
        appState.isPaused = !appState.isPaused;
        pauseBtn.textContent = appState.isPaused ? 'Resume' : 'Pause';
        updateHotkeyOverlay();
        if (autoRandomizeState?.enabled) {
            if (appState.isPaused) pauseAutoRandomizeTimers();
            else resumeAutoRandomizeTimers();
        }
    });

    if (stepBtn) {
        stepBtn.addEventListener('click', () => {
            if (!appState.isPaused) {
                appState.isPaused = true;
                pauseBtn.textContent = 'Resume';
                updateHotkeyOverlay();
            }
            appState.sim.update(1);
            requestRender({ grid: true });
            processRenderQueue();
            monitor.update(1);
            window.updateStepOverlay();
        });
    }

    resetBtn.addEventListener('click', () => {
        performWithHistory('Reset', () => {
            sim.reset();
            sim.ants = []; // Clear default ant

            if (appState.startGrid) {
                sim.grid = appState.startGrid.slice();
                sim.markAllCellsDirty();
            } else {
                sim.grid.fill(0);
                sim.markAllCellsDirty();
            }
            if (appState.startOrientations) {
                sim.orientations = appState.startOrientations.slice();
            } else {
                sim.orientations = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
            }

            appState.sim.stepCount = 0;
            restoreInitialAnts();

            sim.setRules(appState.currentRules);
            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
    });

    gridToggle.addEventListener('change', (e) => {
        renderer.setShowGrid(e.target.checked);
        requestRender({ grid: false });
        processRenderQueue();
    });

    if (strictCenterBtn) {
        strictCenterBtn.addEventListener('click', () => {
            const next = (appState.strictSpawnIndex + 1) % STRICT_SPAWN_PRESETS.length;
            // If user cycles to Loose, treat that as opting back into auto selection.
            const mode = STRICT_SPAWN_PRESETS[next]?.id === 'loose' ? 'auto' : 'user';
            setStrictSpawnIndex(next, mode);
        });
        updateStrictSpawnUI();
    }

    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            setStepsPerSecond(Number(e.target.value), false);
        });
        speedSlider.addEventListener('change', (e) => {
            setStepsPerSecond(Number(e.target.value), true);
        });
    }
    if (fullSpeedBtn) {
        fullSpeedBtn.addEventListener('click', () => {
            setStepsPerSecond(30000, true, 'Full Speed');
        });
    }
    if (resetSpeedBtn) {
        resetSpeedBtn.addEventListener('click', () => {
            setStepsPerSecond(10, true, 'Reset Speed');
        });
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', () => undoAction());
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', () => redoAction());
    }

    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => exportStateAsJson());
    }
    if (importJsonBtn && importJsonInput) {
        importJsonBtn.addEventListener('click', () => importJsonInput.click());
        importJsonInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);
                    applyImportPayload(data);
                } catch (err) {
                    console.error(err);
                    alert('Could not import file. Please check the format.');
                } finally {
                    importJsonInput.value = '';
                }
            };
            reader.readAsText(file);
        });
    }

    const parallaxToggle = document.getElementById('parallaxToggle');

    if (parallaxToggle) {
        parallaxToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                setParallaxMode('mouse');
            } else if (appState.parallaxMode === 'mouse') {
                setParallaxMode('off');
            }
        });

    } // <--- Closes the main "if (parallaxToggle)"

    const showHideBtn = document.getElementById('showHideBtn');
    const controlsPanel = document.getElementById('controls');
    if (showHideBtn && controlsPanel) {
        showHideBtn.addEventListener('click', () => {
            controlsPanel.classList.toggle('minimized');
            showHideBtn.textContent = controlsPanel.classList.contains('minimized') ? 'Show' : 'Hide';
        });
    }


    addAntBtn.addEventListener('click', () => {
        performWithHistory('Add Ant', () => {
            sim.reset();
            sim.ants = []; // Remove default ant

            if (appState.startState.length > 0) {
                appState.startState.forEach(ant => {
                    const restored = sim.addAnt(ant.x, ant.y, ant.facing);
                    if (typeof ant.state === 'number') restored.state = ant.state;
                });
            }

            const mode = document.getElementById('spawnMode').value;
            const facingVal = document.getElementById('initialFacing').value;
            const index = sim.ants.length; // Index for spawn pattern
            let facing;

            if (facingVal === 'random') {
                facing = Math.floor(Math.random() * 4);
            } else {
                facing = parseInt(facingVal, 10);
            }

            const strictPreset = currentStrictPreset();
            const strictPoint = strictPreset.id === 'loose'
                ? null
                : getStrictSpawnPoint(strictPreset.id, index, sim.ants.length + 1);
            const spawnPoint = strictPoint
                ? strictPoint
                : RuleGenerators.getSpawnGeometry(mode, index, sim.ants.length + 1, GRID_WIDTH, GRID_HEIGHT);
            const { x, y } = spawnPoint;
            sim.addAnt(x, y, facing);

            captureStartState();

            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
    });

    removeAntBtn.addEventListener('click', () => {
        performWithHistory('Remove Ant', () => {
            sim.reset();
            sim.ants = [];

            if (appState.startState.length > 0) {
                appState.startState.forEach(ant => {
                    const restored = sim.addAnt(ant.x, ant.y, ant.facing);
                    if (typeof ant.state === 'number') restored.state = ant.state;
                });
            }

            if (sim.ants.length > 0) {
                sim.ants.pop();
            }

            captureStartState();

            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
    });

    rulePreset.addEventListener('change', (e) => {
        const presetName = e.target.value;
        const preset = PRESETS[presetName];
        if (preset) {
            performWithHistory('Load Preset', () => {
                updateRulesetTitle(presetName);
                appState.currentRules = preset.rules;
                sim.setRules(appState.currentRules);

                // Check for saved ants configuration
                if (preset.ants && Array.isArray(preset.ants)) {
                    sim.reset(); // Clears grid and creates default ant
                    sim.ants = []; // Remove default ant
                    // Deep copy ants from preset
                    preset.ants.forEach(ant => {
                        const newAnt = sim.addAnt(ant.x, ant.y, ant.facing);
                        if (typeof ant.state === 'number') newAnt.state = ant.state;
                    });
                } else {
                    randomizeStrictSpawnForPresetLoad();
                    spawnAntsForPresetLoad();
                }

                captureStartState(); // Snapshot for Smart Reset

                // Set Render Mode (Default or Truchet)
                if (preset.renderMode) {
                    renderer.setRenderMode(preset.renderMode);
                } else {
                    renderer.setRenderMode('default');
                }
                syncTruchetMode(preset.renderMode === 'truchet');

                // Dynamic Theme Injection
                if (e.target.value === "Langton's Ant") {
                    renderer.setCustomPalette(renderer.generateLangtonPalette());
                    themeSelect.value = "Custom";
                } else {
                    // Calculate required colors from state 0 (representative)
                    const numColors = Object.keys(preset.rules[0]).length;
                    applyThemePalette(numColors);
                }

                updateColorPicker();
                renderRuleSummary();
                requestRender({ grid: true, forceFullRedraw: true });
                processRenderQueue();
            });

            // Remove focus to prevent hotkey interference
            e.target.blur();
        }
    });

    if (applyRulesBtn) {
        applyRulesBtn.style.display = 'none';
    }

    randomizeBtn.addEventListener('click', () => {
        if (appState.randomizeInProgress) return;
        // If the user hasn't explicitly locked a strict spawn, treat Randomize (manual or auto) as allowed to pick one.
        randomizeStrictSpawnForPresetLoad();
        appState.randomizeInProgress = true;
        updateSpawnOverlay();
        

        performWithHistory('Randomize Rules', () => {
            try {
                sim.reset();
                sim.ants = []; // Clear default ant to ensure strict count control
                requestRender({ grid: true, forceFullRedraw: true });

                // Keep current speed; do not reset stepsPerSecond here

                let newRules;
                let strategy;
                let isValid = false;
                let attempts = 0;
                const maxAttempts = 10;
                let lastOriginLabel = null;

                // Retry Loop for Quality Control
                do {
                    attempts++;
                    const generated = RuleGenerators.generateSymmetricalWithOrigin(PRESETS);
                    newRules = generated.rules;
                    lastOriginLabel = formatRandomOrigin(generated.origin);

                    const strategies = [
                        'center', 'line', 'vertical', 'cross', 'diamond', 'ring', 'grid3', 'diagonal', 'corners'
                    ];
                    strategy = strategies[Math.floor(Math.random() * strategies.length)];

                    isValid = RuleGenerators.validate(newRules, strategy, sim, GRID_WIDTH, GRID_HEIGHT);

                    if (!isValid) {
                        console.log(`Generation attempt ${attempts} failed validation (Stuck/Looping). Retrying...`);
                    }
                } while (!isValid && attempts < maxAttempts);

                if (!isValid) {
                    console.warn("Could not generate valid rules after max attempts. Using last result.");
                } else {
                    console.log(`Success! Valid rules generated on attempt ${attempts}.`);
                }

            updateRulesetTitle(lastOriginLabel ? `Random · ${lastOriginLabel}` : 'Random');

            appState.currentRules = newRules;
            sim.setRules(newRules);

            sim.ants = [];

                // Ant Count: 1-4 mostly, rare 5-6. Less is more.
                const antChoices = [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6];
                const antCount = antChoices[Math.floor(Math.random() * antChoices.length)];

                // Clear grid for fresh start
                sim.grid.fill(0);
                sim.dirtyCells.clear();
                requestRender({ grid: true, forceFullRedraw: true });

                let lastSpawn = null;

                for (let i = 0; i < antCount; i++) {
                    let x, y, facing;
                    const strictPreset = currentStrictPreset();
                    const strictPoint = strictPreset.id === 'loose'
                        ? null
                        : getStrictSpawnPoint(strictPreset.id, i, antCount);

                    if (strictPoint) {
                        x = strictPoint.x;
                        y = strictPoint.y;
                        facing = Math.floor(Math.random() * 4);
                    } else if (lastSpawn && Math.random() < 0.15) {
                        // 15% Chance to stack on previous ant (if exists) -> Same Pos, Diff Facing
                        x = lastSpawn.x;
                        y = lastSpawn.y;
                        // Ensure different facing from the one immediately below it in the stack
                        do {
                            facing = Math.floor(Math.random() * 4);
                        } while (facing === lastSpawn.facing);
                    } else {
                        const geometry = RuleGenerators.getSpawnGeometry(strategy, i, antCount, GRID_WIDTH, GRID_HEIGHT);
                        x = geometry.x;
                        y = geometry.y;
                        facing = Math.floor(Math.random() * 4);
                        
                    }

                    sim.addAnt(x, y, facing);
                    lastSpawn = { x, y, facing };

                    // Tagging (Simplified)
                    const ant = sim.ants[sim.ants.length - 1];
                    ant.spawnLabel = strategy.charAt(0).toUpperCase() + strategy.slice(1);
                }
                // Handle Colors: Logic-Driven Palette Sizing
                // We check state '0' as a representative sample of the rule dimensions.
                const numColors = Object.keys(newRules[0]).length;
                applyThemePalette(numColors);
                syncTruchetMode(renderer.renderMode === 'truchet');

                rulePreset.selectedIndex = -1;
                updateColorPicker();
                renderRuleSummary();
                requestRender({ grid: true, forceFullRedraw: true });
                processRenderQueue();
                captureStartState(); // Snapshot for Smart Reset
            } finally {
                appState.randomizeInProgress = false;
                setAutoRandomizeBaseline();
                if (autoRandomizeState?.enabled) {
                    scheduleNextAutoColorCycle();
                }
                window.updateStepOverlay();
            }
        });
    });

    autoRandomizeState = {
        enabled: false,
        colorCyclingEnabled: true,
        timeoutId: null,
        monitorTimeoutId: null,
        colorTimeoutId: null,
        monitorBaseMs: 4000,
        monitorJitterMs: 1500,
        lastGridSnapshot: null,
        lastDrawCount: 0,
        lastStepCount: 0,
        stuckStrikes: 0,
        baseMs: 15000,
        jitterMs: 5000,
        colorBaseMs: 3750,
        colorJitterMs: 1250
    };

    function updateAutoRandomizeUI() {
        if (!autoRandomizeBtn) return;
        autoRandomizeBtn.textContent = autoRandomizeState.enabled ? 'Auto Randomize: On' : 'Auto Randomize: Off';
    }

    function clearAutoRandomizeTimer() {
        if (autoRandomizeState.timeoutId != null) {
            clearTimeout(autoRandomizeState.timeoutId);
            autoRandomizeState.timeoutId = null;
        }
    }

    function clearAutoRandomizeMonitorTimer() {
        if (autoRandomizeState.monitorTimeoutId != null) {
            clearTimeout(autoRandomizeState.monitorTimeoutId);
            autoRandomizeState.monitorTimeoutId = null;
        }
    }

    function clearAutoColorTimer() {
        if (autoRandomizeState.colorTimeoutId != null) {
            clearTimeout(autoRandomizeState.colorTimeoutId);
            autoRandomizeState.colorTimeoutId = null;
        }
    }

    function scheduleNextAutoRandomize() {
        clearAutoRandomizeTimer();
        if (!autoRandomizeState.enabled) return;

        const jitter = (Math.random() - 0.2) * autoRandomizeState.jitterMs;
        const delay = Math.max(4000, Math.round(autoRandomizeState.baseMs + jitter));

        autoRandomizeState.timeoutId = setTimeout(() => {
            if (!autoRandomizeState.enabled) return;
            triggerAutoRandomize('timer');
        }, delay);
    }

    function scheduleNextAutoColorCycle() {
        clearAutoColorTimer();
        if (!autoRandomizeState.enabled) return;
        if (!autoRandomizeState.colorCyclingEnabled) return;

        const jitter = (Math.random() - 0.3) * autoRandomizeState.colorJitterMs;
        const delay = Math.max(5000, Math.round(autoRandomizeState.colorBaseMs + jitter));

        autoRandomizeState.colorTimeoutId = setTimeout(() => {
            if (!autoRandomizeState.enabled) return;
            if (!autoRandomizeState.colorCyclingEnabled) return;
            triggerAutoColorCycle('timer');
        }, delay);
    }

    function triggerAutoColorCycle(reason) {
        if (!autoRandomizeState.enabled) return;
        if (!autoRandomizeState.colorCyclingEnabled) return;
        if (document.hidden) return;
        if (appState.isPaused) return;
        if (!appState.sim || !appState.renderer) return;

        // Avoid fighting with rule randomization; try again soon.
        if (appState.randomizeInProgress) {
            scheduleNextAutoColorCycle();
            return;
        }

        const activeRules = appState.sim.rules;
        const numColors = activeRules && activeRules[0] ? Object.keys(activeRules[0]).length : 2;
        applyThemePalette(numColors);
        updateColorPicker();
        requestRender({ grid: true, forceFullRedraw: true });
        processRenderQueue();

         if (reason === 'timer') {
        scheduleNextAutoColorCycle();
    }


        window.dispatchEvent(
            new CustomEvent('autoColorTriggered', { detail: { reason } })
    );
    }

    function triggerAutoRandomize(reason) {
        if (!autoRandomizeState.enabled) return;
        if (document.hidden) return;
        if (!randomizeBtn) return;

        // Restart the cadence so the next auto press is relative to the most recent trigger.
        clearAutoRandomizeTimer();

        randomizeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        if (appState.sim?.grid) {
            autoRandomizeState.lastGridSnapshot = appState.sim.grid.slice();
            autoRandomizeState.lastDrawCount = appState.gridDrawCount || 0;
            autoRandomizeState.lastStepCount = appState.sim.stepCount || 0;
            autoRandomizeState.stuckStrikes = 0;
        }

        scheduleNextAutoRandomize();
        scheduleAutoRandomizeMonitor();
        scheduleNextAutoColorCycle();

        window.dispatchEvent(new CustomEvent('autoRandomizeTriggered', { detail: { reason } }));
    }

    function pauseAutoRandomizeTimers() {
        clearAutoRandomizeTimer();
        clearAutoRandomizeMonitorTimer();
        clearAutoColorTimer();
    }

    function resumeAutoRandomizeTimers() {
        if (!autoRandomizeState.enabled) return;
        if (document.hidden) return;
        setAutoRandomizeBaseline();
        scheduleNextAutoRandomize();
        scheduleAutoRandomizeMonitor();
        scheduleNextAutoColorCycle();
    }

    function scheduleAutoRandomizeMonitor() {
        clearAutoRandomizeMonitorTimer();
        if (!autoRandomizeState.enabled) return;

        const jitter = (Math.random() - 0.5) * autoRandomizeState.monitorJitterMs;
        const delay = Math.max(1000, Math.round(autoRandomizeState.monitorBaseMs + jitter));

        autoRandomizeState.monitorTimeoutId = setTimeout(() => {
            if (!autoRandomizeState.enabled) return;

            // Stop monitoring while paused/hidden; resume on focus/visibility.
            if (appState.isPaused || document.hidden || !appState.sim) return;

            const simNow = appState.sim;

            // Warmup: mirror ruleGenerator.validate() idea; avoid declaring "stuck" too early.
            if ((simNow.stepCount || 0) < 300) {
                autoRandomizeState.lastGridSnapshot = simNow.grid.slice();
                autoRandomizeState.lastStepCount = simNow.stepCount || 0;
                autoRandomizeState.stuckStrikes = 0;
                scheduleAutoRandomizeMonitor();
                return;
            }

            if (!autoRandomizeState.lastGridSnapshot || autoRandomizeState.lastGridSnapshot.length !== simNow.grid.length) {
                autoRandomizeState.lastGridSnapshot = simNow.grid.slice();
                autoRandomizeState.lastDrawCount = appState.gridDrawCount || 0;
                autoRandomizeState.lastStepCount = simNow.stepCount || 0;
                autoRandomizeState.stuckStrikes = 0;
                scheduleAutoRandomizeMonitor();
                return;
            }

            const deltaSteps = (simNow.stepCount || 0) - (autoRandomizeState.lastStepCount || 0);
            if (deltaSteps < 30) {
                scheduleAutoRandomizeMonitor();
                return;
            }

            const currentDrawCount = appState.gridDrawCount || 0;
            const deltaDraws = currentDrawCount - (autoRandomizeState.lastDrawCount || 0);

            let changedCells = 0;
            let paintedCells = 0;
            const grid = simNow.grid;
            const prev = autoRandomizeState.lastGridSnapshot;
            for (let i = 0; i < grid.length; i++) {
                const v = grid[i];
                if (v !== prev[i]) changedCells++;
                if (v !== 0) paintedCells++;
            }

            // Same spirit as RuleGenerators.validate(): low activity => likely stuck/stabilized.
            // Also treat low renderer draw activity as a strong stuck signal (cheap + reflects what the user sees).
            const minChangedCells = 12;
            const minPaintedCells = 40;
            const minDeltaDraws = 8;
            const stuckByDraws = deltaDraws < minDeltaDraws;
            const stuck = stuckByDraws || changedCells < minChangedCells || paintedCells < minPaintedCells || simNow.ants.length === 0;

            if (stuck) autoRandomizeState.stuckStrikes++;
            else autoRandomizeState.stuckStrikes = 0;

            autoRandomizeState.lastGridSnapshot = simNow.grid.slice();
            autoRandomizeState.lastDrawCount = currentDrawCount;
            autoRandomizeState.lastStepCount = simNow.stepCount || 0;

            if (autoRandomizeState.stuckStrikes >= 1) {
                autoRandomizeState.stuckStrikes = 0;
                autoRandomizeState.lastGridSnapshot = null;
                autoRandomizeState.lastDrawCount = 0;
                autoRandomizeState.lastStepCount = 0;
                triggerAutoRandomize('stuck');
            }

            scheduleAutoRandomizeMonitor();
        }, delay);
    }

    function setAutoRandomizeEnabled(enabled) {
        autoRandomizeState.enabled = Boolean(enabled);
        appState.autoRandomizeEnabled = autoRandomizeState.enabled;
        if (!autoRandomizeState.enabled) autoRandomizeState.colorCyclingEnabled = true;
        updateAutoRandomizeUI();
        updateHotkeyOverlay();
        if (!autoRandomizeState.enabled) {
            pauseAutoRandomizeTimers();
            return;
        }
        resumeAutoRandomizeTimers();
        // When enabling, immediately roll a new pattern so the user sees it "take over" right away.
        if (!appState.randomizeInProgress) {
            triggerAutoRandomize('enabled');
        } else {
            scheduleNextAutoRandomize();
        }
    }

    updateAutoRandomizeUI();

    if (autoRandomizeBtn) {
        autoRandomizeBtn.addEventListener('click', () => {
            setAutoRandomizeEnabled(!autoRandomizeState.enabled);
            autoRandomizeBtn.blur();
        });
    }

    if (ultimateRandomizeBtn) {
        ultimateRandomizeBtn.addEventListener('click', () => {
            const next = !appState.ultimateRandomizeEnabled;
            setUltimateRandomizeEnabled(next);
            if (next) RuleGenerators.randomizeChaosConfig();
            ultimateRandomizeBtn.blur();
        });
    }

    window.addEventListener('beforeunload', () => {
        clearAutoRandomizeTimer();
        clearAutoRandomizeMonitorTimer();
    });

    document.addEventListener('visibilitychange', () => {
        if (!autoRandomizeState.enabled) return;
        if (document.hidden) pauseAutoRandomizeTimers();
        else resumeAutoRandomizeTimers();
    });

    window.addEventListener('blur', () => {
        if (!autoRandomizeState.enabled) return;
        pauseAutoRandomizeTimers();
    });

    window.addEventListener('focus', () => {
        if (!autoRandomizeState.enabled) return;
        resumeAutoRandomizeTimers();
    });

    if (hotkeyHintOverlay) {
        hotkeyHintOverlay.addEventListener('click', () => {
            setHotkeyOverlayOpen(appState.hotkeysHidden);
        });
    }

    themeSelect.addEventListener('change', (e) => {
        performWithHistory('Theme Change', () => {
            const selected = e.target.value;
            renderer.setPalette(selected);
            updateColorPicker();
            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
        e.target.blur(); // Remove focus
    });

    // Ensure other dropdowns also lose focus
    const spawnModeSelect = document.getElementById('spawnMode');
    if (spawnModeSelect) {
        spawnModeSelect.addEventListener('change', (e) => e.target.blur());
    }
    const initialFacingSelect = document.getElementById('initialFacing');
    if (initialFacingSelect) {
        initialFacingSelect.addEventListener('change', (e) => e.target.blur());
    }

    const generateRandomThemeBtn = document.getElementById('generateRandomThemeBtn');
    if (generateRandomThemeBtn) {
        generateRandomThemeBtn.addEventListener('click', () => {
            performWithHistory('Random Theme', () => {
                const activeRules = sim.rules;
                const numColors = Object.keys(activeRules[0]).length;

                applyThemePalette(numColors);
                updateColorPicker();
                requestRender({ grid: true, forceFullRedraw: true });
                processRenderQueue();
            });
        });
    }

    // Zoom Handling
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Determine direction
        const delta = Math.sign(e.deltaY) * -1; // Up is positive (zoom in)

        // Calculate new scale
        let newScale = Math.floor(renderer.cellSize + delta);

        // Dynamic Minimum Scale: just under the best-fit of both dimensions
        const fitHeight = canvasContainer.clientHeight / GRID_HEIGHT;
        const fitWidth = canvasContainer.clientWidth / GRID_WIDTH;
        const fitScale = Math.min(fitHeight, fitWidth);
        const minScale = Math.max(1, Math.floor(fitScale * 1.2));

        // Clamp
        if (newScale < minScale) newScale = minScale;
        if (newScale > 40) newScale = 40;

        if (newScale !== renderer.cellSize) {
            renderer.setScale(newScale);
            renderer.resize(GRID_WIDTH, GRID_HEIGHT); // Apply resize

            // Redraw immediately (Full redraw needed on resize)
            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        }
    }, { passive: false });

    // Parallax Mouse Tracking
    document.addEventListener('mousemove', (e) => {
        if (appState.parallaxMode !== 'mouse') return;

        // Calculate normalized position (-1 to 1) from center of screen
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Invert X/Y so moving mouse 'pushes' the content away for depth effect
        // Or standard: moving mouse right moves camera right (content moves left)
        // Let's go with standard "window" looking: mouse right -> look right -> content shifts left
        const nX = (centerX - e.clientX) / centerX;
        const nY = (centerY - e.clientY) / centerY;

        renderer.setParallaxOffset(nX, nY);
        appState.parallaxFrames = 5;
        requestRender();
    });

    // Keybindings
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        const targetTag = e.target?.tagName;
        const typingTarget = targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA';
        if (typingTarget && key !== 'n') return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoAction();
            } else {
                undoAction();
            }
            return;
        }

        switch (key) {
            case 'r':
                randomizeBtn.click();
                break;
            case 's':
                setHotkeyOverlayOpen(appState.hotkeysHidden);
                break;
            case 'c':
                if (generateRandomThemeBtn) generateRandomThemeBtn.click();
                break;
            case 'k': // Cycle Strict Spawn preset
                if (strictCenterBtn) strictCenterBtn.click();
                break;
            case '1': // Cycle Ruleset Clockwise (Next)
                {
                    const opts = rulePreset.options;
                    if (opts.length > 0) {
                        let idx = rulePreset.selectedIndex;
                        idx = (idx + 1) % opts.length;
                        rulePreset.selectedIndex = idx;
                        rulePreset.dispatchEvent(new Event('change'));
                    }
                }
                break;
            case '2': // Cycle Ruleset Counter-Clockwise (Previous)
                {
                    const opts = rulePreset.options;
                    if (opts.length > 0) {
                        let idx = rulePreset.selectedIndex;
                        idx = (idx - 1 + opts.length) % opts.length;
                        rulePreset.selectedIndex = idx;
                        rulePreset.dispatchEvent(new Event('change'));
                    }
                }
                break;
            case ' ': // Spacebar for Pause
                e.preventDefault(); // Prevent scrolling
                pauseBtn.click();
                break;
            case '3': // Restart Current Rule-Set
                resetBtn.click();
                break;
            case '9': // Decrease Speed
                setStepsPerSecond(appState.stepsPerSecond - 5, true);
                break;
            case '0': // Increase Speed
                setStepsPerSecond(appState.stepsPerSecond + 5, true);
                break;
            case '8': // Increase Speed by 100
                setStepsPerSecond(appState.stepsPerSecond + 100, true);
                break;
            case '7': // Decrease Speed by 100
                setStepsPerSecond(appState.stepsPerSecond - 100, true);
                break;
            case 'e': // Full Speed
                if (fullSpeedBtn) {
                    fullSpeedBtn.click();
                } else {
                    setStepsPerSecond(10000, true, 'Full Speed');
                }
                break;
            case 'w': // Reset Speed
                if (resetSpeedBtn) {
                    resetSpeedBtn.click();
                } else {
                    setStepsPerSecond(11, true, 'Reset Speed');
                }
                break;
            case 't': // Truchet Mode reroll
                performWithHistory('Truchet Mode', () => rollTruchetDesign());
                break;
            case 'g': // Toggle Grid
                if (gridToggle) {
                    gridToggle.checked = !gridToggle.checked;
                    gridToggle.dispatchEvent(new Event('change'));
                    updateHotkeyOverlay();
                }
                break;
            case 'u': // Toggle Parallax
                setParallaxMode(appState.parallaxMode === 'mouse' ? 'off' : 'mouse');
                break;
            case 'h': // Toggle Controls panel
                if (showHideBtn) showHideBtn.click();
                break;
            case 'n': // Toggle automation
                if (autoRandomizeState) {
                    setAutoRandomizeEnabled(!autoRandomizeState.enabled);
                    updateHotkeyOverlay();
                }
                break;
            case 'x': // Toggle Ultimate Randomize
                setUltimateRandomizeEnabled(!appState.ultimateRandomizeEnabled);
                if (appState.ultimateRandomizeEnabled) RuleGenerators.randomizeChaosConfig();
                break;
        }
    });

    window.addEventListener('resize', () => {
        if (!appState.hotkeysHidden) updateHotkeyHintOffset();
    });
}

// Main Loop 

let lastTime = performance.now();
let accumulator = 0;

function loop() {
    const now = performance.now();
    const dt = Math.min(now - lastTime, 200); // Cap at 200ms to prevent spiral of death
    lastTime = now;

    let stepsExecutedThisFrame = 0;
    let simStepped = false;

    if (!appState.isPaused) {
        accumulator += dt;
        const stepInterval = 1000 / appState.stepsPerSecond;

        // Run simulation steps
        while (accumulator >= stepInterval) {
            appState.sim.update(1);
            accumulator -= stepInterval;
            stepsExecutedThisFrame++;
            simStepped = true;
        }

        if (simStepped) {
            requestRender({ grid: true });
        }
    } else {
        // When paused, reset accumulator to prevent jump when unpaused
        accumulator = 0;
    }

    if (appState.renderer.use3D && appState.parallaxFrames > 0) {
        requestRender();
        appState.parallaxFrames -= 1;
    }

    processRenderQueue();

    monitor.update(stepsExecutedThisFrame);
    if (stepsExecutedThisFrame > 0) window.updateStepOverlay();
    appState.animationId = requestAnimationFrame(loop);
}

// Smart Reset Helper
function captureStartState() {
    appState.startState = appState.sim.ants.map(ant => ({
        x: ant.x,
        y: ant.y,
        facing: ant.facing,
        state: ant.state
    }));
    // Always reset back to a clean grid; rules remain intact elsewhere.
    appState.startGrid = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    appState.startOrientations = appState.sim.orientations ? appState.sim.orientations.slice() : new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
}

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStrictSpawnPoint(presetId, index = 0, total = 1) {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const margin = 2;
    const clampX = (x) => clamp(x, margin, GRID_WIDTH - margin - 1);
    const clampY = (y) => clamp(y, margin, GRID_HEIGHT - margin - 1);

    switch (presetId) {
        case 'center':
            return { x: centerX, y: centerY };
        case 'line': {
            const span = Math.max(3, total);
            const offset = index - Math.floor(span / 2);
            return { x: clampX(centerX + offset), y: centerY };
        }
        case 'vertical': {
            const span = Math.max(3, total);
            const offset = index - Math.floor(span / 2);
            return { x: centerX, y: clampY(centerY + offset) };
        }
        case 'cross': {
            const spacing = 3;
            const positions = [
                { x: centerX, y: centerY },
                { x: centerX, y: clampY(centerY - spacing) },
                { x: clampX(centerX + spacing), y: centerY },
                { x: centerX, y: clampY(centerY + spacing) },
                { x: clampX(centerX - spacing), y: centerY }
            ];
            return positions[index % positions.length];
        }
        case 'diamond': {
            const spacing = 4;
            const positions = [
                { x: centerX, y: centerY },
                { x: centerX, y: clampY(centerY - spacing) },
                { x: clampX(centerX + spacing), y: centerY },
                { x: centerX, y: clampY(centerY + spacing) },
                { x: clampX(centerX - spacing), y: centerY },
                { x: clampX(centerX + spacing), y: clampY(centerY - spacing) },
                { x: clampX(centerX + spacing), y: clampY(centerY + spacing) },
                { x: clampX(centerX - spacing), y: clampY(centerY + spacing) },
                { x: clampX(centerX - spacing), y: clampY(centerY - spacing) }
            ];
            return positions[index % positions.length];
        }
        case 'ring': {
            const radius = Math.max(6, Math.floor(Math.min(GRID_WIDTH, GRID_HEIGHT) * 0.08));
            const count = Math.max(6, total);
            const angle = (index % count) / count * Math.PI * 2;
            const x = clampX(Math.round(centerX + Math.cos(angle) * radius));
            const y = clampY(Math.round(centerY + Math.sin(angle) * radius));
            return { x, y };
        }
        case 'grid3': {
            const spacing = 3;
            const offsets = [-spacing, 0, spacing];
            const gx = offsets[Math.floor(index / 3) % 3];
            const gy = offsets[index % 3];
            return { x: clampX(centerX + gx), y: clampY(centerY + gy) };
        }
        case 'diagonal': {
            const span = Math.max(3, total);
            const offset = index - Math.floor(span / 2);
            return { x: clampX(centerX + offset), y: clampY(centerY + offset) };
        }
        case 'corners': {
            const positions = [
                { x: margin, y: margin },
                { x: GRID_WIDTH - margin - 1, y: margin },
                { x: margin, y: GRID_HEIGHT - margin - 1 },
                { x: GRID_WIDTH - margin - 1, y: GRID_HEIGHT - margin - 1 }
            ];
            return positions[index % positions.length];
        }
        default:
            return null; // Loose / default jitter
    }
}

function generateSpawnPoint() {
    const states = appState.currentRules ? Object.keys(appState.currentRules).map(Number) : [0];
    const statePool = states.length ? states : [0];

    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const jitterX = Math.min(20, Math.max(5, Math.floor(GRID_WIDTH * 0.02))) || 1;
    const jitterY = Math.min(20, Math.max(5, Math.floor(GRID_HEIGHT * 0.02))) || 1;
    const margin = 2;

    const strictPreset = currentStrictPreset();
    const strictPoint = strictPreset.id === 'loose' ? null : getStrictSpawnPoint(strictPreset.id);

    const x = strictPoint ? strictPoint.x : clamp(centerX + randomInt(-jitterX, jitterX), margin, GRID_WIDTH - margin - 1);
    const y = strictPoint ? strictPoint.y : clamp(centerY + randomInt(-jitterY, jitterY), margin, GRID_HEIGHT - margin - 1);
    const facing = randomInt(0, 3); // Cardinal only for stability
    const state = statePool[randomInt(0, statePool.length - 1)] || 0;

    return { x, y, facing, state };
}

function randomizeStrictSpawnForPresetLoad() {
    if (appState.strictSpawnMode === 'user') return;

    // Prefer structured strict spawns most of the time; keep some loose for chaos.
    const roll = Math.random();
    if (roll < 0.2) {
        setStrictSpawnIndex(0, 'auto'); // loose
    } else {
        const candidates = [];
        for (let i = 1; i < STRICT_SPAWN_PRESETS.length; i++) {
            const id = STRICT_SPAWN_PRESETS[i]?.id;
            if (id && id !== 'corners') candidates.push(i);
        }
        const pick = candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : 1 + Math.floor(Math.random() * (STRICT_SPAWN_PRESETS.length - 1));
        setStrictSpawnIndex(pick, 'auto');
    }
}

function spawnAntsForPresetLoad() {
    const sim = appState.sim;
    if (!sim) return;

    const antChoices = [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6, 7];
    const antCount = antChoices[Math.floor(Math.random() * antChoices.length)];

    const stateKeys = appState.currentRules ? Object.keys(appState.currentRules).map(Number).filter(Number.isFinite) : [0];
    const allowedStates = stateKeys.length ? stateKeys : [0];

    sim.reset();
    sim.ants = [];

    const strictPreset = currentStrictPreset();
    for (let i = 0; i < antCount; i++) {
        const strictPoint = strictPreset.id === 'loose' ? null : getStrictSpawnPoint(strictPreset.id, i, antCount);
        const x = strictPoint ? strictPoint.x : generateSpawnPoint().x;
        const y = strictPoint ? strictPoint.y : generateSpawnPoint().y;
        const facing = Math.floor(Math.random() * 4);
        const ant = sim.addAnt(x, y, facing);
        ant.state = allowedStates[Math.floor(Math.random() * allowedStates.length)] || 0;
    }
}

function respawnWithJitter() {
    const { sim } = appState;
    if (!sim) return;
    sim.ants = [];
    const spawn = generateSpawnPoint();
    const ant = sim.addAnt(spawn.x, spawn.y, spawn.facing);
    ant.state = spawn.state;
}

function applyTruchetDesign(design) {
    const { sim, renderer } = appState;
    if (!design || !design.rules || !sim || !renderer) return;

    // Reset and respawn ants to showcase the new rule cleanly
    sim.reset();
    appState.currentRules = design.rules;
    sim.setRules(design.rules);
    sim.ants = [];
    const antChoices = [2, 3, 3, 4, 5];
    const antCount = antChoices[Math.floor(Math.random() * antChoices.length)];
    for (let i = 0; i < antCount; i++) {
        const spawn = generateSpawnPoint();
        const ant = sim.addAnt(spawn.x, spawn.y, spawn.facing);
        ant.state = spawn.state;
    }
    renderer.setRenderMode('truchet');
    syncTruchetMode(true);

    const numColors = Object.keys(design.rules[0]).length;
    applyThemePalette(numColors);

    rulePreset.selectedIndex = -1;
    const label = design.label || 'Hidden Truchet';
    updateRulesetTitle(`Truchet: ${label}`);
    appState.lastTruchetDesign = {
        label,
        rules: cloneStructured(design.rules)
    };

    renderRuleSummary();
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
    captureStartState();
}

function rollTruchetDesign() {
    const design = TruchetLab.nextTruchetDesign(appState.lastTruchetDesign);
    applyTruchetDesign(design);
}

function syncTruchetMode(randomize = false) {
    const enable = appState.renderer && appState.renderer.renderMode === 'truchet';
    if (!appState.sim) return;
    appState.sim.toggleOrientationOnVisit = enable;
    if (enable) {
        if (!appState.sim.orientations || appState.sim.orientations.length !== GRID_WIDTH * GRID_HEIGHT) {
            appState.sim.orientations = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
        }
        if (randomize) {
            for (let i = 0; i < appState.sim.orientations.length; i++) {
                appState.sim.orientations[i] = Math.random() < 0.5 ? 0 : 1;
            }
            appState.sim.markAllCellsDirty();
        }
    }
}
/**
 * Restores the initial ant configuration and resets the step counter.
 * @returns {void}
 */
function restoreInitialAnts() {
    const sim = appState.sim;
    
    sim.ants = []; 
    
    sim.stepCount = 0;

    if (appState.startState && appState.startState.length > 0) {
        for (const antData of appState.startState) {
            const newAnt = sim.addAnt(antData.x, antData.y, antData.facing);
            if (typeof antData.state === 'number') newAnt.state = antData.state;
        }
    } else {
        const spawn = generateSpawnPoint(false); 
        const newAnt = sim.addAnt(spawn.x, spawn.y, spawn.facing);
        newAnt.state = spawn.state;
        
        captureStartState();
    }

    window.updateStepOverlay();
}

/**
 * Updates the Quick Keys overlay content.
 * @returns {void}
 */
function updateHotkeyOverlay() {
    const overlay = document.getElementById('hotkeyOverlay');
    if (!overlay) return;

    const isPausedText = appState.isPaused ? '⏵ Resume' : '⏸ Pause';
    const is3DText = appState.parallaxMode === 'mouse' ? '🌀 Mouse Parallax: ON' : '⬜ Mouse Parallax: OFF';
    const gridText = appState.renderer.showGrid ? '⊞ Grid: ON' : '⊞ Grid: OFF';
    const autoText = appState.autoRandomizeEnabled ? '⏹ Stop Auto' : '▶ Start Auto';
    const ultimateText = appState.ultimateRandomizeEnabled ? 'Ultimate Randomize: ON' : 'Ultimate Randomize: OFF';
    overlay.innerHTML = `
        <strong style="color: var(--accent);">Quick Keys</strong><br>
        [R] Randomize <br>
        [1/2] Cycle Presets<br>
        [3] Restart Current Rule-Set<br>
        [C] Randomize Colour<br>
        [N] ${autoText}<br>
        [X] ${ultimateText}<br>
        [K] Cycle Spawn Rule<br>
        [T] Truchet Mode / Reroll<br>
        [Space] ${isPausedText}<br>
        [9/0] -/+ 5 Small Speed Change<br>
        [7/8] -/+ 100 Large Speed Change<br>
        [E] Full Speed<br>
        [W] Reset Speed<br>
        [G] ${gridText}<br>
        [U] ${is3DText}<br>
        [S] Hide/Show Quick Keys<br>
        [H] Show/Hide Controls Panel
    `.trim();
}
// Start the application
init();
