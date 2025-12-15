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

function ensureStateFlow(baseRules, { perStateMinExternalTransitions = 1 } = {}) {
    const rules = cloneRules(baseRules);
    const { stateKeys, colors, numStates, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) return rules;
    if (stateKeys.length < 2) return rules;

    const turnsActive = [TURN.L, TURN.R, TURN.U];
    for (const s of stateKeys) {
        let external = 0;
        for (const c of colors) {
            if (rules[s][c].nextState !== s) external++;
        }
        if (external >= perStateMinExternalTransitions) continue;

        const c = colors[Math.floor(Math.random() * colors.length)];
        const nextChoices = stateKeys.filter(x => x !== s);
        rules[s][c].nextState = nextChoices[Math.floor(Math.random() * nextChoices.length)];
        if (Math.random() < 0.75) rules[s][c].turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
        if (Math.random() < 0.5 && colors.length > 1) {
            const writeChoices = colors.filter(x => x !== c);
            rules[s][c].write = writeChoices[Math.floor(Math.random() * writeChoices.length)];
        }
    }

    return rules;
}

function boostRuleActivity(baseRules, {
    intensity = 10,
    maxNoTurnRatio = 0.55,
    minWriteChangeRatio = 0.22
} = {}) {
    let rules = cloneRules(baseRules);
    const { stateKeys, colors, numStates, numColors } = countStatesAndColors(rules);
    if (numStates === 0 || numColors === 0) return rules;

    const turnsActive = [TURN.L, TURN.R, TURN.U];

    rules = ensureStateFlow(rules, { perStateMinExternalTransitions: 1 });

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
    while (guard < 3 && stats.totalRules > 0) {
        const noTurnRatio = 1 - (stats.nonNoTurnCount / stats.totalRules);
        const writeChangeRatio = stats.writeChangeCount / stats.totalRules;
        if (noTurnRatio <= maxNoTurnRatio && writeChangeRatio >= minWriteChangeRatio) break;

        for (let i = 0; i < intensity; i++) {
            const s = stateKeys[Math.floor(Math.random() * stateKeys.length)];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const r = rules[s][c];

            if (Math.random() < 0.6) {
                const choices = colors.filter(x => x !== c);
                if (choices.length) r.write = choices[Math.floor(Math.random() * choices.length)];
            }
            if (Math.random() < 0.75) {
                r.turn = turnsActive[Math.floor(Math.random() * turnsActive.length)];
            }
            if (Math.random() < 0.4 && stateKeys.length > 1) {
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
        if (selfNextRatio > 0.85) {
            rules = ensureStateFlow(rules, { perStateMinExternalTransitions: 2 });
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
    if (stateKeys.length < 1 || colors.length < 2) return false;

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
    if (turnSet.size < 2) return false;
    if (writeSet.size < 2) return false;

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
function diversifyStructure(baseRules, {
    maxStates = 6,
    maxColors = 6,
    addStateChance = 0.45,
    addColorChance = 0.55,
    promoteNewColorWritesChance = 0.35,
    forceAdd = false
} = {}) {
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
                if (Math.random() < 0.35) rules[newState][c].turn = turns[Math.floor(Math.random() * turns.length)];
                if (Math.random() < 0.35) rules[newState][c].nextState = newState;
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
                if (Math.random() < 0.2) rules[s][c].nextState = newState;
            }
        }

        addedSomething = true;
    }

    return addedSomething ? rules : rules;
}

function ensureMinDimensions(baseRules, {
    minStates = 3,
    minColors = 3,
    maxStates = 7,
    maxColors = 7,
    maxPasses = 4
} = {}) {
    let rules = cloneRules(baseRules);
    for (let pass = 0; pass < maxPasses; pass++) {
        const { numStates, numColors } = countStatesAndColors(rules);
        if (numStates >= minStates && numColors >= minColors) break;
        rules = diversifyStructure(rules, {
            maxStates,
            maxColors,
            addStateChance: 1,
            addColorChance: 1,
            promoteNewColorWritesChance: 0.6,
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

    if (bucketKey.includes('traffic__')) w *= 1.25;
    if (bucketKey.includes('multicolor__')) w *= 1.15;
    if (bucketKey.includes('__eca8bit_to_turmite_v2')) w *= 1.1;
    if (bucketKey.includes('__eca8bit_to_turmite_v1')) w *= 1.0;
    if (bucketKey.includes('__derived')) w *= 0.5;

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

    let w = 1;
    if (classHint === 1) w *= 0.35;
    else if (classHint === 2) w *= 1.0;
    else if (classHint === 3) w *= 1.6;
    else if (classHint === 4) w *= 2.0;

    if (family === 'traffic') w *= 1.25;
    if (family === 'derived') w *= 0.5;

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
    /**
     * Cellular Automata inspired - evolves rules from seed state
     */
    cellularAutomata(numStates = null, numColors = null) {
        const states = Math.max(2, numStates || getWeightedCount(2));
        const colors = Math.max(2, numColors || getWeightedCount(2));
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
        const strategy = Math.random();

        // Balanced sources so visible presets can propagate into Randomize via mutation without dominating.
        // 20% simple generators, 70% hidden CA seed pool, 10% visible preset mutation.
        if (strategy < 0.20) {
            const r = Math.random();
            if (r < 0.5) return { rules: this.cellularAutomata(), origin: null };
            if (r < 0.8) return { rules: this.sacredGeometry(), origin: null };
            return { rules: this.wolframStyle(), origin: null };
        }

        if (strategy < 0.90) {
            const seed = pickSeedFromPool();
            if (seed && seed.rules) {
                const classHint = seed.meta && typeof seed.meta.wolframClassHint === 'number'
                    ? seed.meta.wolframClassHint
                    : 2;
                // More mutation than presets/simple paths; higher-class seeds get slightly fewer to preserve structure.
                const mutations = classHint <= 1 ? 14 : (classHint === 2 ? 12 : (classHint === 3 ? 11 : 10));

                // Since the CA seed pool is mostly 2-state/2-color, frequently expand structure for diversity.
                let base = seed.rules;
                const { numStates: seedStates, numColors: seedColors } = countStatesAndColors(base);

                // If we’re starting from a 2x2 seed, almost always expand at least one dimension.
                const shouldForceDiversify = seedStates <= 2 && seedColors <= 2;
                const structureChance = shouldForceDiversify ? 0.92 : (classHint >= 3 ? 0.7 : 0.8);

                if (Math.random() < structureChance) {
                    base = diversifyStructure(base, {
                        maxStates: 7,
                        maxColors: 7,
                        addStateChance: classHint >= 3 ? 0.45 : 0.55,
                        addColorChance: classHint >= 3 ? 0.8 : 0.9,
                        promoteNewColorWritesChance: 0.55,
                        forceAdd: shouldForceDiversify
                    });

                    // Occasionally expand twice to get beyond 3 colors / 3 states.
                    if (shouldForceDiversify && Math.random() < 0.35) {
                        base = diversifyStructure(base, {
                            maxStates: 7,
                            maxColors: 7,
                            addStateChance: 0.35,
                            addColorChance: 0.75,
                            promoteNewColorWritesChance: 0.35,
                            forceAdd: false
                        });
                    }
                }

                if (shouldForceDiversify) {
                    base = ensureMinDimensions(base, { minStates: 3, minColors: 3, maxStates: 7, maxColors: 7 });
                } else if (Math.random() < 0.55) {
                    base = ensureMinDimensions(base, { minStates: 3, minColors: 3, maxStates: 7, maxColors: 7, maxPasses: 2 });
                }

                const mutated = this.mutate(base, mutations, false);
                const boosted = boostRuleActivity(mutated, { intensity: 12 });
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
        if (Math.random() < 0.6) {
            base = diversifyStructure(base, {
                maxStates: 7,
                maxColors: 7,
                addStateChance: 0.35,
                addColorChance: 0.65,
                promoteNewColorWritesChance: 0.4,
                forceAdd: false
            });
        }

        if (Math.random() < 0.8) {
            base = ensureMinDimensions(base, { minStates: 3, minColors: 3, maxStates: 7, maxColors: 7, maxPasses: 2 });
        }

        const mutations = 10;
        const mutated = this.mutate(base, mutations, false);
        const boosted = boostRuleActivity(mutated, { intensity: 10 });
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
    if (dynamics.totalRules > 0) {
        if (dynamics.nonZeroWriteFromZeroCount === 0) return false;
        if (dynamics.absorbingColors.length > 0) return false;

        const writeChangeRatio = dynamics.writeChangeCount / dynamics.totalRules;
        const noTurnRatio = 1 - (dynamics.nonNoTurnCount / dynamics.totalRules);
        const selfNextRatio = dynamics.selfNextStateCount / dynamics.totalRules;
        if (writeChangeRatio < 0.22) return false;
        if (noTurnRatio > 0.68) return false;
        if (selfNextRatio > 0.92) return false;
        if (dynamics.nonZeroWriteFromZeroCount < Math.min(2, dynamics.numStates)) return false;
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
    const antCount = 4;
    for (let i = 0; i < antCount; i++) {
        const geometry = this.getSpawnGeometry(strategy, i, antCount, width, height);
        const facing = Math.floor(Math.random() * 4);
        testSim.addAnt(geometry.x, geometry.y, facing);
    }

    // Warm up, then measure sustained grid activity across two windows to reject early-but-short-lived patterns.
    const warmupSteps = 800;
    const measureChunkSteps = 2000;
    const longTailSteps = 9000;

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
    const minNonZeroColors = Math.min(4, Math.max(1, Math.floor((colorCount - 1) / 2)));

    const minChangedCells = Math.max(12, Math.min(300, colorCount * 10));
    const minPaintedCells = Math.max(40, Math.min(800, colorCount * 30));
    const minLateChangedCells = Math.max(10, Math.floor(minChangedCells * 0.55));

    if (changedCells < minChangedCells) return false;
    if (changedCellsLate < minLateChangedCells) return false;
    if (changedCellsLate < changedCells * 0.25) return false;
    if (paintedCells < minPaintedCells) return false;
    if (uniqueNonZeroColors.size < minNonZeroColors) return false;

    const gridC = testSim.grid.slice();
    testSim.update(longTailSteps);

    let changedTail = 0;
    for (let i = 0; i < testSim.grid.length; i++) {
        if (testSim.grid[i] !== gridC[i]) changedTail++;
    }

    if (changedTail < Math.max(10, Math.floor(minChangedCells * 0.5))) return false;
    if (changedTail < changedCellsLate * 0.2) return false;

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

        switch (mode) {
            case 'center': {
                return { x: centerX, y: centerY };
            }
            case 'line': {
                const spacing = 6;
                const offset = index - Math.floor(totalCount / 2);
                return { x: clampX(centerX + offset * spacing), y: centerY };
            }
            case 'vertical': {
                const spacing = 6;
                const offset = index - Math.floor(totalCount / 2);
                return { x: centerX, y: clampY(centerY + offset * spacing) };
            }

            case 'cross': {
                const spacing = 6;
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
                const spacing = 6;
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
                const radius = Math.min(width, height) * 0.15;
                const angle = (index / totalCount) * 2 * Math.PI;
            
                return { 
                    x: clampX(centerX + Math.cos(angle) * radius), 
                    y: clampY(centerY + Math.sin(angle) * radius),
                    angle
                };
            }

            case 'grid3': {
                const spacing = 8;
                const col = index % 3;
                const row = Math.floor(index / 3) % 3;

                return { 
                    x: clampX(centerX + (col - 1) * spacing), 
                    y: clampY(centerY + (row - 1) * spacing) 
                };
            }

            case 'diagonal': {
                const spacing = 6;
                const offset = index - Math.floor(totalCount / 2);

                return { 
                    x: clampX(centerX + offset * spacing), 
                    y: clampY(centerY + offset * spacing) 
                };
            }
                
            case 'corners': {
                const insetX = Math.floor(width * 0.3);
                const insetY = Math.floor(height * 0.3);

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

    const normalMax = 4;
    const normalMin = Math.min(min, normalMax);
    
    if (r < 0.85) 
        return Math.floor(Math.random() * (normalMax - normalMin + 1)) + normalMin;
    {     
    
    const rareMin = Math.max(5, min);
    const rareMax = rareMin + 1;

    return Math.floor(Math.random() * (rareMax - rareMin +1)) + rareMin;    
    }
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
