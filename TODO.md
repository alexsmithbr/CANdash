# TODO status

The supplied TODO instructions were reviewed before implementation. Existing
partial features were extended rather than duplicated.

- [x] Create an `AGENTS.md` file.
  - 2026-09-03 — Documented the project architecture, receive-only safety boundary, profile contract, testing rules, and coding conventions.
- [x] Fix the plotting/layout error shown in `TODO/plot_error.png`.
  - 2026-09-03 — Rebuilt circular gauges around one fixed SVG path so the progress stroke remains inside the track throughout the range.
- [x] Allow a gauge to be edited.
  - 2026-09-03 — Added edit controls that reopen the gauge definition and preserve its stable profile ID.
- [x] Allow adding a DBC file.
  - 2026-09-03 — Added local DBC parsing, IndexedDB persistence, listing, and removal.
- [x] In Discover, show matching DBC messages and signal counts.
  - 2026-09-03 — Matched observed source-address/PGN pairs to imported DBC messages and exposed usable signal counts.
- [x] Add a temperature/thermometer gauge.
  - 2026-09-03 — Added a dedicated vertical thermometer renderer with stale-state handling.
- [x] Add a pressure/manometer gauge.
  - 2026-09-03 — Added pressure as a supported circular-gauge type with unit-aware automatic selection.
- [x] Add common and custom-linear unit conversion.
  - 2026-09-03 — Added conversion presets plus user-defined scale, offset, and display unit.
- [x] Add safe formula gauges using other gauge IDs as inputs.
  - 2026-09-03 — Added a restricted expression parser and evaluator without JavaScript execution.
- [x] Add replay play/pause and a draggable seek timeline.
  - 2026-09-03 — Added replay transport controls, progress, looping, and seekable capture position.
- [x] Correct radial-gauge geometry by drawing value and track on one fixed SVG path.
  - 2026-09-03 — Used matching path geometry and dash length for track and live value rendering.
- [x] Add a scrolling line-history gauge (including legacy histogram profiles).
  - 2026-09-03 — Added a time-windowed line plot and migration of the former histogram type.
- [x] Make the DBC signal picker searchable by signal, PGN, source address, and CAN ID.
  - 2026-09-03 — Replaced the long selector with a searchable combobox covering all signal identifiers.
- [x] Add configurable EMA and rolling-mean smoothing.
  - 2026-09-03 — Added time-based exponential and rolling display filters with per-gauge periods.
- [x] Add session-long time-weighted and ratio-of-integrals averages.
  - 2026-09-03 — Added session accumulation for ordinary values and physically meaningful rate ratios.
- [x] Freeze gauge freshness, values, statistics, and update indicators while replay is paused.
  - 2026-09-04 — Introduced a logical session clock that excludes time spent paused.
- [x] Put the live playback-speed selector in the main replay timeline.
  - 2026-09-04 — Moved speed selection beside the active replay controls and made changes apply immediately.
- [x] Add optional session min / average / max markers to gauges.
  - 2026-09-04 — Added session statistics collection and opt-in visual markers.
- [x] Treat zero as a fresh valid reading and show unavailable for non-finite formula results.
  - 2026-09-04 — Removed truthiness-based liveness checks and explicitly rejected undefined numeric results.
- [x] Allow session averages in formulas with `AVG({gauge-id})`.
  - 2026-09-04 — Extended formula parsing and evaluation with time-weighted session-average references.
- [x] Put individually configurable MIN, AVG, and MAX markers on circular gauge arcs.
  - 2026-09-04 — Replaced the separate statistics strip with radial strokes at their actual values, plus master, per-marker, and numeric-value visibility switches with v0.5 profile compatibility.

## Deliberate boundary

Session-long statistics reset with the data source. Persisting multi-trip or
lifetime totals across browser restarts remains future work.
