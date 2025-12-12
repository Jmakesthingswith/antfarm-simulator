/**
 * truchetLab.js
 *
 * Experimental rule generator focused on Truchet / half-square patterns.
 * Produces hidden presets and mutations that lean into diagonal flows,
 * alternating parities, and long-range constraints suited for triangle tiles.
 */

import { TURN } from './simulation.js';
import { cloneStructured } from './utils.js';

const MUTATION_PROBABILITY = 0.35; // Chance to mutate the previous design instead of generating a fresh one

const TURN_SET = [TURN.L, TURN.R, TURN.N, TURN.U];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const buildRuleSet = (states, colors, resolver) => {
    const rules = {};
    for (let s = 0; s < states; s++) {
        rules[s] = {};
        for (let c = 0; c < colors; c++) {
            rules[s][c] = resolver({ state: s, color: c, states, colors });
        }
    }
    return rules;
};

const modColor = (color, colors) => ((color % colors) + colors) % colors;

const createDiodeLattice = () => {
    const states = randInt(3, 4);
    const colors = randInt(4, 7);
    const bias = Math.random() < 0.5 ? TURN.R : TURN.L;
    const slipTurn = Math.random() < 0.5 ? TURN.N : TURN.U;

    const rules = buildRuleSet(states, colors, ({ state, color }) => {
        const parity = (state + color) % 2;
        const turn = parity === 0 ? bias : (Math.random() < 0.25 ? slipTurn : -bias);
        const write = modColor(color + (parity === 0 ? 1 : 2), colors);
        const nextState = (state + (parity === 0 ? 1 : 2)) % states;
        return { write, turn, nextState };
    });

    return { label: 'Diode Lattice', rules };
};

const createPhaseMoiré = () => {
    const states = randInt(2, 4);
    const colors = randInt(3, 6);
    const slant = Math.random() < 0.5 ? TURN.R : TURN.L;
    const drift = randInt(1, 2);

    const rules = buildRuleSet(states, colors, ({ state, color }) => {
        const mirror = (color % 3 === 0) ? TURN.U : -slant;
        const turn = (state % 2 === 0) ? slant : mirror;
        const write = modColor(color + drift + state, colors);
        const nextState = (state + (color % 2 === 0 ? 1 : 2)) % states;
        return { write, turn, nextState };
    });

    return { label: 'Phase Moiré', rules };
};

const createCornerPulse = () => {
    const states = randInt(3, 5);
    const colors = randInt(4, 6);
    const vortexState = randInt(0, states - 1);
    const gateColor = randInt(1, colors - 1);

    const rules = buildRuleSet(states, colors, ({ state, color }) => {
        const isVortex = state === vortexState;
        const clockwise = (state + color) % 3 === 0;
        const turn = isVortex ? TURN.U : (clockwise ? TURN.R : TURN.L);
        const write = isVortex ? modColor(color + 2, colors) : modColor(color + 1, colors);
        const nextState = isVortex
            ? (color === gateColor ? (state + 2) % states : (state + 1) % states)
            : (state + (clockwise ? 1 : 2)) % states;
        return { write, turn, nextState };
    });

    return { label: 'Corner Pulse', rules };
};

const createGlideReflection = () => {
    const states = randInt(2, 3);
    const colors = randInt(5, 7);
    const glideStride = randInt(2, 3);

    const rules = buildRuleSet(states, colors, ({ state, color }) => {
        const glidePhase = (color + state) % glideStride;
        const turn = glidePhase === 0 ? TURN.N : (glidePhase === 1 ? TURN.R : TURN.L);
        const write = modColor(color + (glidePhase === 0 ? 2 : 1), colors);
        const nextState = (state + glidePhase + 1) % states;
        return { write, turn, nextState };
    });

    return { label: 'Glide Reflection', rules };
};

const HIDDEN_FACTORIES = [
    createDiodeLattice,
    createPhaseMoiré,
    createCornerPulse,
    createGlideReflection
];

const randomTurn = (avoidTurn = null) => {
    const pool = TURN_SET.filter(t => t !== avoidTurn);
    return pick(pool);
};

const maybeAddColor = (rules) => {
    if (Math.random() > 0.15) return rules;
    const states = Object.keys(rules).map(Number);
    const currentColors = Object.keys(rules[states[0]]).map(Number);
    const newColor = Math.max(...currentColors) + 1;
    const donorColor = pick(currentColors);
    states.forEach((s) => {
        const template = cloneStructured(rules[s][donorColor]);
        const mutated = {
            ...template,
            write: randInt(0, newColor),
            turn: randomTurn(template.turn),
            nextState: pick(states)
        };
        rules[s][newColor] = mutated;
    });
    return rules;
};

const mutateRules = (baseRules, intensity = 0.35) => {
    const rules = cloneStructured(baseRules);
    const states = Object.keys(rules).map(Number);
    const colors = Object.keys(rules[states[0]]).map(Number);
    const mutationCount = Math.max(1, Math.round(states.length * colors.length * intensity));

    for (let i = 0; i < mutationCount; i++) {
        const s = pick(states);
        const c = pick(colors);
        const entry = rules[s][c];
        const roll = Math.random();

        if (roll < 0.45) {
            entry.turn = randomTurn(entry.turn);
        } else if (roll < 0.75) {
            let newWrite = entry.write;
            while (newWrite === entry.write) {
                newWrite = randInt(0, colors.length - 1);
            }
            entry.write = newWrite;
        } else {
            let newState = entry.nextState;
            while (newState === entry.nextState) {
                newState = randInt(0, states.length - 1);
            }
            entry.nextState = newState;
        }
    }

    return maybeAddColor(rules);
};

const nextTruchetDesign = (previousDesign = null) => {
    const shouldMutate = previousDesign && Math.random() < MUTATION_PROBABILITY;

    if (shouldMutate) {
        const baseRules = previousDesign.rules || previousDesign;
        return {
            label: (previousDesign.label || 'Mutated Truchet') + '*',
            mutated: true,
            rules: mutateRules(baseRules, 0.2 + Math.random() * 0.35)
        };
    }

    const factory = pick(HIDDEN_FACTORIES);
    return { ...factory(), mutated: false };
};

export default {
    nextTruchetDesign,
    mutateRules
};
