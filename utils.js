/**
 * Deep-clones JSON-like values and common typed arrays.
 * @param {*} value - Value to clone.
 * @returns {*} Cloned value.
 */
export const cloneStructured = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => cloneStructured(item));
    }
    if (value instanceof Uint8Array) {
        return value.slice();
    }
    if (value && typeof value === 'object') {
        const clone = {};
        for (const key of Object.keys(value)) {
            clone[key] = cloneStructured(value[key]);
        }
        return clone;
    }
    return value;
};
