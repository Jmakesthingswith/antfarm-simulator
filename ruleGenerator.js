/**
 * Rule Generation Strategies
 * Each returns a RuleSet object
 */

import { AntSimulation, TURN } from './simulation.js';
import { cloneStructured } from './utils.js';
import * as PresetsModule from './presets.js';

const cloneRules = (rules) => cloneStructured(rules);

const MUTATION_SEED_POOL = Array.isArray(PresetsModule.MUTATION_SEED_POOL)
    ? PresetsModule.MUTATION_SEED_POOL
    : [];

const DEFAULT_CHAOS_CONFIG = {
    sourceMix: {
        simpleMax: 0.28,
        poolMax: 0.85,
        simpleMixCaMax: 0.6,
        simpleMixSacredMax: 0.85
    },
    seedPool: {
        bucketTraffic: 1.1,
        bucketMulticolor: 1.0,
        bucketV2: 1.1,
        bucketV1: 1.0,
        bucketDerived: 0.6,
        class1: 0.5,
        class2: 1.0,
        class3: 1.3,
        class4: 1.6,
        familyTraffic: 1.1,
        familyDerived: 0.6
    },
    structure: {
        maxStates: 5,
        maxColors: 5,
        addStateChance: 0.35,
        addColorChance: 0.45,
        promoteNewColorWritesChance: 0.25,
        cloneTurnChangeChance: 0.25,
        cloneNextStateChance: 0.25,
        newStateReachChance: 0.15
    },
    minDimensions: {
        minStates: 2,
        minColors: 2,
        maxStates: 6,
        maxColors: 6,
        maxPasses: 3,
        promoteNewColorWritesChance: 0.45
    },
    boost: {
        intensity: 7,
        maxNoTurnRatio: 0.5,
        minWriteChangeRatio: 0.25,
        writeMutateChance: 0.45,
        turnMutateChance: 0.6,
        nextStateMutateChance: 0.3,
        maxPasses: 2,
        selfNextRatioThreshold: 0.8,
        minExternalTransitions: 1,
        minExternalTransitionsHigh: 2,
        stateFlowTurnChance: 0.6,
        stateFlowWriteChance: 0.4,
        includeNoTurnInBoost: false,
        stateFlowIncludeNoTurn: false
    },
    validation: {
        minStates: 1,
        minColors: 2,
        minTurnVariety: 2,
        minWriteVariety: 2,
        minWriteChangeRatio: 0.26,
        maxNoTurnRatio: 0.6,
        maxSelfNextRatio: 0.9,
        requireNonZeroWriteFromZero: true,
        rejectAbsorbing: true,
        minNonZeroWriteFromZeroStates: 2,
        antCount: 3,
        warmupSteps: 900,
        measureChunkSteps: 2400,
        longTailSteps: 10000,
        minChangedCellsBase: 16,
        minChangedCellsScale: 12,
        minChangedCellsCap: 320,
        minPaintedCellsBase: 50,
        minPaintedCellsScale: 34,
        minPaintedCellsCap: 850,
        minLateFactor: 0.55,
        minLateRatio: 0.25,
        minTailFactor: 0.5,
        minTailRatio: 0.2,
        minNonZeroColorsCap: 4
    },
    generators: {
        ca: {
            minCount: 2,
            turnBias: 0.45,
            nextStateBias: 0.75
        },
        sacred: {
            states: [2, 3, 5, 7],
            colors: [2, 3, 4],
            mutationRate: 0.03
        },
        wolfram: {
            maxRule: 256
        }
    },
    presetPath: {
        diversifyChance: 0.45,
        ensureMinChance: 0.7,
        mutations: 7,
        boostIntensity: 7
    },
    poolPath: {
        mutationsClass1: 10,
        mutationsClass2: 9,
        mutationsClass3: 8,
        mutationsClass4: 7,
        structureChanceDefault: 0.65,
        structureChanceHighClass: 0.6,
        structureChanceSmall: 0.85,
        addStateChanceLow: 0.45,
        addStateChanceHigh: 0.35,
        addColorChanceLow: 0.75,
        addColorChanceHigh: 0.7,
        promoteNewColorWritesChance: 0.45,
        doubleDiversifyChance: 0.25,
        ensureMinChance: 0.45,
        boostIntensity: 9
    },
    spawn: {
        clampMargin: 2,
        spacing: 5,
        ringRadius: 0.12,
        gridSpacing: 8,
        cornersInset: 0.28
    },
    weightedCount: {
        normalMax: 3,
        normalChance: 0.9,
        rareMin: 4,
        rareMaxExtra: 1
    },
    caRule: {
        mutationChance: 0.035,
        turnBias: 0.45,
        colorOffset: 1
    },
    mutation: {
        strictTurnChance: 0.6,
        nonStrictWeights: { turn: 1, state: 1, write: 1 }
    }
};

let chaosConfig = cloneStructured(DEFAULT_CHAOS_CONFIG);
let chaosEnabled = false;

function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function randRange(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(randRange(min, max + 1));
}

function weightedPick(weights) {
    const entries = Object.entries(weights);
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) return entries[0] ? entries[0][0] : null;
    let r = Math.random() * total;
    for (const [key, w] of entries) {
        r -= Math.max(0, w);
        if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
}

function randomizeChaosConfig() {
    const cfg = cloneStructured(DEFAULT_CHAOS_CONFIG);
    const bias = randRange(0.6, 2.8);

    cfg.sourceMix.simpleMax = clamp01(randRange(0.05, 0.4));
    cfg.sourceMix.poolMax = clamp01(randRange(0.7, 0.98));
    cfg.sourceMix.simpleMixCaMax = clamp01(randRange(0.3, 0.75));
    cfg.sourceMix.simpleMixSacredMax = clamp01(randRange(cfg.sourceMix.simpleMixCaMax + 0.05, 0.95));
    if (cfg.sourceMix.poolMax <= cfg.sourceMix.simpleMax) {
        cfg.sourceMix.poolMax = clamp01(cfg.sourceMix.simpleMax + 0.1);
    }

    cfg.seedPool.bucketTraffic = randRange(0.5, 2.2);
    cfg.seedPool.bucketMulticolor = randRange(0.5, 2.0);
    cfg.seedPool.bucketV2 = randRange(0.6, 1.8);
    cfg.seedPool.bucketV1 = randRange(0.5, 1.6);
    cfg.seedPool.bucketDerived = randRange(0.2, 1.0);
    cfg.seedPool.class1 = randRange(0.1, 0.7);
    cfg.seedPool.class2 = randRange(0.5, 1.6);
    cfg.seedPool.class3 = randRange(1.0, 2.6);
    cfg.seedPool.class4 = randRange(1.4, 3.0);
    cfg.seedPool.familyTraffic = randRange(0.6, 2.0);
    cfg.seedPool.familyDerived = randRange(0.2, 0.9);

    cfg.structure.maxStates = randInt(5, 11);
    cfg.structure.maxColors = randInt(5, 11);
    cfg.structure.addStateChance = clamp01(randRange(0.35, 0.95));
    cfg.structure.addColorChance = clamp01(randRange(0.35, 0.95));
    cfg.structure.promoteNewColorWritesChance = clamp01(randRange(0.35, 0.95));
    cfg.structure.cloneTurnChangeChance = clamp01(randRange(0.3, 0.9));
    cfg.structure.cloneNextStateChance = clamp01(randRange(0.3, 0.9));
    cfg.structure.newStateReachChance = clamp01(randRange(0.2, 0.7));

    cfg.minDimensions.minStates = randInt(2, 6);
    cfg.minDimensions.minColors = randInt(2, 6);
    cfg.minDimensions.maxStates = Math.max(cfg.minDimensions.minStates, randInt(5, 11));
    cfg.minDimensions.maxColors = Math.max(cfg.minDimensions.minColors, randInt(5, 11));
    cfg.minDimensions.maxPasses = randInt(3, 7);
    cfg.minDimensions.promoteNewColorWritesChance = clamp01(randRange(0.35, 0.95));

    cfg.boost.intensity = randInt(10, Math.round(26 * bias));
    cfg.boost.maxNoTurnRatio = clamp01(randRange(0.35, 0.9));
    cfg.boost.minWriteChangeRatio = clamp01(randRange(0.08, 0.32));
    cfg.boost.writeMutateChance = clamp01(randRange(0.45, 0.98));
    cfg.boost.turnMutateChance = clamp01(randRange(0.5, 0.98));
    cfg.boost.nextStateMutateChance = clamp01(randRange(0.35, 0.85));
    cfg.boost.maxPasses = randInt(3, 6);
    cfg.boost.selfNextRatioThreshold = clamp01(randRange(0.65, 0.95));
    cfg.boost.minExternalTransitions = randInt(1, 4);
    cfg.boost.minExternalTransitionsHigh = randInt(Math.max(2, cfg.boost.minExternalTransitions), 5);
    cfg.boost.stateFlowTurnChance = clamp01(randRange(0.45, 0.95));
    cfg.boost.stateFlowWriteChance = clamp01(randRange(0.35, 0.9));
    cfg.boost.includeNoTurnInBoost = Math.random() < 0.5;
    cfg.boost.stateFlowIncludeNoTurn = Math.random() < 0.7;

    cfg.validation.minWriteChangeRatio = clamp01(randRange(0.06, 0.28));
    cfg.validation.maxNoTurnRatio = clamp01(randRange(0.6, 0.92));
    cfg.validation.maxSelfNextRatio = clamp01(randRange(0.88, 0.98));
    cfg.validation.requireNonZeroWriteFromZero = Math.random() > 0.15;
    cfg.validation.rejectAbsorbing = Math.random() > 0.2;
    cfg.validation.minNonZeroWriteFromZeroStates = randInt(1, 3);
    cfg.validation.antCount = randInt(2, 7);
    cfg.validation.warmupSteps = randInt(300, 900);
    cfg.validation.measureChunkSteps = randInt(800, 3000);
    cfg.validation.longTailSteps = randInt(2500, 10000);
    cfg.validation.minChangedCellsBase = randInt(5, 18);
    cfg.validation.minChangedCellsScale = randInt(5, 18);
    cfg.validation.minChangedCellsCap = randInt(120, 420);
    cfg.validation.minPaintedCellsBase = randInt(15, 70);
    cfg.validation.minPaintedCellsScale = randInt(10, 40);
    cfg.validation.minPaintedCellsCap = randInt(220, 900);
    cfg.validation.minLateFactor = clamp01(randRange(0.25, 0.7));
    cfg.validation.minLateRatio = clamp01(randRange(0.12, 0.5));
    cfg.validation.minTailFactor = clamp01(randRange(0.25, 0.65));
    cfg.validation.minTailRatio = clamp01(randRange(0.08, 0.4));
    cfg.validation.minNonZeroColorsCap = randInt(2, 6);

    cfg.generators.ca.minCount = randInt(2, 5);
    cfg.generators.ca.turnBias = clamp01(randRange(0.25, 0.75));
    cfg.generators.ca.nextStateBias = clamp01(randRange(0.4, 0.9));
    cfg.generators.sacred.states = Math.random() < 0.5 ? [2, 3, 5, 7] : [2, 3, 4, 5, 6, 7];
    cfg.generators.sacred.colors = Math.random() < 0.5 ? [2, 3, 4] : [2, 3, 4, 5];
    cfg.generators.sacred.mutationRate = clamp01(randRange(0.03, 0.18));

    cfg.presetPath.diversifyChance = clamp01(randRange(0.45, 0.95));
    cfg.presetPath.ensureMinChance = clamp01(randRange(0.5, 0.98));
    cfg.presetPath.mutations = randInt(10, 26);
    cfg.presetPath.boostIntensity = randInt(12, 24);

    cfg.poolPath.mutationsClass1 = randInt(12, 28);
    cfg.poolPath.mutationsClass2 = randInt(10, 24);
    cfg.poolPath.mutationsClass3 = randInt(8, 22);
    cfg.poolPath.mutationsClass4 = randInt(7, 20);
    cfg.poolPath.structureChanceDefault = clamp01(randRange(0.55, 0.98));
    cfg.poolPath.structureChanceHighClass = clamp01(randRange(0.45, 0.95));
    cfg.poolPath.structureChanceSmall = clamp01(randRange(0.75, 0.99));
    cfg.poolPath.addStateChanceLow = clamp01(randRange(0.35, 0.9));
    cfg.poolPath.addStateChanceHigh = clamp01(randRange(0.3, 0.85));
    cfg.poolPath.addColorChanceLow = clamp01(randRange(0.55, 0.98));
    cfg.poolPath.addColorChanceHigh = clamp01(randRange(0.45, 0.95));
    cfg.poolPath.promoteNewColorWritesChance = clamp01(randRange(0.45, 0.95));
    cfg.poolPath.doubleDiversifyChance = clamp01(randRange(0.25, 0.7));
    cfg.poolPath.ensureMinChance = clamp01(randRange(0.45, 0.85));
    cfg.poolPath.boostIntensity = randInt(14, 28);

    cfg.spawn.clampMargin = randInt(1, 5);
    cfg.spawn.spacing = randInt(4, 12);
    cfg.spawn.ringRadius = randRange(0.06, 0.35);
    cfg.spawn.gridSpacing = randInt(6, 14);
    cfg.spawn.cornersInset = randRange(0.12, 0.45);

    cfg.weightedCount.normalMax = randInt(3, 7);
    cfg.weightedCount.normalChance = clamp01(randRange(0.5, 0.92));
    cfg.weightedCount.rareMin = randInt(4, 8);
    cfg.weightedCount.rareMaxExtra = randInt(1, 3);

    cfg.caRule.mutationChance = clamp01(randRange(0.03, 0.2));
    cfg.caRule.turnBias = clamp01(randRange(0.25, 0.75));
    cfg.caRule.colorOffset = randInt(1, 3);

    cfg.mutation.strictTurnChance = clamp01(randRange(0.3, 0.7));
    cfg.mutation.nonStrictWeights = {
        turn: randRange(0.4, 2.0),
        state: randRange(0.4, 2.0),
        write: randRange(0.4, 2.0)
    };

    chaosConfig = cfg;
    return cfg;
}

function resetChaosConfig() {
    chaosConfig = cloneStructured(DEFAULT_CHAOS_CONFIG);
}

function setChaosMode(enabled) {
    chaosEnabled = Boolean(enabled);
    if (!chaosEnabled) resetChaosConfig();
    if (chaosEnabled) randomizeChaosConfig();
}

function getChaosMode() {
    return chaosEnabled;
}

function getChaosConfig() {
    return chaosConfig;
}

/**
 * Computes state and color dimensions for a rule table.
 * @param {Object} rules - Rule table.
 * @returns {{stateKeys:number[], numStates:number, colors:number[], numColors:number}} Dimensions and keys.
 */
function countStatesAndColors(rules) {
    const stateKeys = Object.keys(rules).map(Number).filter(Number.isFinite);
    const numStates = stateKeys.length;
    const colors =
        stateKeys.length > 0 && rules[stateKeys[0]]
            ? Object.keys(rules[stateKeys[0]]).map(Number).filter(Number.isFinite)
            : [];
    return { stateKeys, numStates, colors, numColors: colors.length };
}

function computeDynamicsStats(rules) {
    const { stateKeys, colors, numStates, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) {
        return {
            numStates,
            numColors,
            totalRules: 0,
            writeChangeCount: 0,
            nonNoTurnCount: 0,
            nonZeroWriteFromZeroCount: 0,
            absorbingColors: []
        };
    }

    let totalRules = 0;
    let writeChangeCount = 0;
    let nonNoTurnCount = 0;
    let nonZeroWriteFromZeroCount = 0;
    let selfNextStateCount = 0;
    let selfWriteCount = 0;

    const absorbing = new Map();
    for (const c of colors) absorbing.set(c, true);

    for (const s of stateKeys) {
        for (const c of colors) {
            const r = rules[s][c];
            totalRules++;
            if (r.write !== c) writeChangeCount++;
            else selfWriteCount++;
            if (r.turn !== TURN.N) nonNoTurnCount++;
            if (c === 0 && r.write !== 0) nonZeroWriteFromZeroCount++;
            if (r.nextState === s) selfNextStateCount++;
            if (r.write !== c) absorbing.set(c, false);
        }
    }

    const absorbingColors = [];
    for (const [c, isAbsorbing] of absorbing.entries()) {
        if (isAbsorbing) absorbingColors.push(c);
    }

    return {
        numStates,
        numColors,
        totalRules,
        writeChangeCount,
        nonNoTurnCount,
        nonZeroWriteFromZeroCount,
        selfNextStateCount,
        selfWriteCount,
        absorbingColors
    };
}

function ensureStateFlow(baseRules, { perStateMinExternalTransitions = null } = {}) {
    const rules = cloneRules(baseRules);
    const { stateKeys, colors, numStates, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) return rules;
    if (stateKeys.length < 2) return rules;

    const cfg = chaosConfig;
    const minExternal = Number.isFinite(perStateMinExternalTransitions)
        ? perStateMinExternalTransitions
        : cfg.boost.minExternalTransitions;
    const turnsActive = cfg.boost.stateFlowIncludeNoTurn
        ? [TURN.L, TURN.R, TURN.U, TURN.N]
        : [TURN.L, TURN.R, TURN.U];
    for (const s of stateKeys) {
        let external = 0;
        for (const c of colors) {
            if (rules[s][c].nextState !== s) external++;
        }
        if (external >= minExternal) continue;

        const c = colors[Math.floor(Math.random() * colors.length)];
        const nextChoices = stateKeys.filter(x => x !== s);
        rules[s][c].nextState = nextChoices[Math.floor(Math.random() * nextChoices.length)];
        if (Math.random() < cfg.boost.stateFlowTurnChance) {
            rules[s][c].turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
        }
        if (Math.random() < cfg.boost.stateFlowWriteChance && colors.length > 1) {
            const writeChoices = colors.filter(x => x !== c);
            rules[s][c].write = writeChoices[Math.floor(Math.random() * writeChoices.length)];
        }
    }

    return rules;
}

function boostRuleActivity(baseRules, options = {}) {
    const cfg = chaosConfig;
    const intensity = Number.isFinite(options.intensity) ? options.intensity : cfg.boost.intensity;
    const maxNoTurnRatio = Number.isFinite(options.maxNoTurnRatio) ? options.maxNoTurnRatio : cfg.boost.maxNoTurnRatio;
    const minWriteChangeRatio = Number.isFinite(options.minWriteChangeRatio) ? options.minWriteChangeRatio : cfg.boost.minWriteChangeRatio;
    let rules = cloneRules(baseRules);
    const { stateKeys, colors, numStates, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) return rules;

    const turnsActive = cfg.boost.includeNoTurnInBoost
        ? [TURN.L, TURN.R, TURN.U, TURN.N]
        : [TURN.L, TURN.R, TURN.U];

    rules = ensureStateFlow(rules, { perStateMinExternalTransitions: cfg.boost.minExternalTransitions });

    // Ensure the blank-grid bootstrap path can paint non-zero.
    const nonZeroColors = colors.filter(c => c !== 0);
    if (nonZeroColors.length) {
        for (const s of stateKeys) {
            const r0 = rules[s][0];
            if (r0 && r0.write === 0) {
                r0.write = nonZeroColors[Math.floor(Math.random() * nonZeroColors.length)];
                r0.turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
            }
        }
    }

    // Break absorbing colors (colors that always rewrite themselves across all states).
    const statsBefore = computeDynamicsStats(rules);
    if (statsBefore.absorbingColors.length && colors.length > 1) {
        for (const c of statsBefore.absorbingColors) {
            const s = stateKeys[Math.floor(Math.random() * stateKeys.length)];
            const choices = colors.filter(x => x !== c);
            rules[s][c].write = choices[Math.floor(Math.random() * choices.length)];
            rules[s][c].turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
        }
    }

    // Push away from high no-turn ratios and low write-change ratios.
    let stats = computeDynamicsStats(rules);
    let guard = 0;
    while (guard < cfg.boost.maxPasses && stats.totalRules > 0) {
        const noTurnRatio = 1 - (stats.nonNoTurnCount / stats.totalRules);
        const writeChangeRatio = stats.writeChangeCount / stats.totalRules;
        if (noTurnRatio <= maxNoTurnRatio && writeChangeRatio >= minWriteChangeRatio) break;

        for (let i = 0; i < intensity; i++) {
            const s = stateKeys[Math.floor(Math.random() * stateKeys.length)];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const r = rules[s][c];

            if (Math.random() < cfg.boost.writeMutateChance) {
                const choices = colors.filter(x => x !== c);
                if (choices.length) r.write = choices[Math.floor(Math.random() * choices.length)];
            }
            if (Math.random() < cfg.boost.turnMutateChance) {
                r.turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
            }
            if (Math.random() < cfg.boost.nextStateMutateChance && stateKeys.length > 1) {
                const nextChoices = stateKeys.filter(x => x !== r.nextState);
                if (nextChoices.length) r.nextState = nextChoices[Math.floor(Math.random() * nextChoices.length)];
            }
        }

        stats = computeDynamicsStats(rules);
        guard++;
    }

    // Avoid tables where state transitions collapse into mostly self-loops.
    stats = computeDynamicsStats(rules);
    if (stats.totalRules > 0) {
        const selfNextRatio = stats.selfNextStateCount / stats.totalRules;
        if (selfNextRatio > cfg.boost.selfNextRatioThreshold) {
            rules = ensureStateFlow(rules, { perStateMinExternalTransitions: cfg.boost.minExternalTransitionsHigh });
        }
    }

    return rules;
}

/**
 * Extracts structural statistics from a rule table.
 * @param {Object} rules - Rule table.
 * @returns {null|{stateKeys:number[], colors:number[], maxColor:number, turnSet:Set<number>, writeSet:Set<number>, nextStateSet:Set<number>, invalid:boolean}} Analysis result.
 */
function analyzeRuleSet(rules) {
    const stateKeys = Object.keys(rules || {}).map(Number).filter(Number.isFinite);
    if (stateKeys.length === 0) return null;

    const colorSet = new Set();
    const turnSet = new Set();
    const writeSet = new Set();
    const nextStateSet = new Set();
    let invalid = false;

    for (const s of stateKeys) {
        const row = rules[s];
        if (!row || typeof row !== 'object') {
            invalid = true;
            continue;
        }
        for (const ck of Object.keys(row)) {
            const c = Number(ck);
            if (!Number.isFinite(c)) continue;
            colorSet.add(c);

            const r = row[ck];
            if (!r || typeof r !== 'object') {
                invalid = true;
                continue;
            }

            if (!Number.isFinite(r.write) || !Number.isFinite(r.turn) || !Number.isFinite(r.nextState)) {
                invalid = true;
                continue;
            }
            writeSet.add(r.write);
            turnSet.add(r.turn);
            nextStateSet.add(r.nextState);
        }
    }

    const colors = [...colorSet].sort((a, b) => a - b);
    const maxColor = colors.length ? colors[colors.length - 1] : -1;

    return {
        stateKeys: stateKeys.sort((a, b) => a - b),
        colors,
        maxColor,
        turnSet,
        writeSet,
        nextStateSet,
        invalid
    };
}

/**
 * Validates the rule table for basic correctness and non-degeneracy.
 * @param {Object} rules - Rule table.
 * @returns {boolean} True if the rule table is usable.
 */
function isValidRuleSetStructure(rules) {
    const info = analyzeRuleSet(rules);
    if (!info || info.invalid) return false;

    const { stateKeys, colors, turnSet, writeSet } = info;
    const cfg = chaosConfig;
    if (stateKeys.length < cfg.validation.minStates || colors.length < cfg.validation.minColors) return false;

    const allowedTurns = new Set([TURN.L, TURN.R, TURN.U, TURN.N]);
    for (const t of turnSet) {
        if (!allowedTurns.has(t)) return false;
    }

    // Ensure a complete (rectangular) transition table.
    for (const s of stateKeys) {
        const row = rules[s];
        for (const c of colors) {
            const r = row[c];
            if (!r) return false;
            if (!Number.isFinite(r.write) || !Number.isFinite(r.turn) || !Number.isFinite(r.nextState)) return false;
            if (!stateKeys.includes(r.nextState)) return false;
            if (!colors.includes(r.write)) return false;
        }
    }

    // Reject trivial tables with no meaningful variety.
    if (turnSet.size < cfg.validation.minTurnVariety) return false;
    if (writeSet.size < cfg.validation.minWriteVariety) return false;

    return true;
}

/**
 * Expands a rule table by adding states and/or colors.
 * @param {Object} baseRules - Base rule table.
 * @param {Object} [options] - Expansion options.
 * @param {number} [options.maxStates=6] - Maximum states to allow.
 * @param {number} [options.maxColors=6] - Maximum colors to allow.
 * @param {number} [options.addStateChance=0.45] - Probability of adding a state.
 * @param {number} [options.addColorChance=0.55] - Probability of adding a color.
 * @param {number} [options.promoteNewColorWritesChance=0.35] - Probability of redirecting writes to new colors.
 * @param {boolean} [options.forceAdd=false] - If true, forces at least one structural addition when possible.
 * @returns {Object} Expanded rule table.
 */
function diversifyStructure(baseRules, options = {}) {
    const cfg = chaosConfig;
    const maxStates = Number.isFinite(options.maxStates) ? options.maxStates : cfg.structure.maxStates;
    const maxColors = Number.isFinite(options.maxColors) ? options.maxColors : cfg.structure.maxColors;
    const addStateChance = Number.isFinite(options.addStateChance) ? options.addStateChance : cfg.structure.addStateChance;
    const addColorChance = Number.isFinite(options.addColorChance) ? options.addColorChance : cfg.structure.addColorChance;
    const promoteNewColorWritesChance = Number.isFinite(options.promoteNewColorWritesChance)
        ? options.promoteNewColorWritesChance
        : cfg.structure.promoteNewColorWritesChance;
    const forceAdd = Boolean(options.forceAdd);
    const rules = cloneRules(baseRules);
    const { stateKeys, numStates, colors, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) return rules;

    let addedSomething = false;

    // Prefer adding colors to expand the paint space.
    if (numColors < maxColors && (forceAdd || Math.random() < addColorChance)) {
        const newColor = Math.max(...colors) + 1;
        const nextStateChoices = stateKeys;
        const availableColorsAfter = [...colors, newColor];
        const turns = [TURN.L, TURN.R, TURN.U, TURN.N];

        for (const s of stateKeys) {
            rules[s][newColor] = {
                write: availableColorsAfter[Math.floor(Math.random() * availableColorsAfter.length)],
                turn: turns[Math.floor(Math.random() * turns.length)],
                nextState: nextStateChoices[Math.floor(Math.random() * nextStateChoices.length)]
            };
        }

        // Encourage the new color to be reachable via writes.
        for (const s of stateKeys) {
            for (const c of colors) {
                if (Math.random() < promoteNewColorWritesChance) {
                    rules[s][c].write = availableColorsAfter[Math.floor(Math.random() * availableColorsAfter.length)];
                }
            }
        }

        addedSomething = true;
    }

    // Add a state to expand internal dynamics.
    if (numStates < maxStates && (!addedSomething || forceAdd || Math.random() < addStateChance)) {
        const newState = Math.max(...stateKeys) + 1;
        const templateState = stateKeys[Math.floor(Math.random() * stateKeys.length)];
        rules[newState] = {};

        const turns = [TURN.L, TURN.R, TURN.U, TURN.N];
        const { colors: colorsNow } = countStatesAndColors(rules);

        for (const c of colorsNow) {
            const templateRule = rules[templateState]?.[c];
            if (templateRule) {
                rules[newState][c] = cloneRules(templateRule);
                if (Math.random() < cfg.structure.cloneTurnChangeChance) {
                    rules[newState][c].turn = turns[Math.floor(Math.random() * turns.length)];
                }
                if (Math.random() < cfg.structure.cloneNextStateChance) {
                    rules[newState][c].nextState = newState;
                }
            } else {
                rules[newState][c] = {
                    write: colorsNow[Math.floor(Math.random() * colorsNow.length)],
                    turn: turns[Math.floor(Math.random() * turns.length)],
                    nextState: templateState
                };
            }
        }

        // Ensure the new state is reachable.
        for (const s of stateKeys) {
            for (const c of colorsNow) {
                if (Math.random() < cfg.structure.newStateReachChance) rules[s][c].nextState = newState;
            }
        }

        addedSomething = true;
    }

    return addedSomething ? rules : rules;
}

function ensureMinDimensions(baseRules, options = {}) {
    const cfg = chaosConfig;
    const minStates = Number.isFinite(options.minStates) ? options.minStates : cfg.minDimensions.minStates;
    const minColors = Number.isFinite(options.minColors) ? options.minColors : cfg.minDimensions.minColors;
    const maxStates = Number.isFinite(options.maxStates) ? options.maxStates : cfg.minDimensions.maxStates;
    const maxColors = Number.isFinite(options.maxColors) ? options.maxColors : cfg.minDimensions.maxColors;
    const maxPasses = Number.isFinite(options.maxPasses) ? options.maxPasses : cfg.minDimensions.maxPasses;
    let rules = cloneRules(baseRules);
    for (let pass = 0; pass < maxPasses; pass++) {
        const { numStates, numColors } = countStatesAndColors(rules);
        if (numStates >= minStates && numColors >= minColors) break;
        rules = diversifyStructure(rules, {
            maxStates,
            maxColors,
            addStateChance: 1,
            addColorChance: 1,
            promoteNewColorWritesChance: cfg.minDimensions.promoteNewColorWritesChance,
            forceAdd: true
        });
    }
    return rules;
}

let _seedPoolCdf = null;
let _seedPoolTotalWeight = 0;
let _seedPoolBuckets = null;
let _seedPoolBucketCdf = null;
let _seedPoolBucketTotalWeight = 0;

function bucketKeyForSeed(entry) {
    const meta = entry && entry.meta ? entry.meta : null;
    const family = meta && typeof meta.family === 'string' ? meta.family : 'unknown';
    const mapping = meta && typeof meta.mapping === 'string' ? meta.mapping : 'unknown';
    return `${family}__${mapping}`;
}

function getBucketWeight(bucketKey, count) {
    // Balance by bucket so large buckets don't fully dominate.
    // Use sqrt(count) so each bucket gets representation without over-forcing tiny buckets.
    let w = Math.sqrt(Math.max(1, count));
    const cfg = chaosConfig.seedPool;

    if (bucketKey.includes('traffic__')) w *= cfg.bucketTraffic;
    if (bucketKey.includes('multicolor__')) w *= cfg.bucketMulticolor;
    if (bucketKey.includes('__eca8bit_to_turmite_v2')) w *= cfg.bucketV2;
    if (bucketKey.includes('__eca8bit_to_turmite_v1')) w *= cfg.bucketV1;
    if (bucketKey.includes('__derived')) w *= cfg.bucketDerived;

    return w;
}

function ensureSeedPoolBuckets() {
    if (_seedPoolBuckets) return;
    if (!Array.isArray(MUTATION_SEED_POOL) || MUTATION_SEED_POOL.length === 0) {
        _seedPoolBuckets = new Map();
        _seedPoolBucketCdf = new Float64Array(0);
        _seedPoolBucketTotalWeight = 0;
        return;
    }

    const buckets = new Map();
    for (let i = 0; i < MUTATION_SEED_POOL.length; i++) {
        const entry = MUTATION_SEED_POOL[i];
        const key = bucketKeyForSeed(entry);
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { key, indices: [], cdf: null, totalWeight: 0 };
            buckets.set(key, bucket);
        }
        bucket.indices.push(i);
    }

    // Build per-bucket CDFs (weighted by class/family hints) and bucket-level CDF.
    const bucketList = [...buckets.values()];
    const bucketCdf = new Float64Array(bucketList.length);
    let bucketTotal = 0;

    for (let b = 0; b < bucketList.length; b++) {
        const bucket = bucketList[b];
        const idxs = bucket.indices;
        const cdf = new Float64Array(idxs.length);
        let total = 0;
        for (let j = 0; j < idxs.length; j++) {
            total += getSeedPoolWeight(MUTATION_SEED_POOL[idxs[j]]);
            cdf[j] = total;
        }
        bucket.cdf = cdf;
        bucket.totalWeight = total;

        bucketTotal += getBucketWeight(bucket.key, idxs.length) * Math.max(1e-6, total);
        bucketCdf[b] = bucketTotal;
    }

    _seedPoolBuckets = bucketList;
    _seedPoolBucketCdf = bucketCdf;
    _seedPoolBucketTotalWeight = bucketTotal;
}

function getSeedPoolWeight(entry) {
    const meta = entry && entry.meta ? entry.meta : null;
    const classHint = meta && typeof meta.wolframClassHint === 'number' ? meta.wolframClassHint : null;
    const family = meta && typeof meta.family === 'string' ? meta.family : null;
    const cfg = chaosConfig.seedPool;

    let w = 1;
    if (classHint === 1) w *= cfg.class1;
    else if (classHint === 2) w *= cfg.class2;
    else if (classHint === 3) w *= cfg.class3;
    else if (classHint === 4) w *= cfg.class4;

    if (family === 'traffic') w *= cfg.familyTraffic;
    if (family === 'derived') w *= cfg.familyDerived;

    return w;
}

function ensureSeedPoolIndex() {
    if (_seedPoolCdf) return;
    if (!Array.isArray(MUTATION_SEED_POOL) || MUTATION_SEED_POOL.length === 0) {
        _seedPoolCdf = [];
        _seedPoolTotalWeight = 0;
        return;
    }

    _seedPoolCdf = new Float64Array(MUTATION_SEED_POOL.length);
    let total = 0;
    for (let i = 0; i < MUTATION_SEED_POOL.length; i++) {
        total += getSeedPoolWeight(MUTATION_SEED_POOL[i]);
        _seedPoolCdf[i] = total;
    }
    _seedPoolTotalWeight = total;
}

function pickSeedFromPool() {
    // Prefer bucketed sampling for diversity; fall back to global CDF if needed.
    ensureSeedPoolBuckets();
    if (_seedPoolBucketTotalWeight > 0 && _seedPoolBuckets && _seedPoolBuckets.length > 0) {
        const rBucket = Math.random() * _seedPoolBucketTotalWeight;
        let loB = 0;
        let hiB = _seedPoolBucketCdf.length - 1;
        while (loB < hiB) {
            const mid = (loB + hiB) >> 1;
            if (rBucket <= _seedPoolBucketCdf[mid]) hiB = mid;
            else loB = mid + 1;
        }

        const bucket = _seedPoolBuckets[loB];
        if (!bucket || bucket.totalWeight <= 0 || !bucket.cdf || bucket.cdf.length === 0) return null;

        const r = Math.random() * bucket.totalWeight;
        let lo = 0;
        let hi = bucket.cdf.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (r <= bucket.cdf[mid]) hi = mid;
            else lo = mid + 1;
        }

        return MUTATION_SEED_POOL[bucket.indices[lo]] || null;
    }

    ensureSeedPoolIndex();
    if (_seedPoolTotalWeight <= 0) return null;

    const r = Math.random() * _seedPoolTotalWeight;
    let lo = 0;
    let hi = _seedPoolCdf.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (r <= _seedPoolCdf[mid]) hi = mid;
        else lo = mid + 1;
    }
    return MUTATION_SEED_POOL[lo] || null;
}

const RuleGenerators = {
    setChaosMode(enabled) {
        setChaosMode(enabled);
        return getChaosMode();
    },
    getChaosMode() {
        return getChaosMode();
    },
    randomizeChaosConfig() {
        return randomizeChaosConfig();
    },
    getChaosConfig() {
        return getChaosConfig();
    },
    /**
     * Cellular Automata inspired - evolves rules from seed state
     */
    cellularAutomata(numStates = null, numColors = null) {
        const cfg = chaosConfig.generators.ca;
        const states = Math.max(2, numStates || getWeightedCount(cfg.minCount));
        const colors = Math.max(2, numColors || getWeightedCount(cfg.minCount));
        const rules = {};

        // Generate seed (State 0)
        rules[0] = {};
        for (let c = 0; c < colors; c++) {
            rules[0][c] = {
                write: (c + 1) % colors,
                turn: Math.random() > cfg.turnBias ? TURN.R : TURN.L,
                nextState: Math.random() > cfg.nextStateBias ? 1 : 0
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
        const cfg = chaosConfig.generators.sacred;
        const states = numStates || cfg.states[Math.floor(Math.random() * cfg.states.length)];
        const colors = numColors || cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
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
                if (Math.random() < cfg.mutationRate) {
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
        const cfg = chaosConfig.generators.wolfram;
        const num = ruleNumber || Math.floor(Math.random() * cfg.maxRule);
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
        const cfg = chaosConfig.mutation;

        for (let i = 0; i < mutations; i++) {
            const s = states[Math.floor(Math.random() * states.length)];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const rule = rules[s][c];

            let mutationType;
            if (strict) {
                // Only mutate turn or write, preserve state flow
                mutationType = Math.random() < cfg.strictTurnChance ? 'turn' : 'write';
            } else {
                mutationType = weightedPick(cfg.nonStrictWeights) || 'turn';
            }

            switch (mutationType) {
                case 'turn': {
                    let newTurn;
                    do {
                        newTurn = turns[Math.floor(Math.random() * turns.length)];
                    } while (newTurn === rule.turn);
                    rule.turn = newTurn;
                    break;
                }
                case 'state': {
                    rule.nextState = states[Math.floor(Math.random() * states.length)];
                    break;
                }
                case 'write': {
                    let newWrite;
                    do {
                        newWrite = colors[Math.floor(Math.random() * colors.length)];
                    } while (newWrite === rule.write);
                    rule.write = newWrite;
                    break;
                }
            }
        }

        return rules;
    },

    /**
     * Orchestrates the generation of symmetrical rules.
     * Replaces main.js generateSymmetricalRules
     */
    generateSymmetrical(presets) {
        return this.generateSymmetricalWithOrigin(presets).rules;
    },

    /**
     * Generates a ruleset and returns origin metadata for UI labeling.
     * @param {Object} presets - Visible presets map.
     * @returns {{rules:Object, origin:null|{kind:'pool', seedId:string, meta:Object}|{kind:'preset', presetName:string}}}
     */
    generateSymmetricalWithOrigin(presets) {
        if (chaosEnabled) randomizeChaosConfig();
        const cfg = chaosConfig;
        const strategy = Math.random();

        // Balanced sources so visible presets can propagate into Randomize via mutation without dominating.
        // 20% simple generators, 70% hidden CA seed pool, 10% visible preset mutation.
        if (strategy < cfg.sourceMix.simpleMax) {
            const r = Math.random();
            if (r < cfg.sourceMix.simpleMixCaMax) return { rules: this.cellularAutomata(), origin: null };
            if (r < cfg.sourceMix.simpleMixSacredMax) return { rules: this.sacredGeometry(), origin: null };
            return { rules: this.wolframStyle(), origin: null };
        }

        if (strategy < cfg.sourceMix.poolMax) {
            const seed = pickSeedFromPool();
            if (seed && seed.rules) {
                const classHint = seed.meta && typeof seed.meta.wolframClassHint === 'number'
                    ? seed.meta.wolframClassHint
                    : 2;
                // More mutation than presets/simple paths; higher-class seeds get slightly fewer to preserve structure.
                const mutations = classHint <= 1
                    ? cfg.poolPath.mutationsClass1
                    : (classHint === 2 ? cfg.poolPath.mutationsClass2 : (classHint === 3 ? cfg.poolPath.mutationsClass3 : cfg.poolPath.mutationsClass4));

                // Since the CA seed pool is mostly 2-state/2-color, frequently expand structure for diversity.
                let base = seed.rules;
                const { numStates: seedStates, numColors: seedColors } = countStatesAndColors(base);

                // If we’re starting from a 2x2 seed, almost always expand at least one dimension.
                const shouldForceDiversify = seedStates <= 2 && seedColors <= 2;
                const structureChance = shouldForceDiversify
                    ? cfg.poolPath.structureChanceSmall
                    : (classHint >= 3 ? cfg.poolPath.structureChanceHighClass : cfg.poolPath.structureChanceDefault);

                if (Math.random() < structureChance) {
                    base = diversifyStructure(base, {
                        maxStates: cfg.minDimensions.maxStates,
                        maxColors: cfg.minDimensions.maxColors,
                        addStateChance: classHint >= 3 ? cfg.poolPath.addStateChanceHigh : cfg.poolPath.addStateChanceLow,
                        addColorChance: classHint >= 3 ? cfg.poolPath.addColorChanceHigh : cfg.poolPath.addColorChanceLow,
                        promoteNewColorWritesChance: cfg.poolPath.promoteNewColorWritesChance,
                        forceAdd: shouldForceDiversify
                    });

                    // Occasionally expand twice to get beyond 3 colors / 3 states.
                    if (shouldForceDiversify && Math.random() < cfg.poolPath.doubleDiversifyChance) {
                        base = diversifyStructure(base, {
                            maxStates: cfg.minDimensions.maxStates,
                            maxColors: cfg.minDimensions.maxColors,
                            addStateChance: cfg.structure.addStateChance,
                            addColorChance: cfg.structure.addColorChance,
                            promoteNewColorWritesChance: cfg.structure.promoteNewColorWritesChance,
                            forceAdd: false
                        });
                    }
                }

                if (shouldForceDiversify) {
                    base = ensureMinDimensions(base, {
                        minStates: cfg.minDimensions.minStates,
                        minColors: cfg.minDimensions.minColors,
                        maxStates: cfg.minDimensions.maxStates,
                        maxColors: cfg.minDimensions.maxColors
                    });
                } else if (Math.random() < cfg.poolPath.ensureMinChance) {
                    base = ensureMinDimensions(base, {
                        minStates: cfg.minDimensions.minStates,
                        minColors: cfg.minDimensions.minColors,
                        maxStates: cfg.minDimensions.maxStates,
                        maxColors: cfg.minDimensions.maxColors,
                        maxPasses: Math.max(2, cfg.minDimensions.maxPasses - 2)
                    });
                }

                const mutated = this.mutate(base, mutations, false);
                const boosted = boostRuleActivity(mutated, { intensity: cfg.poolPath.boostIntensity });
                return {
                    rules: boosted,
                    origin: { kind: 'pool', seedId: seed.id, meta: seed.meta || {} }
                };
            }
            // Fallback if pool isn't available for some reason.
            return { rules: this.wolframStyle(), origin: null };
        }

        // Mutate a random preset (recognizable baseline).
        const presetNames = Object.keys(presets).filter(name => name !== "Langton's Ant");
        if (presetNames.length === 0) return { rules: this.wolframStyle(), origin: null };
        const presetName = presetNames[Math.floor(Math.random() * presetNames.length)];
        const randomPreset = presets[presetName];
        let base = randomPreset.rules;

        // Often expand structure a bit so preset mutations don't collapse to tiny tables.
        if (Math.random() < cfg.presetPath.diversifyChance) {
            base = diversifyStructure(base, {
                maxStates: cfg.minDimensions.maxStates,
                maxColors: cfg.minDimensions.maxColors,
                addStateChance: cfg.structure.addStateChance,
                addColorChance: cfg.structure.addColorChance,
                promoteNewColorWritesChance: cfg.structure.promoteNewColorWritesChance,
                forceAdd: false
            });
        }

        if (Math.random() < cfg.presetPath.ensureMinChance) {
            base = ensureMinDimensions(base, {
                minStates: cfg.minDimensions.minStates,
                minColors: cfg.minDimensions.minColors,
                maxStates: cfg.minDimensions.maxStates,
                maxColors: cfg.minDimensions.maxColors,
                maxPasses: Math.max(2, cfg.minDimensions.maxPasses - 2)
            });
        }

        const mutations = cfg.presetPath.mutations;
        const mutated = this.mutate(base, mutations, false);
        const boosted = boostRuleActivity(mutated, { intensity: cfg.presetPath.boostIntensity });
        return { rules: boosted, origin: { kind: 'preset', presetName } };
    },

    /**
     * Validates that the rules produce interesting behavior.
     * Replaces main.js validateRules
     */

    // Pass data not infrastructure, if module creates something, it should import it itself.
    // Dependency injection is for pluggable components, not hard dependencies.!!!! 
    validate(rules, strategy, simOrWidth, widthOrHeight, maybeHeight) {
    
    let SimulationClass = null;
    let width = null;
    let height = null;

    if (!isValidRuleSetStructure(rules)) return false;
    const dynamics = computeDynamicsStats(rules);
    const cfg = chaosConfig.validation;
    if (dynamics.totalRules > 0) {
        if (cfg.requireNonZeroWriteFromZero && dynamics.nonZeroWriteFromZeroCount === 0) return false;
        if (cfg.rejectAbsorbing && dynamics.absorbingColors.length > 0) return false;

        const writeChangeRatio = dynamics.writeChangeCount / dynamics.totalRules;
        const noTurnRatio = 1 - (dynamics.nonNoTurnCount / dynamics.totalRules);
        const selfNextRatio = dynamics.selfNextStateCount / dynamics.totalRules;
        if (writeChangeRatio < cfg.minWriteChangeRatio) return false;
        if (noTurnRatio > cfg.maxNoTurnRatio) return false;
        if (selfNextRatio > cfg.maxSelfNextRatio) return false;
        if (dynamics.nonZeroWriteFromZeroCount < Math.min(cfg.minNonZeroWriteFromZeroStates, dynamics.numStates)) return false;
    }

    if (typeof simOrWidth === 'number') {
        // Signature (rules, strategy, width, height)
        width = simOrWidth;
        height = widthOrHeight;
        
        if (typeof AntSimulation !== 'function') {
            throw new Error('AntSimulation class not available in validate()');
        }
        SimulationClass = AntSimulation;
    } else {
        // Signature (rules, strategy, sim, width, height)
        const sim = simOrWidth;
        width = widthOrHeight;
        height = maybeHeight;
        SimulationClass = sim && typeof sim.constructor === 'function' ? sim.constructor : null;
        if (!SimulationClass) {
            throw new Error('Simulation instance not provided (or has no constructor) in validate()');
        }
    }

    const testSim = new SimulationClass(width, height);
    testSim.setRules(rules);

    // Turn off any snapshot/history overhead if the sim supports it.
    if ('enableHistory' in testSim) testSim.enableHistory = false;
    if (Array.isArray(testSim.history)) testSim.history.length = 0;
    if (typeof testSim.dirtyCells?.clear === 'function') testSim.dirtyCells.clear();

    // Ensure NO default ant is present (some sims spawn one during reset/constructor).
    if (typeof testSim.reset === 'function') testSim.reset();
    if (typeof testSim.clearAnts === 'function') testSim.clearAnts();
    else testSim.ants = [];

    // Ensure a clean grid.
    if (testSim.grid?.fill) testSim.grid.fill(0);
    if (testSim.orientations?.fill) testSim.orientations.fill(0);
    testSim.stepCount = 0;

    // Spawn validation ants (keep low to avoid "many ants hide stasis" false passes).
    const antCount = cfg.antCount;
    for (let i = 0; i < antCount; i++) {
        const geometry = this.getSpawnGeometry(strategy, i, antCount, width, height);
        const facing = Math.floor(Math.random() * 4);
        testSim.addAnt(geometry.x, geometry.y, facing);
    }

    // Warm up, then measure sustained grid activity across two windows to reject early-but-short-lived patterns.
    const warmupSteps = cfg.warmupSteps;
    const measureChunkSteps = cfg.measureChunkSteps;
    const longTailSteps = cfg.longTailSteps;

    testSim.update(warmupSteps);

    const gridA = testSim.grid.slice();

    testSim.update(measureChunkSteps);

    let changedCells = 0;
    for (let i = 0; i < testSim.grid.length; i++) {
        if (testSim.grid[i] !== gridA[i]) changedCells++;
    }

    const gridB = testSim.grid.slice();
    testSim.update(measureChunkSteps);

    let changedCellsLate = 0;
    for (let i = 0; i < testSim.grid.length; i++) {
        if (testSim.grid[i] !== gridB[i]) changedCellsLate++;
    }

    let paintedCells = 0;
    const uniqueNonZeroColors = new Set();
    for (let i = 0; i < testSim.grid.length; i++) {
        const v = testSim.grid[i];
        if (v !== 0) {
            paintedCells++;
            uniqueNonZeroColors.add(v);
        }
    }

    const colorCount = Object.keys(rules[0] || {}).length;
    const minNonZeroColors = Math.min(cfg.minNonZeroColorsCap, Math.max(1, Math.floor((colorCount - 1) / 2)));

    const minChangedCells = Math.max(cfg.minChangedCellsBase, Math.min(cfg.minChangedCellsCap, colorCount * cfg.minChangedCellsScale));
    const minPaintedCells = Math.max(cfg.minPaintedCellsBase, Math.min(cfg.minPaintedCellsCap, colorCount * cfg.minPaintedCellsScale));
    const minLateChangedCells = Math.max(10, Math.floor(minChangedCells * cfg.minLateFactor));

    if (changedCells < minChangedCells) return false;
    if (changedCellsLate < minLateChangedCells) return false;
    if (changedCellsLate < changedCells * cfg.minLateRatio) return false;
    if (paintedCells < minPaintedCells) return false;
    if (uniqueNonZeroColors.size < minNonZeroColors) return false;

    const gridC = testSim.grid.slice();
    testSim.update(longTailSteps);

    let changedTail = 0;
    for (let i = 0; i < testSim.grid.length; i++) {
        if (testSim.grid[i] !== gridC[i]) changedTail++;
    }

    if (changedTail < Math.max(10, Math.floor(minChangedCells * cfg.minTailFactor))) return false;
    if (changedTail < changedCellsLate * cfg.minTailRatio) return false;

    return true;
},




    /**
     * Geometric Spawning Logic
     */
    getSpawnGeometry(mode, index, totalCount, width, height) {
        const cfg = chaosConfig.spawn;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Helper to keep points on screen
        const clampX = (x) => Math.max(cfg.clampMargin, Math.min(width - (cfg.clampMargin + 1), Math.floor(x)));
        const clampY = (y) => Math.max(cfg.clampMargin, Math.min(height - (cfg.clampMargin + 1), Math.floor(y)));

        switch (mode) {
            case 'center': {
                return { x: centerX, y: centerY };
            }
            case 'line': {
                const spacing = cfg.spacing;
                const offset = index - Math.floor(totalCount / 2);
                return { x: clampX(centerX + offset * spacing), y: centerY };
            }
            case 'vertical': {
                const spacing = cfg.spacing;
                const offset = index - Math.floor(totalCount / 2);
                return { x: centerX, y: clampY(centerY + offset * spacing) };
            }

            case 'cross': {
                const spacing = cfg.spacing;
                const leg = index % 4;
                const dist = Math.floor(index / 4) + 1;

                switch (leg) {
                    case 0: return { x: centerX, y: clampY(centerY - dist * spacing) }; // Up
                    case 1: return { x: clampX(centerX - dist * spacing), y: centerY }; // Left
                    case 2: return { x: centerX, y: clampY(centerY + dist * spacing) }; // Down
                    default: return { x: clampX(centerX + dist * spacing), y: centerY }; // Right
                }
            }

            case 'diamond': {
                const spacing = cfg.spacing;
                const ring = Math.floor(index / 4) + 1;
                const pos = index % 4;
                
                const dx = pos === 1 || pos === 2 ? ring : -ring;
                const dy = pos >= 2 ? ring : -ring;

                return { 
                    x: clampX(centerX + dx * spacing), 
                    y: clampY(centerY + dy * spacing) 
                };
            }
        

            case 'ring': {
                const radius = Math.min(width, height) * cfg.ringRadius;
                const angle = (index / totalCount) * 2 * Math.PI;
            
                return { 
                    x: clampX(centerX + Math.cos(angle) * radius), 
                    y: clampY(centerY + Math.sin(angle) * radius),
                    angle
                };
            }

            case 'grid3': {
                const spacing = cfg.gridSpacing;
                const col = index % 3;
                const row = Math.floor(index / 3) % 3;

                return { 
                    x: clampX(centerX + (col - 1) * spacing), 
                    y: clampY(centerY + (row - 1) * spacing) 
                };
            }

            case 'diagonal': {
                const spacing = cfg.spacing;
                const offset = index - Math.floor(totalCount / 2);

                return { 
                    x: clampX(centerX + offset * spacing), 
                    y: clampY(centerY + offset * spacing) 
                };
            }
                
            case 'corners': {
                const insetX = Math.floor(width * cfg.cornersInset);
                const insetY = Math.floor(height * cfg.cornersInset);

                const corners = [
                    { x: insetX, y: insetY }, // Top-left
                    { x: width - insetX, y: insetY }, // Top-right
                    { x: width - insetX, y: height - insetY }, // Bottom-right
                    { x: insetX, y: height - insetY },
                ];
            
                const c = corners[index % 4];
                return { x: clampX(c.x), y: clampY(c.y) };
            }

            default:
                return { x: centerX, y: centerY };
        }
    }
};

        

// Helper functions
function getWeightedCount(min = 2) {
    const r = Math.random();
    const cfg = chaosConfig.weightedCount;
    const normalMax = cfg.normalMax;
    const normalMin = Math.min(min, normalMax);
    
    if (r < cfg.normalChance) 
        return Math.floor(Math.random() * (normalMax - normalMin + 1)) + normalMin;
    {     
    
    const rareMin = Math.max(cfg.rareMin, min);
    const rareMax = rareMin + cfg.rareMaxExtra;

    return Math.floor(Math.random() * (rareMax - rareMin +1)) + rareMin;    
    }
}

function applyCARule(left, center, right, numColors, numStates) {
    // 5% mutation chance
    const cfg = chaosConfig.caRule;
    if (Math.random() < cfg.mutationChance) {
        return {
            write: Math.floor(Math.random() * numColors),
            turn: Math.random() > cfg.turnBias ? TURN.R : TURN.L,
            nextState: Math.floor(Math.random() * numStates)
        };
    }

    // XOR-like turn evolution
    const turnSum = Math.abs(left.turn + center.turn + right.turn);
    const turns = [TURN.N, TURN.R, TURN.U, TURN.L];
    const newTurn = turns[turnSum % 4];

    // Average color with offset
    const colorSum = left.write + center.write + right.write;
    const newWrite = (colorSum + cfg.colorOffset) % numColors;

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
