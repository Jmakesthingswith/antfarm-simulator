/**
 * presets.js
 * 
 * Collection of Turmite/Ant DNA configurations.
 */

import { TURN } from './simulation.js';
import { cloneStructured } from './utils.js';

const cloneRules = (rules) => cloneStructured(rules);

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function fnv1a32(str) {
    let h = 0x811C9DC5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function ecaRuleToBitString(ruleNumber) {
    return (ruleNumber >>> 0).toString(2).padStart(8, '0');
}

const ECA_MIRROR_MAP = [0, 4, 2, 6, 1, 5, 3, 7];

function invertBits(bits) {
    let out = '';
    for (let i = 0; i < bits.length; i++) out += bits[i] === '1' ? '0' : '1';
    return out;
}

function applyEcaTransforms(bits, transforms) {
    let out = bits;

    if (transforms.includes('mirror_lr')) {
        let mirrored = '';
        for (let i = 0; i < 8; i++) mirrored += out[ECA_MIRROR_MAP[i]];
        out = mirrored;
    }

    if (transforms.includes('invert_in_out')) {
        let conjugated = '';
        for (let i = 0; i < 8; i++) {
            const b = out[7 - i];
            conjugated += b === '1' ? '0' : '1';
        }
        out = conjugated;
    }

    if (transforms.includes('invert_out')) {
        out = invertBits(out);
    }

    return out;
}

function classHintFromEcaBits(bits, ecaRule) {
    if (ecaRule === 184) return 2;

    let ones = 0;
    for (let i = 0; i < 8; i++) ones += bits[i] === '1' ? 1 : 0;
    if (ones === 0 || ones === 8) return 1;
    if (ones === 1 || ones === 7) return 1;

    if (PERIODIC2_BITS.has(bits)) return 2;
    if (KNOWN_CLASS_4_ECA.has(ecaRule)) return 4;
    if (KNOWN_CLASS_3_ECA.has(ecaRule)) return 3;

    // Simple "activity" heuristic: count edge changes in the 8-bit lookup string.
    let runs = 0;
    for (let i = 0; i < 8; i++) {
        if (bits[i] !== bits[(i + 1) % 8]) runs++;
    }
    if (runs >= 6) return 3;
    if (runs >= 3) return 2;
    return 1;
}

const PERIODIC2_BITS = new Set([
    '01010101',
    '10101010',
    '00110011',
    '11001100',
    '00001111',
    '11110000'
]);

const KNOWN_CLASS_4_ECA = new Set([30, 54, 110]);
const KNOWN_CLASS_3_ECA = new Set([22, 45, 57, 73, 90, 105, 126, 150]);

function mapBitsToTurmiteRules(bits, mapping) {
    const rules = { 0: {}, 1: {} };

    if (mapping === 'eca_stream_to_turmite_2s3c_v1') {
        const numStates = 2;
        const numColors = 3;

        // Expand 8 bits into a longer deterministic stream.
        const streamLen = numStates * numColors * 4; // 2 bits write + 2 bits turn
        const stream = new Array(streamLen);
        for (let i = 0; i < streamLen; i++) {
            const b = bits[i % 8] === '1' ? 1 : 0;
            const mix = ((i * 5) ^ (i >>> 1)) & 1;
            stream[i] = b ^ mix;
        }

        for (let state = 0; state < numStates; state++) {
            rules[state] = {};
            for (let color = 0; color < numColors; color++) {
                const k = state * numColors + color;
                const w0 = stream[k * 4];
                const w1 = stream[k * 4 + 1];
                const t0 = stream[k * 4 + 2];
                const t1 = stream[k * 4 + 3];

                const writeVal = ((w0 << 1) | w1) % numColors;
                const turnCode = (t0 << 1) | t1;
                const turn = [TURN.L, TURN.R, TURN.N, TURN.U][turnCode];
                const nextState = (state + (writeVal & 1)) % numStates;

                rules[state][color] = { write: writeVal, turn, nextState };
            }
        }

        return rules;
    }

    for (let state = 0; state < 2; state++) {
        for (let color = 0; color < 2; color++) {
            const k = state * 2 + color;
            const bWrite = bits[k * 2] === '1' ? 1 : 0;
            const bTurn = bits[k * 2 + 1] === '1' ? 1 : 0;

            if (mapping === 'eca8bit_to_turmite_v2') {
                const turnCode = (bTurn << 1) | bWrite;
                const turn = [TURN.L, TURN.R, TURN.N, TURN.U][turnCode];
                const nextState = bTurn ? state : (state + 1) % 2;
                rules[state][color] = { write: bWrite, turn, nextState };
            } else {
                const turn = bTurn ? TURN.R : TURN.L;
                const nextState = (state + 1) % 2;
                rules[state][color] = { write: bWrite, turn, nextState };
            }
        }
    }

    return rules;
}

function enhancePresetRules(rules, seed, { targetStates = 3, targetColors = 3, mutationCount = 14 } = {}) {
    const prng = mulberry32(seed);

    const stateKeys = Object.keys(rules).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const colors = stateKeys.length ? Object.keys(rules[stateKeys[0]]).map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
    if (stateKeys.length === 0 || colors.length === 0) return rules;

    const turns = [TURN.L, TURN.R, TURN.U, TURN.N];

    // Grow colors up to target
    while (colors.length < targetColors) {
        const newColor = Math.max(...colors) + 1;
        for (const s of stateKeys) {
            rules[s][newColor] = {
                write: Math.floor(prng() * (newColor + 1)),
                turn: turns[Math.floor(prng() * turns.length)],
                nextState: stateKeys[Math.floor(prng() * stateKeys.length)]
            };
        }
        colors.push(newColor);
    }

    // Grow states up to target (copy/perturb an existing template)
    while (stateKeys.length < targetStates) {
        const newState = Math.max(...stateKeys) + 1;
        const templateState = stateKeys[Math.floor(prng() * stateKeys.length)];
        rules[newState] = {};
        for (const c of colors) {
            const src = rules[templateState][c];
            rules[newState][c] = {
                write: src.write,
                turn: src.turn,
                nextState: src.nextState
            };
            if (prng() < 0.5) rules[newState][c].turn = turns[Math.floor(prng() * turns.length)];
            if (prng() < 0.35) rules[newState][c].nextState = newState;
        }
        // Make newState reachable
        for (const s of stateKeys) {
            const c = colors[Math.floor(prng() * colors.length)];
            rules[s][c].nextState = newState;
        }
        stateKeys.push(newState);
    }

    // Guarantee paint: for each state, force at least one color to write to a different color.
    for (const s of stateKeys) {
        const c = colors[Math.floor(prng() * colors.length)];
        const nextColor = colors[(colors.indexOf(c) + 1) % colors.length];
        rules[s][c].write = nextColor;
    }

    // Deterministic mutations to add variety while staying valid.
    for (let i = 0; i < mutationCount; i++) {
        const s = stateKeys[Math.floor(prng() * stateKeys.length)];
        const c = colors[Math.floor(prng() * colors.length)];
        const r = rules[s][c];
        const pick = prng();
        if (pick < 0.34) {
            r.turn = turns[Math.floor(prng() * turns.length)];
        } else if (pick < 0.67) {
            r.write = colors[Math.floor(prng() * colors.length)];
        } else {
            r.nextState = stateKeys[Math.floor(prng() * stateKeys.length)];
        }
    }

    // Ensure the system can "bootstrap" from an all-zero grid: make sure reading color 0 can write a non-zero.
    // Apply after mutation so it can't be overwritten.
    const nonZeroColors = colors.filter(c => c !== 0);
    if (nonZeroColors.length) {
        for (let i = 0; i < stateKeys.length; i++) {
            const s = stateKeys[i];
            const targetWrite = nonZeroColors[i % nonZeroColors.length];
            rules[s][0].write = targetWrite;
            rules[s][0].turn = i % 2 === 0 ? TURN.R : TURN.L;
            rules[s][0].nextState = stateKeys[(i + 1) % stateKeys.length];
        }
    }

    return rules;
}

function buildVisiblePresets() {
    const ecaPreset = (rule, { mapping, transforms = [], description, name }) => {
        const base = ecaRuleToBitString(rule);
        const bits = transforms.length ? applyEcaTransforms(base, transforms) : base;
        const baseRules = mapBitsToTurmiteRules(bits, mapping);
        const seed = fnv1a32(`${name}|eca:${rule}|${mapping}|${transforms.join('+')}`);
        const isThreeColor = mapping.includes('3c') || mapping.includes('3C');
        const isV2 = mapping.includes('_v2');
        const isRule110 = rule === 110;
        const isRule5 = rule === 5;
        const isRule90 = rule === 90;
        const isRule184 = rule === 184;

        const enhanced = enhancePresetRules(baseRules, seed, {
            targetStates: isRule110 ? 4 : 3,
            targetColors: isThreeColor ? 4 : (isV2 ? 4 : 3),
            mutationCount: isRule110 ? 26 : (isRule5 ? 24 : ((isRule90 || isRule184) ? 20 : 16))
        });
        return { description, rules: enhanced };
    };

    // Keep Langton's Ant as-is (special-cased in UI).
    const visible = {
        "Langton's Ant": {
            description: "The classic chaotic agent. 2 Colors, RL.",
            rules: {
                0: {
                    0: { write: 1, turn: TURN.R, nextState: 0 },
                    1: { write: 0, turn: TURN.L, nextState: 0 }
                }
            }
        },

        // Notable CA rules referenced in the included Cellular Automata rules PDF.
        "ECA 110 (Turing Complete) v1": ecaPreset(110, {
            mapping: 'eca8bit_to_turmite_v1',
            name: 'ECA 110 (Turing Complete) v1',
            description: "Rule 110 mapped to a 2-state/2-color turmite (v1)."
        }),
        "ECA 110 (Turing Complete) v2": ecaPreset(110, {
            mapping: 'eca8bit_to_turmite_v2',
            name: 'ECA 110 (Turing Complete) v2',
            description: "Rule 110 with a richer turn/state mapping (v2)."
        }),
        "ECA 110 (Mirror) v2": ecaPreset(110, {
            mapping: 'eca8bit_to_turmite_v2',
            transforms: ['mirror_lr'],
            name: 'ECA 110 (Mirror) v2',
            description: "Rule 110 mirrored (left/right) with v2 mapping."
        }),

        "ECA 184 (Traffic) v1": ecaPreset(184, {
            mapping: 'eca8bit_to_turmite_v1',
            name: 'ECA 184 (Traffic) v1',
            description: "Traffic flow Rule 184 mapped to a 2-state/2-color turmite (v1)."
        }),
        "ECA 184 (Traffic) 3-Color": ecaPreset(184, {
            mapping: 'eca_stream_to_turmite_2s3c_v1',
            name: 'ECA 184 (Traffic) 3-Color',
            description: "Traffic Rule 184 expanded into a 3-color, 2-state turmite."
        }),

        "ECA 90 (XOR Fractal) v1": ecaPreset(90, {
            mapping: 'eca8bit_to_turmite_v1',
            name: 'ECA 90 (XOR Fractal) v1',
            description: "Rule 90 (XOR / Sierpinski-like) mapped to a 2-state/2-color turmite."
        }),
        "ECA 90 (XOR Fractal) 3-Color": ecaPreset(90, {
            mapping: 'eca_stream_to_turmite_2s3c_v1',
            name: 'ECA 90 (XOR Fractal) 3-Color',
            description: "Rule 90 expanded into a 3-color, 2-state turmite."
        }),

        "ECA 160 (Both Neighbors) v1": ecaPreset(160, {
            mapping: 'eca8bit_to_turmite_v1',
            name: 'ECA 160 (Both Neighbors) v1',
            description: "Rule 160 mapped to a 2-state/2-color turmite."
        }),
        "ECA 5 (Both Neighbors 0) v1": ecaPreset(5, {
            mapping: 'eca8bit_to_turmite_v1',
            name: 'ECA 5 (Both Neighbors 0) v1',
            description: "Rule 5 mapped to a 2-state/2-color turmite."
        })
    };

    return visible;
}

const PRESETS = buildVisiblePresets();

function buildMutationSeedPool({ targetSize = 4096 } = {}) {
    const entries = [];

    const transformCombos = [
        [],
        ['mirror_lr'],
        ['invert_out'],
        ['mirror_lr', 'invert_out'],
        ['invert_in_out'],
        ['mirror_lr', 'invert_in_out'],
        ['invert_in_out', 'invert_out'],
        ['mirror_lr', 'invert_in_out', 'invert_out']
    ];

    const mappings = ['eca8bit_to_turmite_v1', 'eca8bit_to_turmite_v2', 'eca_stream_to_turmite_2s3c_v1'];

    for (let rule = 0; rule <= 255; rule++) {
        const baseBits = ecaRuleToBitString(rule);

        const uniqueVariants = [];
        const seenBits = new Set();
        for (const transforms of transformCombos) {
            const bits = applyEcaTransforms(baseBits, transforms);
            if (seenBits.has(bits)) continue;
            seenBits.add(bits);
            uniqueVariants.push({ bits, transforms });
        }

        for (const { bits, transforms } of uniqueVariants) {
            const classHint = classHintFromEcaBits(bits, rule);
            const family = rule === 184 ? 'traffic' : 'ECA';
            const transformsKey = transforms.length ? transforms.join('+') : 'base';

            for (const mapping of mappings) {
                const rules = mapBitsToTurmiteRules(bits, mapping);
                const id = `eca-${String(rule).padStart(3, '0')}__${transformsKey}__${mapping}`;
                const label = `ECA ${rule} → ${mapping} (${transformsKey})`;
                const mappingFamily = mapping.includes('3c') ? 'multicolor' : family;

                entries.push({
                    id,
                    label,
                    meta: {
                        family: mappingFamily,
                        ecaRule: rule,
                        radius: 1,
                        alphabet: [0, 1],
                        transforms: transforms.length ? [...transforms] : ['base'],
                        wolframClassHint: classHint,
                        mapping
                    },
                    rules
                });
            }
        }
    }

    // Deterministic top-up to reach a stable minimum size when symmetry dedupe shrinks the orbit.
    if (entries.length < targetSize) {
        const prng = mulberry32(0xC0FFEE);
        let i = 0;
        while (entries.length < targetSize) {
            const base = entries[i % entries.length];
            const derivedRules = cloneRules(base.rules);
            const s = prng() < 0.5 ? 0 : 1;
            const c = prng() < 0.5 ? 0 : 1;

            // Flip turn deterministically; keep nextState/write in-range.
            const r = derivedRules[s][c];
            if (r.turn === TURN.L) r.turn = TURN.R;
            else if (r.turn === TURN.R) r.turn = TURN.L;
            else if (r.turn === TURN.N) r.turn = TURN.U;
            else r.turn = TURN.N;

            entries.push({
                id: `${base.id}__derived_${String(i).padStart(4, '0')}`,
                label: `${base.label} (derived)`,
                meta: {
                    ...base.meta,
                    family: 'derived',
                    mapping: `${base.meta.mapping}__derived`
                },
                rules: derivedRules
            });
            i++;
        }
    }

    return entries;
}

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
                const actualRule = rule.default ? rule.default : rule;

                let mutationType;
                if (maxMutations === 1) {
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
            const stateOptions = [2, 3, 5, 7]; // Primes
            const colorOptions = [2, 3, 4, 5]; // Low complexity for clarity
            const numStates = stateOptions[Math.floor(Math.random() * stateOptions.length)];
            const numColors = colorOptions[Math.floor(Math.random() * colorOptions.length)];

            candidateRules = {};

            for (let s = 0; s < numStates; s++) {
                candidateRules[s] = {};
                for (let c = 0; c < numColors; c++) {
                    let nextState;
                    const flowRoll = Math.random();
                    if (flowRoll < 0.8) {
                        nextState = (s + 1) % numStates;
                    } else if (flowRoll < 0.9) {
                        nextState = s;
                    } else {
                        nextState = (s + 2) % numStates;
                    }

                    const write = (c + 1) % numColors;

                    let turn;
                    const parity = (s + c) % 2;
                    if (parity === 0) {
                        turn = TURN.R;
                    } else {
                        turn = TURN.L;
                    }

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
            const numStates = Math.floor(Math.random() * 3) + 2; // 2-4 states
            const numColors = Math.floor(Math.random() * 3) + 2; // 2-4 colors
            candidateRules = {};

            const moveOptions = [];
            for (let k = 0; k < 4; k++) { moveOptions.push(TURN.L); moveOptions.push(TURN.R); }
            moveOptions.push(TURN.N);
            moveOptions.push(TURN.U);

            for (let s = 0; s < numStates; s++) {
                candidateRules[s] = {};
                for (let c = 0; c < numColors; c++) {
                    const stateRoll = Math.random();
                    let nextState;
                    if (stateRoll < 0.70) {
                        nextState = (s + 1) % numStates;
                    } else if (stateRoll < 0.90) {
                        nextState = 0;
                    } else {
                        nextState = Math.floor(Math.random() * numStates);
                    }

                    const writeOffset = 1 + Math.floor(Math.random() * (numColors - 1));
                    const write = (c + writeOffset) % numColors;

                    const turn = moveOptions[Math.floor(Math.random() * moveOptions.length)];

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
export const MUTATION_SEED_POOL = buildMutationSeedPool({ targetSize: 8192 });
