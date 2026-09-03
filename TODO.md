# TODO status

The supplied TODO instructions were reviewed before implementation. Existing
partial features were extended rather than duplicated.

- [x] Create an `AGENTS.md` file.
- [x] Fix the plotting/layout error shown in `TODO/plot_error.png`.
- [x] Allow a gauge to be edited.
- [x] Allow adding a DBC file.
- [x] In Discover, show matching DBC messages and signal counts.
- [x] Add a temperature/thermometer gauge.
- [x] Add a pressure/manometer gauge.
- [x] Add common and custom-linear unit conversion.
- [x] Add safe formula gauges using other gauge IDs as inputs.
- [x] Add replay play/pause and a draggable seek timeline.
- [x] Correct radial-gauge geometry by drawing value and track on one fixed SVG path.
- [x] Add a scrolling line-history gauge (including legacy histogram profiles).
- [x] Make the DBC signal picker searchable by signal, PGN, source address, and CAN ID.
- [x] Add configurable EMA and rolling-mean smoothing.
- [x] Add session-long time-weighted and ratio-of-integrals averages.
- [ ] When we hit Pause, gauges understand no data is coming through, but in fact they should exactly pause i.e. freeze.
- [ ] Add the playback speed option within the draggable seek timeline rectangle, so the user can select the playback speed directly from the main ui.
- [ ] Allow gauges to display max, min and avg values through small horizontal bars along the gauge painted area. Add a small label to each bar, such as "min", "max", "avg". Make the bar color different for avg and use the same color for max and min.
- [ ] When fuel rate is zero but it still alive i.e. values still coming through, do not consider it 'dead'. Zero is a valid value. If we consider it dead, a gauge such as { vehicle-speed } / { fuel-rate } will become misleading.
- [ ] Allow using averages in custom gauges. It is desirable to calculate the average km/h by using a formula which would say something as "AVG(km/h) / AVG(Liters of fuel/h)".

## Deliberate boundary

Session-long statistics reset with the data source. Persisting multi-trip or
lifetime totals across browser restarts remains future work.
