# Validation report

Validated on 2026-09-03.

- Production Vinext build: passed
- ESLint: passed with no warnings
- Node test suite: 11/11 passed
- Python bridge syntax compilation: passed
- Browser visual check: radial value track remained coincident with its background at high values
- Browser interaction check: signal search filtered by hexadecimal PGN (`fef7`)
- Browser interaction check: live demo values rendered in the scrolling line-history gauge
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
time-based EMA smoothing, time-weighted/ratio-integral averaging, and
server-rendered product content.

- Supplied generic `j1939.dbc` parser check: 546 messages parsed
- Usable non-placeholder DBC content: 543 messages / 3,818 signals
- DBC import persistence: implemented with browser IndexedDB
- Gauge definitions created from DBC data: self-contained in profiles

Live SocketCAN was not available inside the build environment. The bridge is
small, receive-only, and syntax checked, but should still be exercised on the
target Ubuntu laptop with `vcan0` before the first vehicle connection.
