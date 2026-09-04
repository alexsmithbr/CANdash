# Validation report

Validated on 2026-09-04.

- Production Vinext build: passed
- ESLint: passed with no warnings
- Node test suite: 14/14 passed
- Python bridge syntax compilation: passed
- Prior browser checks retained: radial path alignment, hexadecimal signal search, and live line-history rendering
- Included replay sample: 77,174 classic CAN frames parsed
- Built-in gauges receiving usable sample data: 9/9
- Sample-valid updates by gauge:
  - road speed: 32,026
  - engine speed: 32,204
  - coolant: 644
  - oil pressure: 1,288
  - fuel level: 637
  - battery: 644
  - fuel rate: 6,795
  - barometric pressure: 644
  - tachograph distance: 636

The automated tests cover J1939 identifier extraction, corrected Volare signal
scales, invalid/error encodings, candump nanosecond timestamps, direct DM1,
BAM transport reassembly, DBC parsing, safe formula parsing/evaluation,
`AVG({gauge-id})` formula inputs, zero-value validity, time-based EMA smoothing,
time-weighted/ratio-integral averaging, session min/average/max statistics, and
v0.5 statistics-profile migration, and server-rendered product content. Replay
controls and the configurable circular arc-marker renderer are also checked by
the production TypeScript build.

Browser automation was not repeated for version 0.6 because it was not requested.
The production build and component type-checking cover the marker configuration
controls, per-statistic visibility, optional numeric labels, and radial geometry.

- Supplied generic `j1939.dbc` parser check: 546 messages parsed
- Usable non-placeholder DBC content: 543 messages / 3,818 signals
- DBC import persistence: implemented with browser IndexedDB
- Gauge definitions created from DBC data: self-contained in profiles

Live SocketCAN was not available inside the build environment. The bridge is
small, receive-only, and syntax checked, but should still be exercised on the
target Ubuntu laptop with `vcan0` before the first vehicle connection.
