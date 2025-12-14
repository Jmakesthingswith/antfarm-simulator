import { cloneStructured } from './utils.js';

/**
 * simulation.js
 * 
 * Handles the core logic for the Turmite/Langton's Ant simulation.
 * Pure logic, no DOM or Canvas dependencies.
 */

export const DIR = {
    N: 0,
    E: 1,
    S: 2,
    W: 3
};

export const TURN = {
    L: -1,
    R: 1,
    U: 2,
    N: 0
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
        this.enableHistory = true;
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

        this.history = [];              //Legacy: snapshots disabled
        this.historyLimit = 0;         // No history retention
        this.SNAPSHOT_INTERVAL = Infinity;   // Never snapshot
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
     * Executes a single simulation step for all ants.
     * @returns {void}
     */
    step() {

        this.enableHistory = false;

        const { width, height, grid, rules } = this;

        for (let a = 0; a < this.ants.length; a++) {
            const ant = this.ants[a];
            let { x, y, facing, state } = ant;

            const index = y * width + x;
            const currentColor = grid[index];

            const stateRules = rules[state];
            if (!stateRules) continue;

            const rule = stateRules[currentColor];
            if (!rule) continue;

            if (grid[index] !== rule.write) {
                grid[index] = rule.write;
                this.dirtyCells.add(index);
            }

            // Update State
            state = rule.nextState;

            if (rule.turn === TURN.U) {
                facing = (facing + 2) % 4;
            } else {
                facing = (facing + rule.turn + 4) % 4;
            }

            switch (facing) {
                case DIR.N: y--; break;
                case DIR.E: x++; break;
                case DIR.S: y++; break;
                case DIR.W: x--; break;
            }

            if (x < 0) x = width - 1;
            else if (x >= width) x = 0;

            if (y < 0) y = height - 1;
            else if (y >= height) y = 0;

            ant.x = x;
            ant.y = y;
            ant.state = state;
            ant.facing = facing;
        }

        this.stepCount++;
    }

    /**
     * Advances the simulation by N steps.
     * @param {number} [steps=1] - Number of steps to execute.
     * @returns {void}
     */
    update(steps = 1) {
    for (let i = 0; i < steps; i++) {
        this.step();
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


    reset() {
        this.grid.fill(0);
        this.orientations.fill(0);
        this.ants = [];
        this.addAnt(Math.floor(this.width / 2), Math.floor(this.height / 2), DIR.N);
        this.history = [];
        this.stepCount = 0;
        this.dirtyCells.clear();
    }
    // Removes test ant generated during ruleGenerator when using testSim.reset()
    clearAnts() {
        this.ants.length = 0;
    }
    /**
     * @param {Object} newRules - The new rule set.
     */
    setRules(newRules) {
        this.rules = newRules;
    }
}

export { AntSimulation };

