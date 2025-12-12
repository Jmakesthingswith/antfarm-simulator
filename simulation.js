import { cloneStructured } from './utils.js';

/**
 * simulation.js
 * 
 * Handles the core logic for the Turmite/Langton's Ant simulation.
 * Pure logic, no DOM or Canvas dependencies.
 */

// Direction Constants
export const DIR = {
    N: 0,
    E: 1,
    S: 2,
    W: 3
};

// Turn Constants
export const TURN = {
    L: -1, // Left
    R: 1,  // Right
    U: 2,  // U-turn
    N: 0   // No turn
};

/**
 * @typedef {Object} Ant
 * @property {number} x - X coordinate (0 to width-1)
 * @property {number} y - Y coordinate (0 to height-1)
 * @property {0|1|2|3} facing - Direction (0=N, 1=E, 2=S, 3=W)
 * @property {number} state - Internal state for Turmite
 */

/**
 * @typedef {Object} Rule
 * @property {number} write - Color to write
 * @property {-1|0|1|2} turn - Turn direction (L=-1, N=0, R=1, U=2)
 * @property {number} nextState - Next state to transition to
 */

/**
 * @typedef {Object.<number, Object.<number, Rule>>} RuleSet
 */

class AntSimulation {
    /**
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     */
    constructor(width, height) {
        this.width = width;
        this.height = height;
        /** @type {Uint8Array} */
        this.grid = new Uint8Array(width * height);
        /** @type {Set<number>} */
        this.dirtyCells = new Set();
        /** @type {Ant[]} */
        this.ants = [];
        /** @type {RuleSet} */
        this.rules = {
            0: {
                0: { write: 1, turn: 1, nextState: 0 },
                1: { write: 0, turn: -1, nextState: 0 }
            }
        };
        this.orientations = new Uint8Array(width * height);
        this.toggleOrientationOnVisit = false;

        this.history = [];
        this.historyLimit = 10;
        this.SNAPSHOT_INTERVAL = 500;
        this.stepCount = 0;

        this.addAnt(Math.floor(width / 2), Math.floor(height / 2), 0);
    }

    /**
     * Adds a new ant to the simulation
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {0|1|2|3} facing - Initial direction
     * @returns {Ant} The created ant
     */
    addAnt(x, y, facing) {
        const ant = { x, y, facing, state: 0 };
        this.ants.push(ant);
        return ant;
    }

    /**
     * Updates simulation by N steps
     * @param {number} steps - Number of steps to execute
     */
    update(steps) {
        // Local references for performance
        const { width, height, grid, rules, orientations, toggleOrientationOnVisit } = this;

        for (let i = 0; i < steps; i++) {
            this.stepCount++;

            // History Snapshot
            if (this.stepCount % this.SNAPSHOT_INTERVAL === 0) {
                this.snapshot(); // Periodic checkpoint for undo/redo without tracking every single step
            }

            // Iterate through all ants
            for (let a = 0; a < this.ants.length; a++) {
                const ant = this.ants[a];
                let { x, y, facing, state } = ant;

                // 1. Read current cell color
                const index = y * width + x;
                const currentColor = grid[index];

                // 3. Simple Rule Resolution
                const stateRules = rules[state];
                if (!stateRules) continue;

                const rule = stateRules[currentColor];
                if (!rule) continue;

                // 3. Write new color
                if (grid[index] !== rule.write) {
                    grid[index] = rule.write;
                    this.dirtyCells.add(index);
                }
                // Even if the color doesn't change, the ant vacates this cell; mark it dirty so rendering restores the base grid color.
                this.dirtyCells.add(index);
                if (toggleOrientationOnVisit && orientations.length === grid.length) {
                    orientations[index] = 1 - orientations[index];
                }

                // 4. Update State
                state = rule.nextState;

                // 5. Turn
                if (rule.turn === TURN.U) {
                    // U-turn: reverse direction (add 2, wrap)
                    facing = (facing + 2) % 4;
                } else {
                    // Normal turn: L=-1, R=1, N=0
                    facing = (facing + rule.turn + 4) % 4;
                }
                // This ensures:
                // North (0) + U-turn = South (2)
                // East (1) + U-turn = West (3)
                // South (2) + U-turn = North (0)
                // West (3) + U-turn = East (1)

                // 6. Move
                switch (facing) {
                    case DIR.N: y--; break;
                    case DIR.E: x++; break;
                    case DIR.S: y++; break;
                    case DIR.W: x--; break;
                }

                // 7. Handle Boundaries (Wrap)
                if (x < 0) x = width - 1;
                else if (x >= width) x = 0;

                if (y < 0) y = height - 1;
                else if (y >= height) y = 0;

                // Write back to ant object
                ant.x = x;
                ant.y = y;
                ant.facing = facing;
                ant.state = state;
            }
        }
    }

    snapshot() {
        // Deep copy state
        const snap = {
            ants: cloneStructured(this.ants),
            grid: this.grid.slice(),
            orientations: this.orientations.slice(),
            stepCount: this.stepCount
        };
        this.history.push(snap);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }

    restore() {
        if (this.history.length === 0) return false;
        const snap = this.history.pop();
        this.grid = snap.grid.slice();
        if (snap.orientations) {
            this.orientations = snap.orientations.slice();
        } else {
            this.orientations = new Uint8Array(this.width * this.height);
        }
        this.ants = cloneStructured(snap.ants);
        this.stepCount = snap.stepCount;
        this.markAllCellsDirty();
        return true;
    }

    markAllCellsDirty() {
        this.dirtyCells = new Set();
        const totalCells = this.width * this.height;
        for (let i = 0; i < totalCells; i++) {
            this.dirtyCells.add(i);
        }
    }

    clearDirtyCells() {
        this.dirtyCells.clear();
    }

    /**
     * Resets the grid and ants.
     */
    reset() {
        this.grid.fill(0);
        this.orientations.fill(0);
        this.ants = [];
        this.addAnt(Math.floor(this.width / 2), Math.floor(this.height / 2), DIR.N);
        this.history = [];
        this.stepCount = 0;
        this.dirtyCells.clear();
    }

    /**
     * Sets the rules for the simulation.
     * @param {Object} newRules - The new rule set.
     */
    setRules(newRules) {
        this.rules = newRules;
    }
}
export { AntSimulation };
