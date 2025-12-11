/**
 * main.js
 * 
 * Orchestrates the simulation and renderer.
 */

import { AntSimulation, DIR, TURN } from './simulation.js';
import { GridRenderer } from './renderer.js';
import RuleGenerators from './ruleGenerator.js';
import { PRESETS } from './presets.js';
import { cloneStructured } from './utils.js';

// Configuration
const GRID_WIDTH = 135;
const GRID_HEIGHT = 90;
const SPEED_MIN = 1;
const SPEED_MAX = 10000;
let paletteEditSnapshot = null;

const appState = {
    sim: null,
    renderer: null,
    isPaused: false,
    stepsPerSecond: 11,
    animationId: null,
    currentRules: null,
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
    strictCenterSpawn: false,
    overlaysHidden: false
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

                speedOverlay.textContent = `FPS: ${this.fps} | Sim: ${spsFormatted}`;
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
const themeSelect = document.getElementById('themeSelect');
const colorPickerContainer = document.getElementById('colorPickerContainer');
const rulesetDisplay = document.getElementById('rulesetDisplay');
const stepBtn = document.getElementById('stepBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonInput = document.getElementById('importJsonInput');
const exportPngBtn = document.getElementById('exportPngBtn');
const ruleSummary = document.getElementById('ruleSummary');
const speedSlider = document.getElementById('speedSlider');
const fullSpeedBtn = document.getElementById('fullSpeedBtn');
const resetSpeedBtn = document.getElementById('resetSpeedBtn');
const exportPanel = document.getElementById('exportPanel');
const strictCenterBtn = document.getElementById('strictCenterBtn');

function requestRender({ grid = false, forceFullRedraw = false } = {}) {
    appState.renderRequested = true;
    if (grid) {
        appState.gridRenderRequested = true;
        appState.forceFullRedraw = appState.forceFullRedraw || forceFullRedraw;
    }
}

function processRenderQueue() {
    const { sim, renderer } = appState;
    if (!sim || !renderer) return;

    if (appState.gridRenderRequested) {
        const dirtyCells = appState.forceFullRedraw ? null : sim.dirtyCells;
        const updated = renderer.updateGrid(sim.grid, dirtyCells, appState.forceFullRedraw, sim.orientations);
        if (updated) {
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
        use3D: appState.renderer ? appState.renderer.use3D : false
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
    renderer.set3D(Boolean(snapshot.use3D));
    captureStartState();
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
    renderRuleSummary();
    updateHotkeyOverlay();
}

function updateUndoRedoUI() {
    if (undoBtn) undoBtn.disabled = appState.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = appState.redoStack.length === 0;
}

function updateStrictCenterUI() {
    if (!strictCenterBtn) return;
    strictCenterBtn.textContent = appState.strictCenterSpawn ? 'Strict Centre Spawn: On' : 'Strict Centre Spawn: Off';
}

function setOverlayVisibility(show) {
    const statsOverlay = document.getElementById('statsOverlay');
    const hotkeyOverlay = document.getElementById('hotkeyOverlay');
    const displayValue = show ? '' : 'none';
    if (statsOverlay) statsOverlay.style.display = displayValue;
    if (hotkeyOverlay) hotkeyOverlay.style.display = displayValue;
    appState.overlaysHidden = !show;
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

function init() {
    // Initialize Simulation
    appState.sim = new AntSimulation(GRID_WIDTH, GRID_HEIGHT);

    // Initialize Renderer
    appState.renderer = new GridRenderer(canvas);
    appState.renderer.setScale(20); // Sets initial cell size to 20px
    appState.renderer.resize(GRID_WIDTH, GRID_HEIGHT);
    syncTruchetMode(false);
    if (speedSlider) {
        speedSlider.min = SPEED_MIN;
        speedSlider.max = SPEED_MAX;
        speedSlider.value = appState.stepsPerSecond;
    }

    // Sync UI with Renderer Default
    const parallaxToggle = document.getElementById('parallaxToggle');
    if (parallaxToggle) {
        parallaxToggle.checked = appState.renderer.use3D;
    }

    // Sync Grid State
    if (gridToggle) {
        appState.renderer.setShowGrid(gridToggle.checked);
    }

    // Populate UI
    populatePresets();
    populateThemes();

    updateColorPicker();

    // Set initial rules
    const preset = PRESETS["Langton's Ant"];
    if (preset) {
        appState.currentRules = preset.rules;
        appState.sim.setRules(appState.currentRules);
    }
    // Fresh spawn with controlled randomness (direction/offset/state) without grid noise.
    respawnWithJitter();
    renderRuleSummary();
    captureStartState(); // Initial snapshot
    window.updateSpeedUI();

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

    const facingSelect = document.getElementById('initialFacing');
    // Removed outward/clockwise injections to keep facing options minimal.

    // Start Loop
    loop();
    updateHotkeyOverlay();
    updateUndoRedoUI();

    // Force a redraw after a short delay to ensure everything is settled
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
    setOverlayVisibility(true);
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

    // Add "Generate Random" option
    const randomOption = document.createElement('option');
    randomOption.value = "generate_random";
    randomOption.textContent = "✨ Generate Random ✨";
    themeSelect.appendChild(randomOption);

    for (const name of Object.keys(appState.renderer.palettes)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        themeSelect.appendChild(option);
    }
    themeSelect.value = "Classic";
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
        input.value = color;

        // Prevent click propagation to avoid weird issues
        input.addEventListener('click', (e) => e.stopPropagation());

        input.addEventListener('input', (e) => {
            const newColor = e.target.value;
            swatch.style.backgroundColor = newColor;

            // Update palette
            const newPalette = [...appState.renderer.currentPalette];
            newPalette[index] = newColor;
            appState.renderer.setCustomPalette(newPalette);
            if (!paletteEditSnapshot) {
                paletteEditSnapshot = getSnapshot();
            }
            renderRuleSummary();

            // If we modified a preset, switch select to "Custom" if it exists, or just keep it
            // Actually, let's just force redraw
            // Actually, let's just force redraw
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
    return {
        rules: appState.currentRules,
        palette: appState.renderer.currentPalette,
        // Export a sentinel instead of full grid data to keep files lightweight
        grid: "empty",
        ants: appState.sim.ants,
        stepCount: appState.sim.stepCount,
        stepsPerSecond: appState.stepsPerSecond,
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        renderMode: appState.renderer.renderMode,
        seed: appState.seed,
        showGrid: appState.renderer.showGrid,
        use3D: appState.renderer.use3D
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

function exportStateAsPng() {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `antfarm_snapshot_${Date.now()}.png`;
    a.click();
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
    if (data.width !== GRID_WIDTH || data.height !== GRID_HEIGHT) return false;
    if (gridIsArray && data.grid.length !== GRID_WIDTH * GRID_HEIGHT) return false;
    if (!orientationsIsEmpty && (!orientationsIsArray || data.orientations.length !== GRID_WIDTH * GRID_HEIGHT)) return false;
    return true;
}

function applyImportPayload(data) {
    if (!validateImportPayload(data)) {
        alert('Invalid import data.');
        return;
    }
    performWithHistory('Import JSON', () => {
        appState.currentRules = cloneStructured(data.rules);
        appState.sim.setRules(appState.currentRules);
        appState.sim.grid = data.grid === "empty"
            ? new Uint8Array(GRID_WIDTH * GRID_HEIGHT)
            : new Uint8Array(data.grid);
        appState.sim.orientations = (Array.isArray(data.orientations) && data.orientations.length === GRID_WIDTH * GRID_HEIGHT)
            ? new Uint8Array(data.orientations)
            : new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
        const safeAnts = cloneStructured(data.ants).map((ant) => ({
            x: Math.max(0, Math.min(GRID_WIDTH - 1, ant.x)),
            y: Math.max(0, Math.min(GRID_HEIGHT - 1, ant.y)),
            facing: Math.max(0, Math.min(3, ant.facing || 0)),
            state: Math.max(0, ant.state || 0)
        }));
        appState.sim.ants = safeAnts;
        appState.sim.stepCount = data.stepCount || 0;
        if (typeof data.stepsPerSecond === 'number') {
            setStepsPerSecond(data.stepsPerSecond);
        }
        if (data.renderMode) appState.renderer.setRenderMode(data.renderMode);
        syncTruchetMode(false);
        appState.renderer.setCustomPalette([...data.palette]);
        if (themeSelect) themeSelect.value = "Custom";
        appState.renderer.setShowGrid(Boolean(data.showGrid));
        appState.renderer.set3D(Boolean(data.use3D));
        if (gridToggle) gridToggle.checked = appState.renderer.showGrid;
        const parallaxToggle = document.getElementById('parallaxToggle');
        if (parallaxToggle) parallaxToggle.checked = appState.renderer.use3D;
        updateColorPicker();
        renderRuleSummary();
        appState.sim.markAllCellsDirty();
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

    // speedControl listener removed (Hotkeys only)

    pauseBtn.addEventListener('click', () => {
        appState.isPaused = !appState.isPaused;
        pauseBtn.textContent = appState.isPaused ? 'Resume' : 'Pause';
        updateHotkeyOverlay();
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

            // Smart Reset: Restore specific arrangement
            if (appState.startState.length > 0) {
                appState.startState.forEach(ant => {
                    const newAnt = sim.addAnt(ant.x, ant.y, ant.facing);
                    if (typeof ant.state === 'number') newAnt.state = ant.state;
                });
            } else {
                // Fallback uses fresh jittered spawn
                const spawn = generateSpawnPoint();
                const newAnt = sim.addAnt(spawn.x, spawn.y, spawn.facing);
                newAnt.state = spawn.state;
            }

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
            appState.strictCenterSpawn = !appState.strictCenterSpawn;
            updateStrictCenterUI();
        });
        updateStrictCenterUI();
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
            setStepsPerSecond(10000, true, 'Full Speed');
        });
    }
    if (resetSpeedBtn) {
        resetSpeedBtn.addEventListener('click', () => {
            setStepsPerSecond(11, true, 'Reset Speed');
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
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', () => exportStateAsPng());
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
        // 1. The Listener
        parallaxToggle.addEventListener('change', (e) => {
            renderer.set3D(e.target.checked);
            requestRender({ grid: false });
            processRenderQueue();
            updateHotkeyOverlay();

            // Auto-disable grid if 3D is enabled
            if (e.target.checked) {
                const gridToggle = document.getElementById('gridToggle');

                // Check if grid exists and is on
                if (gridToggle && gridToggle.checked) {
                    gridToggle.checked = false;

                    // Safe check for the overlay
                    if (typeof gridOverlay !== 'undefined') {
                        gridOverlay.classList.remove('visible');
                    } // Closes "if (typeof...)"
                } // Closes "if (gridToggle...)"
            } // Closes "if (e.target.checked)"
        }); // <--- Closes the Event Listener

        // 2. The "Ignition" (Runs once on startup)
        renderer.set3D(parallaxToggle.checked);

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
            // Step 1: Rewind (Clear Grid & Ants)
            sim.reset();
            sim.ants = []; // Remove default ant

            // Step 2: Restore (Respawn existing ants from startState)
            if (appState.startState.length > 0) {
                appState.startState.forEach(ant => {
                    const restored = sim.addAnt(ant.x, ant.y, ant.facing);
                    if (typeof ant.state === 'number') restored.state = ant.state;
                });
            }
            // Note: If startState is empty (fresh load), we just start with 0 ants and add the new one.

            // Step 3: Add (Spawn new ant)
            const mode = document.getElementById('spawnMode').value;
            const facingVal = document.getElementById('initialFacing').value;
            const index = sim.ants.length; // Index for spawn pattern
            let facing;

            if (facingVal === 'random') {
                facing = Math.floor(Math.random() * 4);
            } else {
                facing = parseInt(facingVal, 10);
            }

            let spawnPoint;
            if (appState.strictCenterSpawn) {
                const centerX = Math.floor(GRID_WIDTH / 2);
                const centerY = Math.floor(GRID_HEIGHT / 2);
                spawnPoint = { x: centerX, y: centerY };
            } else {
                spawnPoint = RuleGenerators.getSpawnGeometry(mode, index, sim.ants.length + 1, GRID_WIDTH, GRID_HEIGHT);
            }
            const { x, y } = spawnPoint;
            sim.addAnt(x, y, facing);

            // Step 4: Capture (Save new clean configuration)
            captureStartState();

            // Step 5: Reset Visuals & UI
            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
        });
    });

    removeAntBtn.addEventListener('click', () => {
        performWithHistory('Remove Ant', () => {
            // Step 1: Rewind
            sim.reset();
            sim.ants = [];

            // Step 2: Restore
            if (appState.startState.length > 0) {
                appState.startState.forEach(ant => {
                    const restored = sim.addAnt(ant.x, ant.y, ant.facing);
                    if (typeof ant.state === 'number') restored.state = ant.state;
                });
            }

            // Step 3: Modify (Remove last ant)
            if (sim.ants.length > 0) {
                sim.ants.pop();
            }

            // Step 4: Capture
            captureStartState();

            // Step 5: Render
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
                    sim.reset(); // Default behavior (one center ant)
                    sim.ants = [];
                    const spawn = generateSpawnPoint();
                    const ant = sim.addAnt(spawn.x, spawn.y, spawn.facing);
                    ant.state = spawn.state;
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
                    renderer.setPalette("Classic");
                    themeSelect.value = "Classic";
                } else {
                    // Calculate required colors from state 0 (representative)
                    const numColors = Object.keys(preset.rules[0]).length;
                    const newPalette = renderer.generateRandomPalette(numColors);
                    renderer.setCustomPalette(newPalette);
                    themeSelect.value = "Custom";
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
        performWithHistory('Randomize Rules', () => {
            sim.reset();
            sim.ants = []; // Clear default ant to ensure strict count control
            requestRender({ grid: true, forceFullRedraw: true });

            // Reset Speed
            setStepsPerSecond(11);

            let newRules;
            let strategy;
            let isValid = false;
            let attempts = 0;
            const maxAttempts = 10;

            // Retry Loop for Quality Control
            do {
                attempts++;
                // 1. Generate Symmetrical Rules (Smart Generator)
                newRules = RuleGenerators.generateSymmetrical(PRESETS);

                // 2. Pick Strategy
                const strategies = [
                    'mandala', 'grid', 'spiral', 'cross', 'flower',
                    'ring_burst', 'corners', 'edges', 'random_scatter', 'diagonal_cross', 'cascade'
                ];
                strategy = strategies[Math.floor(Math.random() * strategies.length)];

                // 3. Validate
                isValid = RuleGenerators.validate(newRules, strategy, AntSimulation, GRID_WIDTH, GRID_HEIGHT);

                if (!isValid) {
                    console.log(`Generation attempt ${attempts} failed validation (Stuck/Looping). Retrying...`);
                }
            } while (!isValid && attempts < maxAttempts);

            if (!isValid) {
                console.warn("Could not generate valid rules after max attempts. Using last result.");
            } else {
                console.log(`Success! Valid rules generated on attempt ${attempts}.`);
            }

            appState.currentRules = newRules;
            sim.setRules(newRules);
            updateRulesetTitle("Random");

            // 2. Spawn Ants (Nexus Mode)
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

                if (appState.strictCenterSpawn) {
                    x = Math.floor(GRID_WIDTH / 2);
                    y = Math.floor(GRID_HEIGHT / 2);
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

                    if (strategy === 'mandala') {
                        // Face INWARD to force interaction immediately
                        // Calculate facing (0-3) based on angle
                        // Normalize angle to 0-4 quadrant
                        const normalized = ((geometry.angle / (2 * Math.PI)) + 0.75) % 1;
                        facing = Math.floor(normalized * 4);
                    }
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
            const newPalette = renderer.generateRandomPalette(numColors);
            renderer.setCustomPalette(newPalette);
            themeSelect.value = "Custom";
            syncTruchetMode(renderer.renderMode === 'truchet');

            rulePreset.selectedIndex = -1;
            updateColorPicker();
            renderRuleSummary();
            requestRender({ grid: true, forceFullRedraw: true });
            processRenderQueue();
            captureStartState(); // Snapshot for Smart Reset
        });
    });

    function populateThemes() {
        themeSelect.innerHTML = '';

        // Removed "Generate Random" option from dropdown

        for (const name of Object.keys(renderer.palettes)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            themeSelect.appendChild(option);
        }
    }

    themeSelect.addEventListener('change', (e) => {
        performWithHistory('Theme Change', () => {
            renderer.setPalette(e.target.value);
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
                // 1. Inspect the current physics engine
                // We check state 0 of the current rules to find the color depth
                const activeRules = sim.rules;
                const numColors = Object.keys(activeRules[0]).length;

                // 2. Generate a palette that matches the physics
                const newPalette = renderer.generateRandomPalette(numColors);
                renderer.setCustomPalette(newPalette);

                // 3. Update UI
                themeSelect.value = "Custom";
                updateColorPicker();
                requestRender({ grid: true, forceFullRedraw: true });
                processRenderQueue();
            });
        });
    }
    // 3D Toggle Handling Removed

    // Zoom Handling
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Determine direction
        const delta = Math.sign(e.deltaY) * -1; // Up is positive (zoom in)

        // Calculate new scale
        let newScale = Math.floor(renderer.cellSize + delta);

        // Dynamic Minimum Scale (Fit to Height - Integer Floor)
        const minScale = Math.max(1, Math.floor(canvasContainer.clientHeight / GRID_HEIGHT));

        // Clamp
        if (newScale < minScale) newScale = minScale;
        if (newScale > 32) newScale = 32;

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
        if (!renderer.use3D) return;

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
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoAction();
            } else {
                undoAction();
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'r':
                randomizeBtn.click();
                break;
            case 's':
                if (showHideBtn) showHideBtn.click();
                break;
            case 'c':
                if (generateRandomThemeBtn) generateRandomThemeBtn.click();
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
            case '3': // Reset
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
            case 'g': // Toggle Grid
                if (gridToggle) {
                    gridToggle.checked = !gridToggle.checked;
                    gridToggle.dispatchEvent(new Event('change'));
                    updateHotkeyOverlay();
                }
                break;
            case 'u': // Toggle Parallax
                if (parallaxToggle) {
                    parallaxToggle.checked = !parallaxToggle.checked;
                    parallaxToggle.dispatchEvent(new Event('change'));
                    updateHotkeyOverlay();
                }
                break;
            case 'h': // Toggle HUD/Overlays
                setOverlayVisibility(appState.overlaysHidden);
                updateHotkeyOverlay();
                break;
        }
    });
}

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

function generateSpawnPoint() {
    const states = appState.currentRules ? Object.keys(appState.currentRules).map(Number) : [0];
    const statePool = states.length ? states : [0];

    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const jitterX = Math.min(20, Math.max(5, Math.floor(GRID_WIDTH * 0.02))) || 1;
    const jitterY = Math.min(20, Math.max(5, Math.floor(GRID_HEIGHT * 0.02))) || 1;
    const margin = 2;

    const x = appState.strictCenterSpawn
        ? centerX
        : clamp(centerX + randomInt(-jitterX, jitterX), margin, GRID_WIDTH - margin - 1);
    const y = appState.strictCenterSpawn
        ? centerY
        : clamp(centerY + randomInt(-jitterY, jitterY), margin, GRID_HEIGHT - margin - 1);
    const facing = randomInt(0, 3); // Cardinal only for stability
    const state = statePool[randomInt(0, statePool.length - 1)] || 0;

    return { x, y, facing, state };
}

function respawnWithJitter() {
    const { sim } = appState;
    if (!sim) return;
    sim.ants = [];
    const spawn = generateSpawnPoint();
    const ant = sim.addAnt(spawn.x, spawn.y, spawn.facing);
    ant.state = spawn.state;
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

function restoreStartState() {
    if (!appState.sim) return;
    appState.sim.grid = appState.startGrid ? appState.startGrid.slice() : new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    appState.sim.ants = appState.startState.map(ant => ({ ...ant, state: ant.state || 0 }));
    appState.sim.markAllCellsDirty();
    requestRender({ grid: true, forceFullRedraw: true });
    processRenderQueue();
}

/**
 * Updates the hotkey overlay to reflect current state
 */
function updateHotkeyOverlay() {
    const overlay = document.getElementById('hotkeyOverlay');
    if (!overlay) return;

    const isPausedText = appState.isPaused ? '⏵ Resume' : '⏸ Pause';
    const is3DText = appState.renderer.use3D ? '🌀 Mouse Parallax: ON' : '⬜ Mouse Parallax: OFF';
    const gridText = appState.renderer.showGrid ? '⊞ Grid: ON' : '⊞ Grid: OFF';
    overlay.innerHTML = `
        <strong style="color: #00ff88;">Quick Keys</strong><br>
        [R] Randomize <br>
        [1/2] Cycle Presets<br>
        [3] Restart Current Rule-Set<br>
        [C] Randomize Colour<br>
        [Space] ${isPausedText}<br>
        [9/0] -/+ 5 Small Speed Change<br>
        [7/8] -/+ 100 Large Speed Change<br>
        [G] ${gridText}<br>
        [U] ${is3DText}<br>
        [H] Hide/Show HUD<br>
        [S] Show/Hide Controls Panel
    `.trim();
}

// Start the application
init();

// End of file
