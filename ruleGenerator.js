/**
 * Rule Generation Strategies
 * Each returns a RuleSet object
 */

import { TURN } from './simulation.js';
import { cloneStructured } from './utils.js';

const cloneRules = (rules) => cloneStructured(rules);

const RuleGenerators = {
    /**
     * Cellular Automata inspired - evolves rules from seed state
     */
    cellularAutomata(numStates = null, numColors = null) {
        const states = numStates || getWeightedCount(1);
        const colors = numColors || getWeightedCount(2);
        const rules = {};

        // Generate seed (State 0)
        rules[0] = {};
        for (let c = 0; c < colors; c++) {
            rules[0][c] = {
                write: (c + 1) % colors,
                turn: Math.random() > 0.5 ? TURN.R : TURN.L,
                nextState: Math.random() > 0.7 ? 1 : 0
            };
        }

        // Evolve subsequent states
        for (let s = 1; s < states; s++) {
            rules[s] = {};
            for (let c = 0; c < colors; c++) {
                const leftC = (c - 1 + colors) % colors;
                const rightC = (c + 1) % colors;

                const left = rules[s - 1][leftC];
                const center = rules[s - 1][c];
                const right = rules[s - 1][rightC];

                rules[s][c] = applyCARule(left, center, right, colors, states);
            }
        }

        return rules;
    },

    /**
     * Sacred Geometry - prioritizes symmetry and harmony
     */
    sacredGeometry(numStates = null, numColors = null) {
        const states = numStates || [2, 3, 5, 7][Math.floor(Math.random() * 4)]; // Primes
        const colors = numColors || [2, 3, 4][Math.floor(Math.random() * 3)];
        const rules = {};

        for (let s = 0; s < states; s++) {
            rules[s] = {};
            for (let c = 0; c < colors; c++) {
                // Cyclic state progression
                const nextState = (s + 1) % states;

                // Progressive color writing
                const write = (c + 1) % colors;

                // Symmetrical turns (checkerboard parity)
                const parity = (s + c) % 2;
                let turn = parity === 0 ? TURN.R : TURN.L;

                // 5% mutation rate for complexity
                if (Math.random() < 0.05) {
                    turn = turn === TURN.R ? TURN.L : TURN.R;
                }

                rules[s][c] = { write, turn, nextState };
            }
        }

        return rules;
    },

    /**
     * Wolfram-inspired - based on elementary CA rules
     */
    wolframStyle(ruleNumber = null) {
        const num = ruleNumber || Math.floor(Math.random() * 256);
        const binary = num.toString(2).padStart(8, '0');

        const states = 2;
        const colors = 2;
        const rules = {};

        for (let s = 0; s < states; s++) {
            rules[s] = {};
            for (let c = 0; c < colors; c++) {
                const bit = binary[s * 4 + c * 2];
                const nextBit = binary[s * 4 + c * 2 + 1];

                rules[s][c] = {
                    write: parseInt(bit),
                    turn: parseInt(nextBit) ? TURN.R : TURN.L,
                    nextState: (s + 1) % states
                };
            }
        }

        return rules;
    },

    /**
     * Mutation - takes existing rules and tweaks them
     */
    mutate(baseRules, mutations = 1, strict = false) {
        const rules = cloneRules(baseRules);
        const states = Object.keys(rules).map(Number);
        const colors = Object.keys(rules[states[0]]).map(Number);
        const turns = [TURN.L, TURN.R, TURN.U, TURN.N];

        for (let i = 0; i < mutations; i++) {
            const s = states[Math.floor(Math.random() * states.length)];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const rule = rules[s][c];

            let mutationType;
            if (strict) {
                // Only mutate turn or write, preserve state flow
                mutationType = Math.random() < 0.5 ? 'turn' : 'write';
            } else {
                mutationType = ['turn', 'state', 'write'][Math.floor(Math.random() * 3)];
            }

            switch (mutationType) {
                case 'turn':
                    let newTurn;
                    do {
                        newTurn = turns[Math.floor(Math.random() * turns.length)];
                    } while (newTurn === rule.turn);
                    rule.turn = newTurn;
                    break;
                case 'state':
                    rule.nextState = states[Math.floor(Math.random() * states.length)];
                    break;
                case 'write':
                    let newWrite;
                    do {
                        newWrite = colors[Math.floor(Math.random() * colors.length)];
                    } while (newWrite == rule.write);
                    rule.write = newWrite;
                    break;
            }
        }

        return rules;
    },

    /**
     * Orchestrates the generation of symmetrical rules.
     * Replaces main.js generateSymmetricalRules
     */
    generateSymmetrical(presets) {
        const strategy = Math.random();

        if (strategy < 0.5) {
            return this.cellularAutomata();
        } else if (strategy < 0.75) {
            return this.sacredGeometry();
        } else if (strategy < 0.9) {
            return this.wolframStyle();
        } else {
            // Mutate a random preset
            const presetNames = Object.keys(presets);
            const randomPreset = presets[presetNames[Math.floor(Math.random() * presetNames.length)]];
            return this.mutate(randomPreset.rules, 5);
        }
    },

    /**
     * Validates that the rules produce interesting behavior.
     * Replaces main.js validateRules
     */
    validate(rules, strategy, AntSimulation, GRID_WIDTH, GRID_HEIGHT) {
        // Dependencies passed in to avoid circular imports or hardcoding
        const testSim = new AntSimulation(GRID_WIDTH, GRID_HEIGHT);
        testSim.setRules(rules);
        testSim.ants = [];
        const antCount = 8;
        const startPositions = [];

        // Spawn test ants
        for (let i = 0; i < antCount; i++) {
            const geometry = this.getSpawnGeometry(strategy, i, antCount, GRID_WIDTH, GRID_HEIGHT);
            let x = geometry.x;
            let y = geometry.y;
            let facing = Math.floor(Math.random() * 4);

            if (strategy === 'mandala' && geometry.angle !== undefined) {
                const normalized = ((geometry.angle / (2 * Math.PI)) + 0.75) % 1;
                facing = Math.floor(normalized * 4);
            }
            testSim.addAnt(x, y, facing);
            startPositions.push({ x, y, facing });
        }

        // Track ant positions over time
        const history = [];
        const steps = 500;
        const checkInterval = 50;

        for (let step = 0; step < steps; step++) {
            testSim.update(1);

            if (step % checkInterval === 0) {
                history.push(testSim.ants.map(a => ({ x: a.x, y: a.y, facing: a.facing })));
            }
        }

        // VALIDATION CHECKS
        let totalDisplacement = 0;
        let stuckAnts = 0;
        let escapedAnts = 0;
        let trivialAnts = 0;

        testSim.ants.forEach((ant, i) => {
            const start = startPositions[i];
            const dx = ant.x - start.x;
            const dy = ant.y - start.y;

            // Handle wrapping for displacement calculation
            const wrappedDx = Math.abs(dx) > GRID_WIDTH / 2 ? GRID_WIDTH - Math.abs(dx) : Math.abs(dx);
            const wrappedDy = Math.abs(dy) > GRID_HEIGHT / 2 ? GRID_HEIGHT - Math.abs(dy) : Math.abs(dy);
            const dist = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);

            totalDisplacement += dist;

            // Check 1: Stuck (hasn't moved much from origin)
            if (dist < 4) stuckAnts++;

            // Check 2: Escaped (too far from center)
            const centerX = GRID_WIDTH / 2;
            const centerY = GRID_HEIGHT / 2;
            const distFromCenter = Math.sqrt(
                Math.pow(ant.x - centerX, 2) + Math.pow(ant.y - centerY, 2)
            );
            if (distFromCenter > Math.min(GRID_WIDTH, GRID_HEIGHT) * 0.4) {
                escapedAnts++;
            }

            // Check 3: Trivial movement (moving in nearly straight line)
            // Compare direction changes across history
            let directionChanges = 0;
            for (let h = 1; h < history.length; h++) {
                if (history[h][i].facing !== history[h - 1][i].facing) {
                    directionChanges++;
                }
            }
            // If fewer than 2 direction changes in 500 steps, it's trivial
            if (directionChanges < 2) trivialAnts++;
        });

        // Unique state count check
        const uniqueStates = new Set(testSim.grid).size;

        // --- STUCK ANT FIX ---
        // Enhanced stuck detection: If >50% of ants are within 4 pixels of start, FAIL.
        if (stuckAnts > antCount * 0.5) return false;

        // Ensure some movement happened on average
        const avgDisplacement = totalDisplacement / antCount;
        if (avgDisplacement < 5) return false;

        // Ensure NOT ALL ants are trivial
        if (trivialAnts > antCount * 0.8) return false;

        // Ensure diversity
        if (uniqueStates < 3) return false;

        return true;
    },



    /**
     * Geometric Spawning Logic
     */
    getSpawnGeometry(mode, index, totalCount, width, height) {
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Helper to keep points on screen
        const clampX = (x) => Math.max(2, Math.min(width - 3, Math.floor(x)));
        const clampY = (y) => Math.max(2, Math.min(height - 3, Math.floor(y)));

        // MODE: 'nexus' (The Big Bang)
        // All ants spawn at the exact center.
        if (mode === 'nexus') {
            return { x: centerX, y: centerY };
        }

        switch (mode) {
            case 'center':
                return { x: centerX, y: centerY };

            case 'cluster':
                const margin = 0.35; // Tighter cluster (was 0.25)
                return {
                    x: clampX(width * (margin + Math.random() * (1 - 2 * margin))),
                    y: clampY(height * (margin + Math.random() * (1 - 2 * margin)))
                };

            case 'random_scatter':
                // Central 60% of the screen
                const scatterMargin = 0.2;
                return {
                    x: clampX(width * (scatterMargin + Math.random() * (1 - 2 * scatterMargin))),
                    y: clampY(height * (scatterMargin + Math.random() * (1 - 2 * scatterMargin)))
                };

            case 'linear':
                const linSpacing = 10; // Tighten spacing (was 20)
                return {
                    x: clampX((centerX + (index - totalCount / 2) * linSpacing)),
                    y: centerY
                };

            case 'grid':
                // Attempt to make a nice grid
                const cols = Math.ceil(Math.sqrt(totalCount));
                const rows = Math.ceil(totalCount / cols);
                const col = index % cols;
                const row = Math.floor(index / cols);
                // Reduce spread to 30% of screen (was 50%)
                const spacingX = Math.floor(width * 0.3 / cols);
                const spacingY = Math.floor(height * 0.3 / rows);
                const startX = centerX - ((cols - 1) * spacingX) / 2;
                const startY = centerY - ((rows - 1) * spacingY) / 2;
                return {
                    x: clampX(startX + col * spacingX),
                    y: clampY(startY + row * spacingY)
                };

            case 'corners':
                // 4 corners, but pulled in significantly (30% inset)
                const ox = Math.floor(width * 0.3);
                const oy = Math.floor(height * 0.3);
                const corners = [
                    { x: ox, y: oy },
                    { x: width - ox, y: oy },
                    { x: width - ox, y: height - oy },
                    { x: ox, y: height - oy }
                ];
                const c = corners[index % 4];
                return { x: clampX(c.x), y: clampY(c.y) };

            case 'edges':
                // 4 edge midpoints, pulled in (30% inset)
                const ex = Math.floor(width * 0.3);
                const ey = Math.floor(height * 0.3);
                const edges = [
                    { x: centerX, y: ey },            // Top
                    { x: width - ex, y: centerY },    // Right
                    { x: centerX, y: height - ey },   // Bottom
                    { x: ex, y: centerY }             // Left
                ];
                const e = edges[index % 4];
                return { x: clampX(e.x), y: clampY(e.y) };

            case 'diagonal_cross':
                // X shape
                const step = 5; // Reduced step (was 8)
                const leg = index % 4;
                const dist = Math.floor(index / 4) + 1;
                let dx = 0, dy = 0;
                if (leg === 0) { dx = -1; dy = -1; }
                else if (leg === 1) { dx = 1; dy = -1; }
                else if (leg === 2) { dx = 1; dy = 1; }
                else { dx = -1; dy = 1; }

                return {
                    x: clampX(centerX + dx * dist * step * 2),
                    y: clampY(centerY + dy * dist * step * 2)
                };

            case 'cross':
                // + shape
                const cStep = 6; // Reduced step (was 10)
                const cLeg = index % 4;
                const cDist = Math.floor(index / 4) + 1;
                /* 
                   0: Up
                   1: Right
                   2: Down
                   3: Left
                */
                if (cLeg === 0) return { x: centerX, y: clampY(centerY - cDist * cStep) };
                if (cLeg === 1) return { x: clampX(centerX + cDist * cStep), y: centerY };
                if (cLeg === 2) return { x: centerX, y: clampY(centerY + cDist * cStep) };
                return { x: clampX(centerX - cDist * cStep), y: centerY };

            case 'ring_burst':
                // Concentric circles
                const ringCount = Math.ceil(totalCount / 8);
                const currentRing = Math.floor(index / 8);
                const posInRing = index % 8;
                // Reduced radius (was 15 + 15)
                const ringRadius = 8 + (currentRing * 8);
                const ringAngle = (posInRing / 8) * 2 * Math.PI;
                return {
                    x: clampX(centerX + Math.cos(ringAngle) * ringRadius),
                    y: clampY(centerY + Math.sin(ringAngle) * ringRadius),
                    angle: ringAngle // Pass through for facing logic
                };

            case 'cascade':
                const cMargin = 0.35; // More central cascade
                const cW = width * (1 - 2 * cMargin);
                const cH = height * (1 - 2 * cMargin);
                return {
                    x: clampX(width * cMargin + (index * (cW / totalCount))),
                    y: clampY(height * cMargin + (index * (cH / totalCount)))
                };

            case 'spiral':
            case 'flower':
            case 'mandala':
            default:
                const angle = (index / totalCount) * 2 * Math.PI;
                // Reduced radius (was 0.25 = 25%) -> now 15%
                const radius = Math.min(width, height) * 0.15;
                return {
                    x: clampX(centerX + Math.cos(angle) * radius),
                    y: clampY(centerY + Math.sin(angle) * radius),
                    angle: angle
                };
        }
    }
};

// Helper functions
function getWeightedCount(min = 2) {
    const r = Math.random();
    if (r < 0.85) return Math.floor(Math.random() * (5 - min)) + min; // min to 4
    return Math.floor(Math.random() * 2) + 5; // 5-6 (rare)
}

function applyCARule(left, center, right, numColors, numStates) {
    // 5% mutation chance
    if (Math.random() < 0.05) {
        return {
            write: Math.floor(Math.random() * numColors),
            turn: Math.random() > 0.5 ? TURN.R : TURN.L,
            nextState: Math.floor(Math.random() * numStates)
        };
    }

    // XOR-like turn evolution
    const turnSum = Math.abs(left.turn + center.turn + right.turn);
    const turns = [TURN.N, TURN.R, TURN.U, TURN.L];
    const newTurn = turns[turnSum % 4];

    // Average color with offset
    const colorSum = left.write + center.write + right.write;
    const newWrite = (colorSum + 1) % numColors;

    // Majority rule for state
    let newState;
    if (left.nextState === right.nextState) {
        newState = left.nextState;
    } else {
        newState = (center.nextState + 1) % numStates;
    }

    return { write: newWrite, turn: newTurn, nextState: newState };
}
export default RuleGenerators;
