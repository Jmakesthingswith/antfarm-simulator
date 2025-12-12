/**
 * presets.js
 * 
 * Collection of Turmite/Ant DNA configurations.
 */

import { TURN } from './simulation.js';
import { cloneStructured } from './utils.js';

const cloneRules = (rules) => cloneStructured(rules);

const PRESETS = {
    "Langton's Ant": {
        description: "The classic chaotic agent. 2 Colors, RL.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.R, nextState: 0 },
                1: { write: 0, turn: TURN.L, nextState: 0 }
            }
        }
    },
    "Highway Builder": {
        description: "Builds a diagonal highway. RLLR.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.R, nextState: 0 },
                1: { write: 2, turn: TURN.L, nextState: 0 },
                2: { write: 3, turn: TURN.L, nextState: 0 },
                3: { write: 0, turn: TURN.R, nextState: 0 }
            }
        }
    },
    "Chaotic Weaver": {
        description: "A 4-state, 2-color turmite that weaves complex patterns.",
        rules: {
            0: { // State 0
                0: { write: 1, turn: TURN.R, nextState: 1 },
                1: { write: 1, turn: TURN.L, nextState: 1 }
            },
            1: { // State 1
                0: { write: 1, turn: TURN.R, nextState: 1 },
                1: { write: 0, turn: TURN.R, nextState: 0 }
            }
        }
    },
    "Spiral Growth": {
        description: "Slowly growing spiral pattern.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.L, nextState: 0 },
                1: { write: 1, turn: TURN.R, nextState: 1 }
            },
            1: {
                0: { write: 0, turn: TURN.R, nextState: 0 },
                1: { write: 0, turn: TURN.L, nextState: 1 }
            }
        }
    },
    "Textile Weaver": {
        description: "Symmetrical weaver pattern. 4 States.",
        rules: {
            0: { 0: { write: 1, turn: TURN.R, nextState: 1 }, 1: { write: 0, turn: TURN.L, nextState: 1 } },
            1: { 0: { write: 1, turn: TURN.L, nextState: 2 }, 1: { write: 0, turn: TURN.R, nextState: 2 } },
            2: { 0: { write: 1, turn: TURN.R, nextState: 3 }, 1: { write: 0, turn: TURN.L, nextState: 3 } },
            3: { 0: { write: 1, turn: TURN.L, nextState: 0 }, 1: { write: 0, turn: TURN.R, nextState: 0 } }
        }
    },
    "Fibonacci Spiral": {
        description: "Golden ratio approximations.",
        rules: {
            0: { 0: { write: 1, turn: TURN.L, nextState: 1 }, 1: { write: 1, turn: TURN.L, nextState: 1 } },
            1: { 0: { write: 1, turn: TURN.R, nextState: 1 }, 1: { write: 0, turn: TURN.R, nextState: 0 } }
        }
    },
    "Crystal Castle": {
        description: "Builds a castle-like structure.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.R, nextState: 0 },
                1: { write: 2, turn: TURN.L, nextState: 0 },
                2: { write: 0, turn: TURN.U, nextState: 0 }
            }
        }
    },
    "Fractal Snowflake": {
        description: "Generates a fractal-like snowflake pattern.",
        rules: {
            0: { 0: { write: 1, turn: TURN.R, nextState: 1 }, 1: { write: 0, turn: TURN.L, nextState: 1 } },
            1: { 0: { write: 1, turn: TURN.L, nextState: 0 }, 1: { write: 1, turn: TURN.R, nextState: 0 } }
        }
    },
    "Expanding Square": {
        description: "A square that keeps expanding.",
        rules: {
            0: { 0: { write: 1, turn: TURN.L, nextState: 0 }, 1: { write: 1, turn: TURN.R, nextState: 1 } },
            1: { 0: { write: 0, turn: TURN.R, nextState: 0 }, 1: { write: 0, turn: TURN.R, nextState: 1 } }
        }
    },
    "Multicolor Weaver": {
        description: "Cycles through 4 colors to create a vibrant weave.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.R, nextState: 0 },
                1: { write: 2, turn: TURN.L, nextState: 0 },
                2: { write: 3, turn: TURN.R, nextState: 0 },
                3: { write: 0, turn: TURN.L, nextState: 0 }
            }
        }
    },
    "Neon Spinner": {
        description: "Complex 6-color spinner.",
        rules: {
            0: {
                0: { write: 1, turn: TURN.R, nextState: 0 },
                1: { write: 2, turn: TURN.R, nextState: 0 },
                2: { write: 3, turn: TURN.L, nextState: 0 },
                3: { write: 4, turn: TURN.L, nextState: 0 },
                4: { write: 5, turn: TURN.R, nextState: 0 },
                5: { write: 0, turn: TURN.L, nextState: 0 }
            }
        }
    }
};


/**
 * Generates a random set of rules, using Mutation, Wolfram-style formulas, or Constrained Randomness.
 * Uses "Grandmaster" validation to ensure quality.
 * @returns {Object} Random rules object.
 */
function generateRandomRules(baseRules = null, maxMutations = null, allowStructureChange = false) {
    let candidateRules = null;

    if (baseRules) {
        // --- STRATEGY: MUTATE BASE RULES ---
        candidateRules = cloneRules(baseRules);
        const states = Object.keys(candidateRules).map(Number);
        const numStates = states.length;
        const colors = Object.keys(candidateRules[states[0]]).map(Number);
        const numColors = colors.length;

        let structuralChangeOccurred = false;

        if (allowStructureChange) {
            const roll = Math.random();
            // 40% chance of structural change (10% each type)
            if (roll < 0.10) {
                // ADD STATE
                const newState = Math.max(...states) + 1;
                candidateRules[newState] = {};
                // Copy rules from a random existing state to seed the new one
                const templateState = states[Math.floor(Math.random() * numStates)];
                for (let c of colors) {
                    candidateRules[newState][c] = cloneRules(candidateRules[templateState][c]);
                    // Mutate slightly to differentiate
                    if (Math.random() < 0.5) candidateRules[newState][c].turn = (candidateRules[newState][c].turn === 1) ? -1 : 1;
                }
                structuralChangeOccurred = true;
            } else if (roll < 0.20) {
                // ADD COLOR
                const newColor = Math.max(...colors) + 1;
                for (let s of states) {
                    // Create a random rule for this new color
                    candidateRules[s][newColor] = {
                        write: Math.floor(Math.random() * (numColors + 1)), // Can write to new color
                        turn: [TURN.L, TURN.R, TURN.N][Math.floor(Math.random() * 3)],
                        nextState: states[Math.floor(Math.random() * numStates)]
                    };
                }
                structuralChangeOccurred = true;
            } else if (roll < 0.30 && numStates > 2) {
                // REMOVE STATE
                const stateToRemove = states[Math.floor(Math.random() * numStates)];
                delete candidateRules[stateToRemove];
                // Remap any transitions pointing to this state to a random existing state
                const remainingStates = states.filter(s => s !== stateToRemove);
                for (let s of remainingStates) {
                    for (let c of colors) {
                        if (candidateRules[s][c].nextState == stateToRemove) {
                            candidateRules[s][c].nextState = remainingStates[Math.floor(Math.random() * remainingStates.length)];
                        }
                    }
                }
                structuralChangeOccurred = true;
            } else if (roll < 0.40 && numColors > 2) {
                // REMOVE COLOR
                const colorToRemove = colors[Math.floor(Math.random() * numColors)];
                for (let s of states) {
                    delete candidateRules[s][colorToRemove];
                    // Remap writes: if writing to removed color, write to random existing color
                    const remainingColors = colors.filter(c => c !== colorToRemove);
                    for (let c of remainingColors) {
                        if (candidateRules[s][c].write == colorToRemove) {
                            candidateRules[s][c].write = remainingColors[Math.floor(Math.random() * remainingColors.length)];
                        }
                    }
                }
                structuralChangeOccurred = true;
            }
        }

        if (!structuralChangeOccurred) {
            // Standard Mutation
            let numMutations;
            if (maxMutations !== null) {
                numMutations = Math.floor(Math.random() * maxMutations) + 1; // 1 to max
            } else {
                numMutations = Math.floor(Math.random() * 9) + 2; // 2 to 10 mutations (default)
            }

            const turns = [TURN.L, TURN.R, TURN.U, TURN.N];

            for (let i = 0; i < numMutations; i++) {
                const currentStates = Object.keys(candidateRules);
                if (currentStates.length === 0) continue;

                const randomState = currentStates[Math.floor(Math.random() * currentStates.length)];
                const currentColors = Object.keys(candidateRules[randomState]);
                const randomColor = currentColors[Math.floor(Math.random() * currentColors.length)];

                const rule = candidateRules[randomState][randomColor];
                // Handle nested structure if present (though presets usually flat for now, logic supports it)
                const actualRule = rule.default ? rule.default : rule;

                let mutationType;
                if (maxMutations === 1) {
                    // Strict Mode: Only change Turn or Write Color. Preserve State Flow.
                    mutationType = Math.random() < 0.5 ? 0 : 2;
                } else {
                    mutationType = Math.floor(Math.random() * 3);
                }

                if (mutationType === 0) {
                    let newTurn;
                    do {
                        newTurn = turns[Math.floor(Math.random() * turns.length)];
                    } while (newTurn === actualRule.turn);
                    actualRule.turn = newTurn;
                } else if (mutationType === 1) {
                    actualRule.nextState = currentStates[Math.floor(Math.random() * currentStates.length)];
                } else {
                    let newWrite;
                    do {
                        newWrite = currentColors[Math.floor(Math.random() * currentColors.length)];
                    } while (newWrite == actualRule.write);
                    actualRule.write = newWrite;
                }
            }
        }
    } else {
        const strategyRoll = Math.random();

        if (strategyRoll < 0.7) {
            // --- SACRED GEOMETRY (70% Chance) ---
            // Prioritizes symmetry, primes, and harmonic flow.

            // 1. Sacred Dimensions (Primes/Fibonacci)
            const stateOptions = [2, 3, 5, 7]; // Primes
            const colorOptions = [2, 3, 4, 5]; // Low complexity for clarity
            const numStates = stateOptions[Math.floor(Math.random() * stateOptions.length)];
            const numColors = colorOptions[Math.floor(Math.random() * colorOptions.length)];

            candidateRules = {};

            // 2. Harmonic Flow
            for (let s = 0; s < numStates; s++) {
                candidateRules[s] = {};
                for (let c = 0; c < numColors; c++) {

                    // Cyclic State Transition (The "Heartbeat")
                    // 80% chance to move to next state in cycle, 20% to stay or skip
                    let nextState;
                    const flowRoll = Math.random();
                    if (flowRoll < 0.8) {
                        nextState = (s + 1) % numStates;
                    } else if (flowRoll < 0.9) {
                        nextState = s; // Stasis
                    } else {
                        nextState = (s + 2) % numStates; // Skip
                    }

                    // Progressive Color Writing
                    // Write the next color in the sequence to create gradients
                    const write = (c + 1) % numColors;

                    // Symmetrical Turns (Checkerboard / Parity Logic)
                    // This creates the "Sacred" geometric feel
                    let turn;
                    const parity = (s + c) % 2;
                    if (parity === 0) {
                        turn = TURN.R;
                    } else {
                        turn = TURN.L;
                    }

                    // Occasional "Twist" (Mutation)
                    if (Math.random() < 0.05) {
                        turn = (turn === TURN.R) ? TURN.L : TURN.R;
                    }

                    candidateRules[s][c] = {
                        write: write,
                        turn: turn,
                        nextState: nextState
                    };
                }
            }

        } else {
            // --- CHAOTIC / STRUCTURED TURMITE (30% Chance) ---
            // The original "Structured Turmite" algorithm for variety
            const numStates = Math.floor(Math.random() * 3) + 2; // 2-4 states
            const numColors = Math.floor(Math.random() * 3) + 2; // 2-4 colors
            candidateRules = {};

            // Weighted Movement Distribution
            const moveOptions = [];
            for (let k = 0; k < 4; k++) { moveOptions.push(TURN.L); moveOptions.push(TURN.R); }
            moveOptions.push(TURN.N);
            moveOptions.push(TURN.U);

            for (let s = 0; s < numStates; s++) {
                candidateRules[s] = {};
                for (let c = 0; c < numColors; c++) {

                    // 1. Cyclic State Bias
                    const stateRoll = Math.random();
                    let nextState;
                    if (stateRoll < 0.70) {
                        nextState = (s + 1) % numStates; // 70% Next Link
                    } else if (stateRoll < 0.90) {
                        nextState = 0; // 20% Reset Loop
                    } else {
                        nextState = Math.floor(Math.random() * numStates); // 10% Mutation
                    }

                    // 2. Color Permutation (Write != Read)
                    const writeOffset = 1 + Math.floor(Math.random() * (numColors - 1));
                    const write = (c + writeOffset) % numColors;

                    // Weighted Turn
                    const turn = moveOptions[Math.floor(Math.random() * moveOptions.length)];

                    // Base Rule (Default)
                    const defaultRule = {
                        write: write,
                        turn: turn,
                        nextState: nextState
                    };

                    candidateRules[s][c] = defaultRule;
                }
            }
        }
    }

    return candidateRules;
}

export { PRESETS, generateRandomRules };
