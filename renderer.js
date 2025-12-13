/**
 * renderer.js
 * 
 * Handles Canvas API interaction.
 */

class GridRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency
        this.cellSize = 4; // Default cell size in pixels

        // Offscreen Canvas for Grid Caching
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: true });

        // Grid Cache
        this.gridCanvas = document.createElement('canvas');
        this.gridCtx = this.gridCanvas.getContext('2d', { alpha: true });
        this.showGrid = false;

        // Color Palettes (Max 5 colors per theme)
        this.palettes = {
            "Classic": [
                '#000000', '#FFFFFF'
            ],
            "Spectral": [
                '#000000', '#FF0000', '#FFFF00', '#00FF00', '#0000FF'
            ],
            "Neon": [
                '#000000', '#00f3ff', '#ff00aa', '#bc13fe', '#00ff9f'
            ],
            "Terminal": [
                '#000000', '#00FF00', '#00CC00', '#009900', '#33FF33'
            ],
            "Glitch": [
                '#000000', '#00FFFF', '#FF00FF', '#FFFF00', '#FFFFFF'
            ],
            "Pastel Dream": [
                '#000000', '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf'
            ],
            "Oceanic": [
                '#000000', '#0074D9', '#7FDBFF', '#39CCCC', '#3D9970'
            ],
            "Magma": [
                '#000000', '#ff0000', '#ff4d00', '#ff9900', '#ffcc00'
            ],
            "Cyberpunk": [
                '#000000', '#ff0055', '#00ffcc', '#ffff00', '#ff00ff'
            ],
            "Deep Space": [
                '#000000', '#4b0082', '#8a2be2', '#9370db', '#e6e6fa'
            ],
            "Matrix": [
                '#000000', '#003300', '#006600', '#009900', '#00cc00'
            ]
        };

        this.currentPalette = this.palettes["Classic"];
        this.renderMode = 'default';
        this.use3D = false; // Default to 3D enabled


    }

    setShowGrid(visible) {
        this.showGrid = visible;
        if (visible) this.drawOffscreenGrid();
    }

    setRenderMode(mode) {
        this.renderMode = mode;
    }

    set3D(enabled) {
        this.use3D = enabled;
    }

    setScale(newScale) {
        this.cellSize = Math.max(1, Math.floor(Math.min(28, newScale)));
        this.resize(this.width, this.height);
    }

    setPalette(name) {
        if (this.palettes[name]) {
            this.currentPalette = this.palettes[name];
        }
    }

    setCustomPalette(colors) {
        this.currentPalette = colors;
        this.palettes["Custom"] = colors;
    }

    generateRandomPalette(count) {
        const palette = [];
        const baseHue = Math.floor(Math.random() * 360);
        const strategies = ['analogous', 'triadic', 'complementary', 'vibrant'];
        const strategy = strategies[Math.floor(Math.random() * strategies.length)];
        const normalize = (color) => color.toLowerCase();
        const usedColors = new Set();

        // 1. Generate Background (Color 0) - Constant Black
        const background = '#1a1a1a';
        palette.push(background);
        usedColors.add(normalize(background));

        // 2. Generate Active Colors (ensure no duplicates)
        for (let i = 1; i < count; i++) {
            let hue, sat, light, candidate, attempts = 0;
            const TARGET_SAT = 55 + Math.random() * 15; // Range: 55% to 70%
            const TARGET_LIGHT = 35 + Math.random() * 10; // Range: 35% to 45% (Darker)
            do {
                if (strategy === 'analogous') {
                    hue = (baseHue + (i * 20) + attempts * 7) % 360;
                    sat = 60 + Math.random() * 15;
                    light = 40 + Math.random() * 10;
                } else if (strategy === 'complementary') {
                    hue = ((i % 2 === 0) ? baseHue : (baseHue + 180)) % 360;
                    hue = (hue + attempts * 11) % 360;
                    sat = TARGET_SAT;
                    light = TARGET_LIGHT;
                } else if (strategy === 'triadic') {
                    hue = (baseHue + (i * 120) + attempts * 13) % 360;
                    sat = TARGET_SAT;
                    light = TARGET_LIGHT;
                } else { // Vibrant / Random Pop
                    hue = (baseHue + (i * 90) + attempts * 17) % 360; // Wide spread with jitter
                    sat = 70 + Math.random() * 20;
                    light = TARGET_LIGHT;
                }
                candidate = `hsl(${hue}, ${sat}%, ${light}%)`;
                attempts++;
                // After several attempts, fall back to a random hue to force uniqueness
                if (attempts > 8) {
                    const fallbackHue = Math.floor(Math.random() * 360);
                    candidate = `hsl(${fallbackHue}, 60%, 40%)`;
                }
            } while (usedColors.has(normalize(candidate)) && attempts < 12);

            usedColors.add(normalize(candidate));
            palette.push(candidate);
        }
        return palette;
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
        const hasDirtyCells = dirtyCells && dirtyCells.size > 0;
        if (!forceRedraw && !hasDirtyCells) {
            return false;
        }

        const ctx = this.offscreenCtx;
        const cellSize = this.cellSize;
        const currentPalette = this.currentPalette;
        const paletteLen = currentPalette.length;
        const width = this.width;
        const height = this.height;

        if (!forceRedraw && hasDirtyCells) {
            for (const index of dirtyCells) {
                const x = index % width;
                const y = Math.floor(index / width);
                const state = grid[index];

                // Clear the cell first (transparency)
                ctx.clearRect(x * cellSize, y * cellSize, cellSize, cellSize);

                if (state !== 0) {
                    if (this.renderMode === 'truchet') {
                        const orientation = orientations ? orientations[index] : 0;
                        this.drawTruchetCell(ctx, x, y, cellSize, state, currentPalette, paletteLen, orientation);
                    } else {
                        const colorIndex = this.getColorIndex(state, paletteLen);
                        ctx.fillStyle = currentPalette[colorIndex];
                        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                    }
                }
            }
        } else if (forceRedraw) {
            // Full Redraw of Offscreen Canvas
            ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const state = grid[y * width + x];
                    if (state !== 0) {
                        if (this.renderMode === 'truchet') {
                            const orientation = orientations ? orientations[y * width + x] : 0;
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
        return true;
    }




    drawTruchetCell(ctx, x, y, size, state, palette, paletteLen, orientation = 0) {
        // State 0 is transparent (handled by clearRect)
        // States 1-4 correspond to rotations/splits
        if (state === 0) {
            return;
        }

        // Primary Color Index
        const colorIndex = this.getColorIndex(state, paletteLen);
        const primaryColor = palette[colorIndex];
        const secondaryColor = palette[0]; // Background

        const px = x * size;
        const py = y * size;

        // Draw Background
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(px, py, size, size);

        ctx.fillStyle = primaryColor;

        // Draw Triangle based on orientation (0: '/', 1: '\')
        ctx.beginPath();
        if (orientation % 2 === 0) { // /
            ctx.moveTo(x * size, y * size + size);
            ctx.lineTo(x * size + size, y * size);
            ctx.lineTo(x * size, y * size);
        } else { // \
            ctx.moveTo(x * size, y * size);
            ctx.lineTo(x * size + size, y * size + size);
            ctx.lineTo(x * size + size, y * size);
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

        // Clear Main Canvas
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

        // Calculate Pixel Offsets
        const maxOffset = 15; // Max pixels to shift
        const bgX = this.currentParallaxX * maxOffset;
        const bgY = this.currentParallaxY * maxOffset;

        // 1. Draw Grid (if enabled)
        if (this.showGrid) {
            ctx.drawImage(this.gridCanvas, bgX, bgY);
        }

        // Draw Ants (Foreground) - Parallax slightly MORE for depth
        const parallaxMult = 2.0;
        const fgX = bgX * parallaxMult;
        const fgY = bgY * parallaxMult;

        // 3. Draw Active Cells (Transparent background)
        ctx.drawImage(this.offscreenCanvas, fgX, fgY);

        for (const ant of ants) {
            const antX = (ant.x * cellSize) + fgX;
            const antY = (ant.y * cellSize) + fgY;

            // Draw Body
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(antX, antY, cellSize, cellSize);

            // Draw Head
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
