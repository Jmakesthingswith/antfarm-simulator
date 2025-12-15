/**
 * renderer.js
 * 
 * Handles Canvas API interaction.
 */

class GridRenderer {

    constructor(canvas) {
        this.MIN_DELTA_E = 25; // Minimum Delta E for color distinction
        this.MIN_BACKGROUND_DELTA_E = 38;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency
        this.cellSize = 4; // Default cell size in pixels

        // Tiny parsing canvas used for normalizing arbitrary CSS colors into RGB(A).
        this._colorParseCanvas = document.createElement('canvas');
        this._colorParseCanvas.width = 1;
        this._colorParseCanvas.height = 1;
        this._colorParseCtx = this._colorParseCanvas.getContext('2d', { willReadFrequently: true });

        // Offscreen Canvas for Grid Caching
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: true });

        // Grid Cache
        this.gridCanvas = document.createElement('canvas');
        this.gridCtx = this.gridCanvas.getContext('2d', { alpha: true });
        this.showGrid = false;

        // Cache invalidation flags to prevent stale renders when the simulation swaps buffers (e.g. preset load/reset).
        this._lastGridRef = null;
        this._lastOrientationsRef = null;
        this._needsFullRedraw = true;

        // Palette container (built-ins intentionally removed; main.js drives palette generation/selection).
        this.palettes = {};
        this.currentPalette = this.normalizePalette(['#000000ff', '#32ff0eff']);
        this.palettes.Custom = this.currentPalette;
        this.renderMode = 'default';
        this.use3D = false; // Default to 3D enabled


    }

    // NOTE: _colorParseCtx is intentionally private and used only for color normalization.
    // Do not reuse it for rendering or previews.

    // Palette colors are stored internally as canonical rgba(...) strings.
    // Alpha is preserved internally but is not editable via the color picker.


    _parseColorToRgba(color) {
        const ctx = this._colorParseCtx;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return { r: data[0], g: data[1], b: data[2], a: data[3] };
    }

    _rgbaToCss({ r, g, b, a }) {
        const alpha = Math.max(0, Math.min(1, a / 255));
        const alphaStr = alpha === 1 ? '1' : alpha.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
        return `rgba(${r}, ${g}, ${b}, ${alphaStr})`;
    }

    _rgbToHex6(r, g, b) {
        const to2 = (n) => n.toString(16).padStart(2, '0');
        return `#${to2(r)}${to2(g)}${to2(b)}`;
    }

    srgbChannelToLinear(c) {
        // c is 0.0–1.0
        if (c <= 0.04045) {
            return c / 12.92;
        }
        return Math.pow((c + 0.055) / 1.055, 2.4);
    }

    _rgbToLab(r, g, b) {
    // r, g, b are 0–255 (from Canvas / CSS parsing)

    const R = this.srgbChannelToLinear(r / 255);
    const G = this.srgbChannelToLinear(g / 255);
    const B = this.srgbChannelToLinear(b / 255);

    // Linear RGB → XYZ (D65)
    const X = (R * 0.4124564) + (G * 0.3575761) + (B * 0.1804375);
    const Y = (R * 0.2126729) + (G * 0.7151522) + (B * 0.0721750);
    const Z = (R * 0.0193339) + (G * 0.1191920) + (B * 0.9503041);

    // D65 reference white
    const Xn = 0.95047;
    const Yn = 1.0;
    const Zn = 1.08883;

    const f = (t) =>
        t > 0.008856
            ? Math.cbrt(t)
            : (7.787 * t) + (16 / 116);

    const fx = f(X / Xn);
    const fy = f(Y / Yn);
    const fz = f(Z / Zn);

    return {
        L: (116 * fy) - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz)
    };
}


    _convertToLab(color) {
        const { r, g, b } = this._parseColorToRgba(color);
        return this._rgbToLab(r, g, b);
    }

    // normalizeColor is normalizing to renderer-canonical RGBA CSS strings
    normalizeColor(color) {
        const rgba = this._parseColorToRgba(color);
        return this._rgbaToCss(rgba);
    }

    normalizePalette(colors) {
        return colors.map((c) => this.normalizeColor(c));
    }

    colorToHex6(color) {
        const { r, g, b } = this._parseColorToRgba(color);
        return this._rgbToHex6(r, g, b);
    }

    applyHex6KeepingAlpha(existingColor, hex6Color) {
        const { a } = this._parseColorToRgba(existingColor);
        const { r, g, b } = this._parseColorToRgba(hex6Color);
        return this._rgbaToCss({ r, g, b, a });
    }

    setShowGrid(visible) {
        this.showGrid = visible;
        if (visible) this.drawOffscreenGrid();
    }

    setRenderMode(mode) {
        this.renderMode = mode;
        this._needsFullRedraw = true;
    }

    set3D(enabled) {
        this.use3D = enabled;
    }

    setScale(newScale) {
        this.cellSize = Math.max(1, Math.floor(Math.min(28, newScale)));
        this.resize(this.width, this.height);
        this._needsFullRedraw = true;
    }

    setPalette(name) {
        if (this.palettes[name]) {
            this.currentPalette = this.palettes[name];
            this._needsFullRedraw = true;
        }
    }

    setCustomPalette(colors) {
        const normalized = this.normalizePalette(colors);
        this.currentPalette = normalized;
        this.palettes["Custom"] = normalized;
        this._needsFullRedraw = true;
    }

    // NOTE:
    // Palette generation uses HSL for proposals and CIELAB (ΔE) for distance checks.
    // Avoid introducing additional brightness models without updating the acceptance criteria.
    // Introducing a rule to reject washed out colours to begin adding diff sources of lumin

    generateRandomPalette(count) {
        const palette = [];
        const baseHue = Math.floor(Math.random() * 360);
        const strategies = ['analogous', 'triadic', 'complementary', 'warmCool', 'vibrant'];
        const strategy = strategies[Math.floor(Math.random() * strategies.length)];
        const usedColors = new Set();
        const usedLabByColor = new Map();

         // --- ROLE ASSIGNMENT ---
        const roles = [];
        roles.push('background');

        const accentCount = Math.max(1, Math.floor((count - 1) * 0.32));
        const fieldCount = (count - 1) - accentCount;

        for (let i = 0; i < fieldCount; i++) roles.push('field');
        for (let i = 0; i < accentCount; i++) roles.push('accent');


        const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
        const jitter = (amp) => (Math.random() * amp * 2) - amp;
        const normalizeHue = (h) => ((h % 360) + 360) % 360;

        const background = this.normalizeColor('#000000');
        palette.push(background);
        usedColors.add(background);

        const backgroundLab = this._convertToLab(background);
        usedLabByColor.set(background, backgroundLab);

        for (let i = 1; i < count; i++) {
            let attempts = 0;

            let chosenColor = null;
            let chosenLab = null;

            attemptLoop:
            while (attempts < 30 && !chosenColor) {
                attempts += 1;


                let sat = clamp(78 + jitter(5), 68, 88);
                let light = clamp(50 + jitter(4), 44, 62);

                let hue;
                const drift = Math.min(attempts * 6, 48);
                switch (strategy) {
                    case 'analogous': {
                        hue = baseHue + ((i - 1) * 28) + jitter(10) + (drift * 0.35);
                        break;
                    }
                    case 'complementary': {
                        const pair = (i % 2 === 0) ? 0 : 180;
                        const split = (count > 3 && i > 2) ? ((i % 4 < 2) ? -28 : 28) : 0;
                        hue = baseHue + pair + split + jitter(12) + (drift * 0.45);
                        break;
                    }
                    case 'triadic': {
                        hue = baseHue + (((i - 1) % 3) * 120) + jitter(12) + (drift * 0.35);
                        break;
                    }
                    case 'warmCool': {
                        const isWarm = i % 2 === 0;
                        hue = baseHue + (isWarm ? 45 : 225) + jitter(18) + (drift * 0.35);
                        break;
                    }
                    default: { // vibrant
                        // Golden-angle spacing distributes hues well for arbitrary counts.
                        hue = baseHue + (i * 137.508) + jitter(14) + (drift * 0.25);
                        break;
                    }
                }

                hue = normalizeHue(hue);
                light = light + ((light - 50) * 0.08);

                // Hue-specific tuning to keep perceived brightness more consistent.
                if (hue >= 35 && hue <= 85) { // yellows can blow out
                    sat = clamp(sat, 55, 92);
                    light = clamp(light, 38, 62);
                } else if (hue >= 90 && hue <= 120) { // yellow-green (warmer)
                    sat = clamp(sat, 55, 92);
                    light = clamp(light, 38, 60);
                } else if (hue > 120 && hue <= 160) { // cool green / mint
                    sat = clamp(sat, 50, 78);
                    light = clamp(light, 38, 52);
                } else if (hue >= 200 && hue <= 260) { // blues are often too dark at the same L
                    light = clamp(light + 3, 44, 64);
                } else if (hue >= 260 && hue <= 320) { // purples can go muddy
                    light = clamp(light + 4, 38, 62);
                }
                if (hue >= 25 && hue <= 55) { // orange
                    sat = clamp(sat, 72, 92);
                    light = clamp(light, 52, 70);
                }

                
                const role = roles[i];

                // Role Based Constraints
                if (role === 'field') {
                    sat   = clamp(sat, 45, 75);
                    light = clamp(light, 38, 54);
                }
                
                if (role === 'accent') {
                    sat  = clamp(sat, 65, 95);
                    light = clamp(light, 62, 74);
                }

                if (light > 68 && sat < 45) continue;


                let candidate = `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
                let normalizedCandidate = this.normalizeColor(candidate);
                let candidateLab = this._convertToLab(normalizedCandidate);
            
                const deltaToBg = this.calculateDeltaE(candidateLab, backgroundLab);
                if (deltaToBg < this.MIN_BACKGROUND_DELTA_E) continue;

                // No duplicates
                if (usedColors.has(normalizedCandidate)) continue;


                // Role-aware similarity
                for (const used of usedColors) {
                    const usedLab = usedLabByColor.get(used);
                    const dE = this.calculateDeltaE(candidateLab, usedLab);

                    if (role === 'field' && dE < 20) continue attemptLoop;
                    if (role === 'accent' && dE < 18) continue attemptLoop;
                }

                if (role === 'accent') {
                    for (const used of usedColors) {
                        const usedLab = usedLabByColor.get(used);
                        if (Math.abs(candidateLab.L - usedLab.L) < 12) {
                            continue attemptLoop;
                        }
                    }
                }

                // Extra hierarchy for cool greens to avoid muddy palettes - they are more sensitive to luminance clashes. Needs adjustment.
                const isCoolGreen = hue > 120 && hue <= 160;
                if (isCoolGreen) {
                    for (const used of usedColors) {
                        const usedLab = usedLabByColor.get(used);
                        if (Math.abs(candidateLab.L - usedLab.L) < 16) {
                            continue attemptLoop; // reject this attempt
                        }
                    }
                }

                

                chosenColor = normalizedCandidate;
                chosenLab = candidateLab;

            }

            if (!chosenColor) {
                const fallbackHue = Math.floor(Math.random() * 360);
                chosenColor = this.normalizeColor(`hsl(${fallbackHue}, 75%, 52%)`);
                chosenLab = this._convertToLab(chosenColor);
            }

            usedLabByColor.set(chosenColor, chosenLab);
            usedColors.add(chosenColor);
            palette.push(chosenColor);

        
        
        }

        return palette;
    }
    

    isTooSimilar(candidateColor, usedColors, usedLabByColor = null, candidateLab = null) {
        const minDeltaE = this.MIN_DELTA_E;
        const candidateLabValue = candidateLab || this._convertToLab(candidateColor);
        for (const usedColor of usedColors) {
            let usedLab = usedLabByColor ? usedLabByColor.get(usedColor) : null;
            if (!usedLab) {
                usedLab = this._convertToLab(usedColor);
                if (usedLabByColor) usedLabByColor.set(usedColor, usedLab);
            }
            const deltaE = this.calculateDeltaE(candidateLabValue, usedLab);
            if (deltaE < minDeltaE) {
                return true;
            }
        }
        return false;
    }

    calculateDeltaE(lab1, lab2) {
        // ΔE76 (Euclidean distance in CIELAB)
        const deltaL = lab1.L - lab2.L;
        const deltaA = lab1.a - lab2.a;
        const deltaB = lab1.b - lab2.b;
        return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
    }

    generateLangtonPalette() {
        const background = this.normalizeColor('#000000');
        const backgroundLab = this._convertToLab(background);

        const ACTIVE_LIGHTNESS = 88;
        let active = this.normalizeColor(`hsl(0, 0%, ${ACTIVE_LIGHTNESS}%)`); // Desaturated "white" with tuned lightness.
        const activeLab = this._convertToLab(active);

        // Ensure sufficient contrast between background and active color.
        if (this.calculateDeltaE(backgroundLab, activeLab) < this.MIN_BACKGROUND_DELTA_E) {
            // fallback: force higher contrast
            active = this.normalizeColor(`hsl(0, 0%, 94%)`);
        }


        return [background, active];
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        const pixelWidth = width * this.cellSize;
        const pixelHeight = height * this.cellSize;

        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;

        this.offscreenCanvas.width = pixelWidth;
        this.offscreenCanvas.height = pixelHeight;

        this.gridCanvas.width = pixelWidth;
        this.gridCanvas.height = pixelHeight;

        if (this.showGrid) this.drawOffscreenGrid();
    }

    drawOffscreenGrid() {
        const ctx = this.gridCtx;
        const w = this.gridCanvas.width;
        const h = this.gridCanvas.height;
        const cs = this.cellSize;

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        // Vertical lines
        for (let x = 0; x <= this.width; x++) {
            ctx.moveTo(x * cs, 0);
            ctx.lineTo(x * cs, h);
        }
        // Horizontal lines
        for (let y = 0; y <= this.height; y++) {
            ctx.moveTo(0, y * cs);
            ctx.lineTo(w, y * cs);
        }
        ctx.stroke();
    }
    // Updates the offscreen grid cache
    updateGrid(grid, dirtyCells, forceRedraw = false, orientations = null) {
        if (grid !== this._lastGridRef || orientations !== this._lastOrientationsRef) {
            this._needsFullRedraw = true;
            this._lastGridRef = grid;
            this._lastOrientationsRef = orientations;
        }

        const shouldForceRedraw = forceRedraw || this._needsFullRedraw;
        const hasDirtyCells = dirtyCells && dirtyCells.size > 0;
        if (!shouldForceRedraw && !hasDirtyCells) {
            return false;
        }

        const ctx = this.offscreenCtx;
        const cellSize = this.cellSize;
        const currentPalette = this.currentPalette;
        const paletteLen = currentPalette.length;
        const width = this.width;
        const height = this.height;

        if (!shouldForceRedraw && hasDirtyCells) {
            for (const index of dirtyCells) {
                const x = index % width;
                const y = Math.floor(index / width);
                const state = grid[index];

                // Clear the cell first (transparency)
                ctx.clearRect(x * cellSize, y * cellSize, cellSize, cellSize);

                if (state !== 0) {
                    if (this.renderMode === 'truchet') {
                        const orientation = state & 1;
                        this.drawTruchetCell(ctx, x, y, cellSize, state, currentPalette, paletteLen, orientation);
                    } else {
                        const colorIndex = this.getColorIndex(state, paletteLen);
                        ctx.fillStyle = currentPalette[colorIndex];
                        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                    }
                }
            }
        } else if (shouldForceRedraw) {
            // Full Redraw of Offscreen Canvas
            ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const state = grid[y * width + x];
                    if (state !== 0) {
                        if (this.renderMode === 'truchet') {
                            const orientation = state & 1;
                            this.drawTruchetCell(ctx, x, y, cellSize, state, currentPalette, paletteLen, orientation);
                        } else {
                            // Default Block Rendering
                            const colorIndex = this.getColorIndex(state, paletteLen);
                            ctx.fillStyle = currentPalette[colorIndex];
                            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                        }
                    }
                }
            }
        }
        this._needsFullRedraw = false;
        return true;
    }




    drawTruchetCell(ctx, x, y, size, state, palette, paletteLen, orientation = 0) {
        // State 0 is transparent (handled by clearRect)
        // States 1-4 correspond to rotations/splits
        if (state === 0) return;

        const colorIndex = this.getColorIndex(state, paletteLen);
        const primaryColor = palette[colorIndex];

        const px = x * size;
        const py = y * size;

        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 1;

        ctx.beginPath();
        // Draw two triangles to form the Truchet pattern
        if (orientation % 2 === 0) {
            ctx.moveTo(px, py + size);
            ctx.lineTo(px + size, py);
            ctx.lineTo(px, py);
        } else {
            ctx.moveTo(px, py);
            ctx.lineTo(px + size, py + size);
            ctx.lineTo(px + size, py);
        }
        ctx.fill();
    }

    // Updates the parallax offset based on normalized mouse coordinates (-1 to 1)
    setParallaxOffset(x, y) {
        this.targetParallaxX = x;
        this.targetParallaxY = y;
    }

    // Renders the scene with Parallax Wiggle
    renderScene(ants) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const cellSize = this.cellSize;

        // Blur is intentionally disabled here; palette[0] is the background and we rely on crisp pixels for both modes.
        ctx.filter = 'none';

        ctx.fillStyle = this.currentPalette[0]; // Fill with black to cover edges during wiggle
        ctx.fillRect(0, 0, width, height);

        // Smoothly interpolate current parallax to target
        if (this.use3D) {
            const lerp = 0.1; // Smoothness factor
            if (this.targetParallaxX === undefined) {
                this.targetParallaxX = 0;
                this.targetParallaxY = 0;
                this.currentParallaxX = 0;
                this.currentParallaxY = 0;
            }
            this.currentParallaxX += (this.targetParallaxX - this.currentParallaxX) * lerp;
            this.currentParallaxY += (this.targetParallaxY - this.currentParallaxY) * lerp;
        } else {
            this.currentParallaxX = 0;
            this.currentParallaxY = 0;
        }

        const maxOffset = 15; // Max pixels to shift
        const bgX = this.currentParallaxX * maxOffset;
        const bgY = this.currentParallaxY * maxOffset;

        if (this.showGrid) {
            ctx.drawImage(this.gridCanvas, bgX, bgY);
        }

        const parallaxMult = 2.0;
        const fgX = bgX * parallaxMult;
        const fgY = bgY * parallaxMult;

        ctx.drawImage(this.offscreenCanvas, fgX, fgY);

        for (const ant of ants) {
            const antX = (ant.x * cellSize) + fgX;
            const antY = (ant.y * cellSize) + fgY;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(antX, antY, cellSize, cellSize);

            ctx.fillStyle = '#FF0000';
            const half = cellSize / 2;
            const qtr = cellSize / 4;
            let hx = antX + half;
            let hy = antY + half;

            switch (ant.facing) {
                case 0: hy -= qtr; break; // N
                case 1: hx += qtr; break; // E
                case 2: hy += qtr; break; // S
                case 3: hx -= qtr; break; // W
            }

            ctx.fillRect(hx - 1, hy - 1, 2, 2);
        }
    }

    getColorIndex(state, paletteLen) {
        // Palette slot 0 is always the background; active states begin at 1 and wrap across the remaining entries.
        if (paletteLen <= 1) return 0;
        return ((state - 1) % (paletteLen - 1)) + 1;
    }
}
export { GridRenderer };
