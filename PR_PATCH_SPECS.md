# PR-Sized Patch Specifications (Top 3)

This document contains three independent, PR-sized patch prompts. Apply **one patch at a time** and stop after each patch so the change can be inspected and reviewed before starting the next.

Each patch prompt includes strict rules to preserve structural integrity, plus a required “junior-readable” change list.

---

## Patch 1 — Fix Palette Editing: Make `input[type="color"]` Always Work

### Goal
Ensure the palette editor UI always works, including for randomly generated palettes. Today, palettes can include `hsl(...)` strings (and 8-digit hex), which are not accepted by `input[type="color"]` (expects `#RRGGBB`).

### Scope
- Only touch palette generation/handling and the palette editor wiring.
- No feature redesign; this is a compatibility + correctness fix.

### Structural Integrity Rules (Strict)
1. Keep module boundaries intact: `renderer.js` remains rendering/palette logic; `main.js` remains UI/event wiring.
2. No new dependencies, no bundlers, no network calls, no build system changes.
3. Do not change the meaning of palette slot `0` (background) or how color indices map to states.
4. Preserve import/export JSON shape and backwards compatibility with existing exported JSON files.
5. Avoid unrelated refactors (no formatting-only diffs, no renames unless required).
6. Every new helper must be small, testable by inspection, and used immediately (no “future use” utilities).

### Required Design
- Internally, you may keep palette colors as any CSS color string **for drawing**, but the color picker must always be given a valid `#RRGGBB`.
- When the user edits a swatch via the color picker, store the chosen color as `#RRGGBB` (or an agreed internal representation), and ensure rendering uses the updated value correctly.
- Decide on one of these approaches (pick one and justify briefly in the PR notes):
  - **Approach A:** Normalize palettes to `#RRGGBB` at generation/import time (preferred for simplicity).
  - **Approach B:** Keep arbitrary CSS colors internally but convert to/from `#RRGGBB` only at the UI boundary.

### Acceptance Criteria
- Clicking/dragging any palette swatch works for:
  - “Classic” palette
  - Randomly generated palette
  - Imported JSON palettes
- No runtime console errors from the palette editor.
- Rendering output remains visually consistent (no unexpected color index shifts).

### Implementation Notes / Hints
- Add a small color normalization function (e.g., convert `hsl(...)` → computed RGB → `#RRGGBB`) using a browser-safe technique.
- Handle 8-digit hex (`#RRGGBBAA`) by stripping alpha for the `<input>` value while retaining intended appearance (document your decision).

### Required Output (in the PR description)
- A **detailed list of changes**, written so a junior developer can learn from it. For each bullet:
  - file path
  - what changed
  - why it changed
  - how to manually verify it

---

## Patch 2 — Remove Unused Simulation Snapshot Overhead (or Wire It Properly)

### Goal
Eliminate ongoing CPU/memory overhead from `AntSimulation`’s internal snapshot/history system if it’s not being used by the UI. Currently, snapshots are taken every `SNAPSHOT_INTERVAL` steps, but there is no callsite that uses `restore()`.

### Scope
- Tight, PR-sized change focused on performance and clarity.
- Do **not** redesign undo/redo (the app-level undo/redo in `main.js` stays as-is).

### Structural Integrity Rules (Strict)
1. Do not change any UI behavior (undo/redo buttons, import/export, speed control) unless strictly necessary to remove the overhead.
2. Do not alter the simulation stepping semantics, wrapping behavior, or rule interpretation.
3. Do not introduce new state persistence formats.
4. Prefer deletion/disablement over adding more complexity.
5. If you keep the feature, it must be reachable and used by the app; “dead code” is not allowed after this patch.
6. Keep changes minimal and localized—no sweeping refactors.

### Required Design (Pick One)
- **Option A (Preferred):** Remove/disable the internal snapshot/history system from `simulation.js` entirely, since `main.js` already provides history via snapshots.
  - This includes removing `history`, `historyLimit`, `SNAPSHOT_INTERVAL`, `snapshot()`, and `restore()` if unused after verification.
- **Option B:** Wire `AntSimulation.restore()` into a real UI affordance (a separate “Sim Rewind” feature), but only if it stays PR-sized and doesn’t conflict with existing undo/redo semantics.

### Acceptance Criteria
- No functionality regressions in existing undo/redo (app-level).
- Simulation performance does not degrade (should improve slightly at higher SPS).
- Codebase has no unused snapshot system after the patch (either removed or integrated).

### Required Output (in the PR description)
- A **detailed list of changes** (junior-readable), including:
  - what was removed/changed
  - what observable behavior stays the same
  - what performance impact you expect and why
  - manual verification steps (how to confirm undo/redo still works)

---

## Patch 3 — Reduce Dirty-Cell Work: Only Mark What Actually Changes

### Goal
Reduce unnecessary grid redraw work by tightening when cells are marked dirty. Currently, each visited cell is added to `dirtyCells` even if the cell’s value doesn’t change.

### Scope
- Simulation dirty tracking + rendering invalidation only.
- No visual redesign and no changes to how ants are drawn (ants are drawn each frame already).

### Structural Integrity Rules (Strict)
1. Preserve the rule execution order and movement logic exactly.
2. Preserve the “ants are drawn separately from the grid” architecture.
3. Dirty-cell behavior must remain correct for:
  - normal render mode
  - Truchet render mode (orientation-driven)
  - orientation toggling mode (if enabled)
4. Don’t change the public API shape of `AntSimulation` unless necessary; if you must, update all callsites.
5. Any optimization must be correctness-first: never skip a needed redraw.
6. Keep the change PR-sized and easy to review.

### Required Design
- In `simulation.update()`:
  - Only add a cell to `dirtyCells` when the written grid value changes **or** the orientation value changes.
  - Do **not** mark a cell dirty merely because an ant “vacated” it; ants are drawn on top each frame and the base grid is already cached.
- In the render loop:
  - Ensure ants still render correctly when paused/stepping and when the grid is not redrawn on every tick.

### Acceptance Criteria
- Visual output remains correct:
  - No “stuck ant trails” or artifacts after ants move.
  - No missing tile updates in Truchet mode when orientation toggles.
- Measurable reduction in dirty set size during steady-state runs (confirm via temporary logging during development, removed before final).

### Required Output (in the PR description)
- A **detailed list of changes** (junior-readable) including:
  - what condition(s) now trigger dirty marking
  - why it’s safe given the rendering architecture
  - how to manually verify correctness (pause/step, high SPS, Truchet on/off)

